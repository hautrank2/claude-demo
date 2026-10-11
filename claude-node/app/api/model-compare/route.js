import Anthropic from "@anthropic-ai/sdk";
import { client } from "@/lib/anthropic";
import { EFFORTS, MODELS } from "@/lib/models";

const MAX_PROMPT_CHARS = 20_000;

// Web mode: the page is rendered straight into a sandboxed iframe, so the answer must be the document itself.
const WEB_SYSTEM = `You build web pages. The user describes a page; respond with one complete, self-contained HTML document that implements it.

The document is rendered directly in a sandboxed preview about 400px wide that has no network access, so put all CSS in a <style> tag, use inline JavaScript only where the page needs it, and use CSS, inline SVG or emoji instead of external images, fonts, scripts or CDNs. Make it look polished and work at that narrow width as well as on a full screen. Keep it compact: around 250 lines at most.

Output only the HTML, starting with <!doctype html>. No markdown fences and no commentary before or after, because anything else would show up as text in the preview.`;

// Streams one model's answer as newline-delimited JSON: {type: "text"}* then {type: "done"} or {type: "error"}.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { model, prompt, effort, mode } = body;
  if (!MODELS.some((m) => m.id === model)) return Response.json({ error: "Unknown model" }, { status: 400 });
  if (typeof prompt !== "string" || !prompt.trim()) return Response.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > MAX_PROMPT_CHARS) return Response.json({ error: "Prompt too long" }, { status: 413 });

  // Same request for every model, so the only variable is the model itself.
  // Thinking is always on for these models; effort is pinned because its default differs per model.
  // No refusal fallback: a different model answering would defeat the comparison.
  const stream = client.messages.stream(
    {
      model,
      max_tokens: 16000,
      output_config: { effort: EFFORTS.includes(effort) ? effort : "medium" },
      ...(mode === "web" && { system: WEB_SYSTEM }),
      messages: [{ role: "user", content: prompt }],
    },
    { signal: request.signal },
  );

  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          } catch {} // the browser already went away
        };
        stream.on("text", (text) => send({ type: "text", text }));
        try {
          const message = await stream.finalMessage();
          send({
            type: "done",
            stopReason: message.stop_reason,
            usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
          });
        } catch (err) {
          if (!(err instanceof Anthropic.APIUserAbortError)) {
            console.error(err);
            send({ type: "error", error: errorMessage(err) });
          }
        }
        try {
          controller.close();
        } catch {}
      },
      cancel() {
        stream.abort();
      },
    }),
    { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } },
  );
}

function errorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) return "API key is missing or invalid (.env)";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key has no access to this model";
  if (err instanceof Anthropic.NotFoundError) return "Model not found for this API key";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited, try again in a few seconds";
  return err.message;
}
