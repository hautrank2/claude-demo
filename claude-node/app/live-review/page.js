"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./live-review.css";

const IDLE_MS = 400;        // only the sentence still being typed waits for a pause
const MIN_CHARS = 15;       // don't review a sentence that has barely started
const MAX_PARALLEL = 4;
const CONTEXT_CHARS = 3000; // preceding text sent along for the "does this follow" check
const STORAGE_KEY = "live-review:text";
const BRIEF_KEY = "live-review:brief";
const STRICTNESS_KEY = "live-review:strictness";
const LABELS = { spelling: "Spelling", grammar: "Grammar", style: "Style", logic: "Flow", content: "Content" };
const PRICE_PER_MTOK = { input: 1, output: 5 }; // Claude Haiku 4.5, USD

// Splits the text into sentences. `closed` means it ends with sentence punctuation.
function sentences(text) {
  const out = [];
  for (const line of text.matchAll(/[^\n]+/g)) {
    let open = null; // pieces too short to review alone are merged into the next one
    for (const m of line[0].matchAll(/.+?(?:[.!?…]+["'”’)\]]*(?=\s|$)|$)/g)) {
      const start = open ?? line.index + m.index;
      const end = line.index + m.index + m[0].length;
      const raw = text.slice(start, end);
      const trimmed = raw.trim();
      const last = end === line.index + line[0].length;
      if (trimmed.length < MIN_CHARS && !last) { open = start; continue; }
      open = null;
      if (!trimmed) continue;
      const at = start + raw.indexOf(trimmed);
      out.push({ text: trimmed, start: at, end: at + trimmed.length, closed: /[.!?…]["'”’)\]]*$/.test(trimmed) });
    }
  }
  return out;
}

function esc(s) {
  return s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);
}

// The editor drives the DOM directly (highlight mirror, undo-friendly edits), so React only renders the shell.
function mount() {
  const ta = document.getElementById("text");
  const briefEl = document.getElementById("brief");
  const strictnessEl = document.getElementById("strictness");
  const backdrop = document.getElementById("backdrop");
  const list = document.getElementById("comments");
  const statusEl = document.getElementById("status");
  const unmount = new AbortController();

  // Reviews are keyed by sentence text, so finished sentences stay reviewed while the next one is typed.
  const cache = new Map();    // sentence text -> comments
  const inflight = new Map(); // sentence text -> AbortController
  const queue = [];
  let shown = [];             // comments last rendered, per sentence index
  let spans = [];
  let lastError = "";
  let timer;
  const usage = { requests: 0, input: 0, output: 0 };

  function render() {
    const text = ta.value;
    spans = [];
    shown = sentences(text).map((p, pi) => {
      const fresh = cache.get(p.text);
      // While a sentence is being re-reviewed, keep its previous comments (dimmed) instead of flickering.
      const comments = (fresh ?? shown[pi] ?? []).filter((c) => p.text.includes(c.quote));
      for (const c of comments) {
        const start = p.start + p.text.indexOf(c.quote);
        spans.push({ start, end: start + c.quote.length, c, pi, stale: !fresh });
      }
      return comments;
    });
    spans.sort((a, b) => a.start - b.start);

    let html = "";
    let pos = 0;
    spans.forEach((s, i) => {
      if (s.start < pos) return; // overlaps the previous highlight; the card is still listed
      html += esc(text.slice(pos, s.start));
      html += `<mark class="${s.c.category}${s.stale ? " stale" : ""}" data-i="${i}">${esc(text.slice(s.start, s.end))}</mark>`;
      pos = s.end;
    });
    backdrop.innerHTML = html + esc(text.slice(pos)) + "\n";

    list.replaceChildren(...spans.map(card));
    if (!spans.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = text.trim() ? "No comments yet." : "Comments will show up here as you write.";
      list.append(empty);
    }
    updateStatus();
  }

  function card(s, i) {
    const el = document.createElement("div");
    el.className = `card ${s.c.category}${s.stale ? " stale" : ""}`;

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = LABELS[s.c.category] ?? s.c.category;

    const quote = document.createElement("div");
    quote.className = "quote";
    if (s.c.suggestion) {
      const from = document.createElement("s");
      from.textContent = s.c.quote;
      const to = document.createElement("b");
      to.textContent = s.c.suggestion;
      quote.append(from, " → ", to);
    } else {
      quote.textContent = `“${s.c.quote}”`;
    }

    const message = document.createElement("div");
    message.className = "message";
    message.textContent = s.c.message;

    const actions = document.createElement("div");
    actions.className = "actions";
    if (s.c.suggestion) actions.append(button("Apply", "primary", () => apply(s)));
    actions.append(button("Dismiss", "", () => dismiss(s)));

    el.append(badge, quote, message, actions);
    el.addEventListener("click", () => {
      ta.focus();
      ta.setSelectionRange(s.start, s.end);
    });
    const mark = () => backdrop.querySelector(`mark[data-i="${i}"]`);
    el.addEventListener("mouseenter", () => mark()?.classList.add("active"));
    el.addEventListener("mouseleave", () => mark()?.classList.remove("active"));
    return el;
  }

  function button(label, className, onClick) {
    const el = document.createElement("button");
    el.textContent = label;
    el.className = className;
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return el;
  }

  function apply(s) {
    const rest = shown[s.pi].filter((c) => c !== s.c);
    const count = shown.length;
    ta.setRangeText(s.c.suggestion, s.start, s.end, "end");
    // Carry the sentence's other comments over to its new text so the fix doesn't cost another review.
    const after = sentences(ta.value);
    const edited = after[s.pi];
    if (!s.stale && after.length === count) cache.set(edited.text, rest.filter((c) => edited.text.includes(c.quote)));
    ta.focus();
    changed();
  }

  function dismiss(s) {
    shown[s.pi] = shown[s.pi].filter((c) => c !== s.c);
    if (!s.stale) cache.set(sentences(ta.value)[s.pi].text, shown[s.pi]);
    render();
  }

  // Finished sentences are sent right away; the one under the caret waits for `includeOpen`.
  function schedule(includeOpen) {
    const text = ta.value;
    const caret = ta.selectionStart;
    const all = sentences(text);
    const live = new Set(all.map((p) => p.text));
    for (const [key, controller] of inflight) if (!live.has(key)) controller.abort();

    queue.length = 0;
    for (const p of all) {
      if (p.text.length < MIN_CHARS || cache.has(p.text) || inflight.has(p.text)) continue;
      const typing = !p.closed && caret >= p.start && caret <= p.end + 1;
      if (typing && !includeOpen) continue;
      if (queue.some((job) => job.passage === p.text)) continue;
      queue.push({ passage: p.text, before: text.slice(Math.max(0, p.start - CONTEXT_CHARS), p.start), brief: briefEl.value.trim(), strictness: strictnessEl.value });
    }
    pump();
  }

  function pump() {
    while (inflight.size < MAX_PARALLEL && queue.length) review(queue.shift());
    updateStatus();
  }

  async function review(job) {
    const controller = new AbortController();
    inflight.set(job.passage, controller);
    try {
      const res = await fetch("/api/live-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      cache.set(job.passage, data.comments);
      usage.requests += 1;
      usage.input += data.usage.input;
      usage.output += data.usage.output;
      lastError = "";
    } catch (err) {
      if (err.name !== "AbortError") lastError = err.message;
    } finally {
      if (inflight.get(job.passage) === controller) inflight.delete(job.passage);
      if (!unmount.signal.aborted) {
        render();
        pump();
      }
    }
  }

  function updateStatus() {
    const cost = (usage.input * PRICE_PER_MTOK.input + usage.output * PRICE_PER_MTOK.output) / 1e6;
    document.getElementById("usage").textContent = usage.requests
      ? `${usage.requests} requests · ${usage.input.toLocaleString()} in / ${usage.output.toLocaleString()} out · ~$${cost.toFixed(4)}`
      : "";
    const busy = inflight.size + queue.length;
    statusEl.classList.toggle("error", !busy && !!lastError);
    if (busy) statusEl.textContent = "Reading…";
    else if (lastError) statusEl.textContent = `Error: ${lastError}`;
    else if (ta.value.trim()) statusEl.textContent = spans.length === 1 ? "1 comment" : `${spans.length} comments`;
    else statusEl.textContent = "";
  }

  function changed() {
    try { localStorage.setItem(STORAGE_KEY, ta.value); } catch {}
    render();
    schedule(false);
    clearTimeout(timer);
    timer = setTimeout(() => schedule(true), IDLE_MS);
  }

  // A new brief or strictness means every sentence is reviewed again.
  function settingsChanged() {
    try {
      localStorage.setItem(BRIEF_KEY, briefEl.value);
      localStorage.setItem(STRICTNESS_KEY, strictnessEl.value);
    } catch {}
    for (const controller of inflight.values()) controller.abort();
    inflight.clear();
    cache.clear();
    shown = [];
    changed();
  }

  const { signal } = unmount;
  ta.addEventListener("input", () => changed(), { signal });

  document.getElementById("clear").addEventListener("click", () => {
    ta.focus();
    ta.select();
    // execCommand keeps the deletion on the undo stack, so Ctrl+Z brings the draft back.
    if (!document.execCommand("delete")) ta.value = "";
    changed();
  }, { signal });

  // "change" fires when the brief loses focus, not per keystroke.
  briefEl.addEventListener("change", settingsChanged, { signal });
  strictnessEl.addEventListener("change", settingsChanged, { signal });

  try {
    ta.value = localStorage.getItem(STORAGE_KEY) ?? "";
    briefEl.value = localStorage.getItem(BRIEF_KEY) ?? "";
    strictnessEl.value = localStorage.getItem(STRICTNESS_KEY) ?? "balanced";
  } catch {}
  changed();

  return () => {
    unmount.abort();
    clearTimeout(timer);
    queue.length = 0;
    for (const controller of inflight.values()) controller.abort();
  };
}

export default function LiveReview() {
  useEffect(mount, []);

  return (
    <div className="live-review">
      <header>
        <Link className="back" href="/">← Demos</Link>
        <h1>Live Review</h1>
        <span id="status"></span>
        <span id="usage"></span>
      </header>
      <main>
        <div className="column">
          <label htmlFor="brief">About this piece <span>(optional)</span></label>
          <textarea id="brief" rows={2} spellCheck={false}
            placeholder="What are you writing, who is it for, and in what tone? e.g. “A blog post introducing React hooks to beginners, friendly and informal.”" />
          <div className="row">
            <label htmlFor="text">Draft</label>
            <label htmlFor="strictness"><span>Strictness</span></label>
            <select id="strictness" defaultValue="balanced">
              <option value="relaxed">Relaxed</option>
              <option value="balanced">Balanced</option>
              <option value="strict">Strict</option>
            </select>
            <button id="clear">Clear</button>
          </div>
          <div className="editor">
            <div id="backdrop" aria-hidden="true"></div>
            <textarea id="text" rows={1} spellCheck={false} autoFocus
              placeholder="Start writing. Comments appear alongside as you finish each sentence…" />
          </div>
        </div>
        <aside id="comments"></aside>
      </main>
    </div>
  );
}
