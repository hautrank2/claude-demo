"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MODELS } from "@/lib/models";
import "./model-compare.css";

const TABS = [
  { mode: "chat", label: "Chat", placeholder: "Ask something. Every model answers at the same time…", action: "Ask" },
  { mode: "web", label: "Web", placeholder: "Describe a page, e.g. “a pricing page with 3 plans”. Every model builds it…", action: "Build" },
];

const dollars = (v) => `$${v < 0.01 ? v.toFixed(5) : v.toFixed(4)}`;

function metricsOf(model, run) {
  if (run?.status !== "done") return null;
  return {
    ttft: run.ttft ?? run.total,
    total: run.total,
    // Output tokens include thinking, so this is generation speed over the whole request.
    speed: run.usage.output / run.total,
    output: run.usage.output,
    cost: (run.usage.input * model.input + run.usage.output * model.output) / 1e6,
  };
}

// The model is told to send bare HTML, but strip a markdown fence if it adds one anyway.
function extractHtml(text) {
  const fenced = text.match(/```(?:html)?\s*\n([\s\S]*?)(?:```|$)/);
  return (fenced ? fenced[1] : text).trim();
}

const fmtSeconds = (v) => `${v.toFixed(2)}s`;
const ROWS = [
  { label: "Best for", spec: (m) => m.tagline },
  { label: "Input price", spec: (m) => `$${m.input} / 1M tokens` },
  { label: "Output price", spec: (m) => `$${m.output} / 1M tokens` },
  { label: "Context window", spec: (m) => `${m.context} tokens` },
  { label: "First token", key: "ttft", format: fmtSeconds, lowerIsBetter: true },
  { label: "Total time", key: "total", format: fmtSeconds, lowerIsBetter: true },
  { label: "Output speed", key: "speed", format: (v) => `${Math.round(v)} tokens/s`, lowerIsBetter: false },
  { label: "Output tokens", key: "output", format: (v) => v.toLocaleString() },
  { label: "Cost", key: "cost", format: dollars, lowerIsBetter: true },
];

// Specs for every model, plus the measured numbers once a run has finished.
function CompareTable({ models, runs }) {
  const metrics = Object.fromEntries(models.map((m) => [m.id, metricsOf(m, runs[m.id])]));
  const best = (row) => {
    if (row.lowerIsBetter == null) return null;
    const values = models.map((m) => metrics[m.id]?.[row.key]).filter((v) => v != null);
    if (values.length < 2) return null;
    return row.lowerIsBetter ? Math.min(...values) : Math.max(...values);
  };
  return (
    <table className="compare">
      <thead>
        <tr>
          <th></th>
          {models.map((m) => <th key={m.id}>{m.name}</th>)}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => {
          const top = row.key && best(row);
          return (
            <tr key={row.label} className={row.key === "ttft" ? "measured" : ""}>
              <th>{row.label}</th>
              {models.map((m) => {
                if (row.spec) return <td key={m.id}>{row.spec(m)}</td>;
                const value = metrics[m.id]?.[row.key];
                return <td key={m.id} className={value != null && value === top ? "best" : ""}>{value != null ? row.format(value) : "–"}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ChatAnswer({ run }) {
  return (
    <div className="answer">
      {run?.text && <Markdown remarkPlugins={[remarkGfm]}>{run.text}</Markdown>}
      <Status run={run} />
    </div>
  );
}

function WebAnswer({ run, view }) {
  if (run?.status === "done" && run.stopReason !== "refusal" && view !== "code") {
    // No allow-same-origin: the generated page can run scripts but can't touch this app.
    return <iframe className="preview" sandbox="allow-scripts" srcDoc={extractHtml(run.text)} title="Generated page" />;
  }
  return (
    <div className="answer code">
      {/* column-reverse keeps the newest lines in view while the code streams in */}
      <div>
        {run?.text && <pre>{extractHtml(run.text)}</pre>}
        <Status run={run} />
      </div>
    </div>
  );
}

function Status({ run }) {
  if (!run) return null;
  if (run.status === "running" && !run.text) return <p className="status">Thinking…</p>;
  if (run.status === "stopped") return <p className="status">Stopped.</p>;
  if (run.status === "error") return <p className="error">Error: {run.error}</p>;
  if (run.status === "done" && run.stopReason === "refusal") return <p className="status">The model declined this request.</p>;
  if (run.status === "done" && run.stopReason === "max_tokens") return <p className="status">Cut off at the output limit.</p>;
  return null;
}

function Panel({ tab, models, hidden }) {
  const { mode } = tab;
  const [prompt, setPrompt] = useState("");
  const [asked, setAsked] = useState(""); // the prompt the current results belong to
  const [runs, setRuns] = useState({}); // model id -> { status, text, ttft, total, usage, stopReason, error }
  const [views, setViews] = useState({}); // model id -> "code" when the source is shown instead of the preview
  const abortRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const running = Object.values(runs).some((r) => r.status === "running");

  function run() {
    if (!prompt.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAsked(prompt);
    setViews({});
    setRuns(Object.fromEntries(models.map((m) => [m.id, { status: "running", text: "" }])));
    // All models start at the same moment and stream side by side.
    for (const m of models) runOne(m.id, prompt, controller.signal);
  }

  async function runOne(model, prompt, signal) {
    const update = (patch) => {
      if (!signal.aborted) setRuns((all) => ({ ...all, [model]: { ...all[model], ...patch(all[model]) } }));
    };
    const started = performance.now();
    const elapsed = () => (performance.now() - started) / 1000;
    try {
      const res = await fetch("/api/model-compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt, mode }),
        signal,
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "text") {
            const at = elapsed();
            update((r) => ({ text: r.text + event.text, ttft: r.ttft ?? at }));
          } else if (event.type === "done") {
            finished = true;
            update(() => ({ status: "done", total: elapsed(), usage: event.usage, stopReason: event.stopReason }));
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
      if (!finished) throw new Error("Stream ended early");
    } catch (err) {
      if (err.name !== "AbortError") update(() => ({ status: "error", error: err.message }));
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRuns((all) =>
      Object.fromEntries(Object.entries(all).map(([id, r]) => [id, r.status === "running" ? { ...r, status: "stopped" } : r])),
    );
  }

  function clear() {
    abortRef.current?.abort();
    setPrompt("");
    setAsked("");
    setRuns({});
    setViews({});
  }

  function openPage(run) {
    const url = URL.createObjectURL(new Blob([extractHtml(run.text)], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div hidden={hidden}>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); running ? stop() : run(); }}>
        <input spellCheck={false} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={tab.placeholder} />
        {running
          ? <button type="submit">Stop</button>
          : <button type="submit" className="primary" disabled={!prompt.trim()}>{tab.action}</button>}
        <button type="button" disabled={!prompt && !asked} onClick={clear}>Clear</button>
        <button type="button" onClick={() => dialogRef.current.showModal()}>Details</button>
      </form>

      <div className="columns">
        {models.map((m) => {
          const r = runs[m.id];
          const built = mode === "web" && r?.status === "done" && r.stopReason !== "refusal";
          return (
            <section className="column" key={m.id}>
              <div className="column-head">
                <h2>{m.name}</h2>
                {r?.text && (
                  <span className="count">
                    {r.text.length.toLocaleString()} chars
                    {r.usage && ` · ${r.usage.output.toLocaleString()} tokens`}
                  </span>
                )}
                {built && (
                  <>
                    <button onClick={() => setViews((v) => ({ ...v, [m.id]: v[m.id] === "code" ? "preview" : "code" }))}>
                      {views[m.id] === "code" ? "Preview" : "Code"}
                    </button>
                    <button onClick={() => openPage(r)}>Open</button>
                  </>
                )}
              </div>
              {mode === "web" ? <WebAnswer run={r} view={views[m.id]} /> : <ChatAnswer run={r} />}
            </section>
          );
        })}
      </div>

      <dialog ref={dialogRef} onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className="details">
          <div className="details-head">
            <h2>Model comparison</h2>
            <button onClick={() => dialogRef.current.close()}>Close</button>
          </div>
          <CompareTable models={models} runs={runs} />
          <p className="status">
            {asked
              ? <>Measured on: “{asked.length > 160 ? `${asked.slice(0, 160)}…` : asked}” Output tokens include thinking.</>
              : "Run a prompt to fill in the measured rows."}
          </p>
        </div>
      </dialog>
    </div>
  );
}

export default function ModelCompare() {
  const [active, setActive] = useState("chat");
  // Fable costs 2.5x Opus per token, so it only joins a run when asked to.
  const [extra, setExtra] = useState(false);
  const models = MODELS.filter((m) => m.default || extra);

  return (
    <div className="model-compare">
      <header>
        <Link className="back" href="/">← Demos</Link>
        <h1>Model Compare</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.mode} className={t.mode === active ? "active" : ""} onClick={() => setActive(t.mode)}>{t.label}</button>
          ))}
        </nav>
        {MODELS.filter((m) => !m.default).map((m) => (
          <label className="extra" key={m.id}>
            <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} />
            Include {m.name}
          </label>
        ))}
      </header>
      {/* Both panels stay mounted, so a run keeps going while you look at the other tab. */}
      {TABS.map((t) => <Panel key={t.mode} tab={t} models={models} hidden={t.mode !== active} />)}
    </div>
  );
}
