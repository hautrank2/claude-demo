import Anthropic from "@anthropic-ai/sdk";
import { client } from "@/lib/anthropic";

const MODEL = "claude-haiku-4-5";
const MAX_BODY_CHARS = 200_000;

const SYSTEM = `You are an editor reading over a writer's shoulder while they draft. You receive one passage to review (usually a single sentence), plus the text that precedes it for context only. The writer may also give a brief: what they are writing, who it is for, and the tone they want.

Flag problems in the passage that a careful human editor would actually raise:
- spelling: typos, misspellings, wrong diacritics, wrong capitalization.
- grammar: grammatical errors, wrong punctuation, broken sentence structure.
- style: wordy, awkward, unclear or repetitive phrasing; a word that doesn't fit the tone.
- logic: an idea that doesn't follow from the preceding text, contradicts it, or is in the wrong place.
- content: what is being said rather than how. A factual error, a claim that is overgeneralized or needs evidence, a statement too vague to be useful without an example, or a term the reader needs explained.

The writer is mid-draft, so the passage may stop in the middle of a sentence. Never comment on it being unfinished, and don't ask for something the following sentences would naturally supply. Don't flag deliberate stylistic choices or things that are merely different from how you would write them. Most sentences in a decent draft need no comment, so an empty list is the normal result, not a failure. The request states how strict to be; that sets which problems are worth raising and how many comments you may return. Most important first.

When there is a brief, judge the passage against it: the right level of detail and vocabulary for that audience, the tone the writer asked for, and whether the passage serves what the piece is meant to do. Something the brief makes intentional (casual wording in a casual post, a term the stated audience already knows) is not a problem. Never comment on the brief itself.

For each comment:
- quote: the exact text the comment is about, copied character for character from the passage (never from the context). Keep it as short as possible while still unambiguous: the misspelled word, the awkward phrase, or the claim for a logic or content problem.
- message: one short sentence explaining the problem. Always write it in English, whatever language the passage is in.
- suggestion: the text that should replace the quote exactly, in the passage's own language, so that swapping one for the other fixes the problem. Use an empty string when the fix isn't a straight replacement.`;

const STRICTNESS = {
  relaxed:
    "Relaxed. Only flag outright mistakes: misspellings, real grammar errors, factual errors, and direct contradictions. Do not comment on style, wording, tone, vagueness, or claims that are merely unsupported. At most 1 comment per category of mistake, 2 in total.",
  balanced:
    "Balanced. Flag outright mistakes, plus anything that would genuinely confuse or mislead the reader. Skip phrasing that is merely improvable, and skip claims a reasonable reader would let pass. At most 2 comments.",
  strict:
    "Strict. Flag everything a demanding editor would: mistakes, weak or wordy phrasing, vague statements, and claims that need support. At most 3 comments.",
};

const SCHEMA = {
  type: "object",
  properties: {
    comments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string" },
          category: { type: "string", enum: ["spelling", "grammar", "style", "logic", "content"] },
          message: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["quote", "category", "message", "suggestion"],
        additionalProperties: false,
      },
    },
  },
  required: ["comments"],
  additionalProperties: false,
};

async function review(passage, before, brief, strictness, signal) {
  const response = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 2000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<strictness>
${STRICTNESS[strictness] ?? STRICTNESS.balanced}
</strictness>

<brief>
${brief}
</brief>

<context_before>\n${before}\n</context_before>\n\n<passage>\n${passage}\n</passage>`,
        },
      ],
    },
    { signal },
  );

  const usage = { input: response.usage.input_tokens, output: response.usage.output_tokens };
  if (response.stop_reason === "refusal") return { comments: [], usage };
  if (response.stop_reason === "max_tokens") throw new Error("Review was cut off (max_tokens)");

  const text = response.content.find((block) => block.type === "text")?.text ?? "";
  const { comments } = JSON.parse(text);
  // The UI anchors comments by quote, so drop any that don't appear verbatim.
  return { comments: comments.filter((c) => c.quote && passage.includes(c.quote)), usage };
}

export async function POST(request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return Response.json({ error: "Body too large" }, { status: 413 });
    const { passage, before = "", brief = "", strictness } = JSON.parse(raw);
    if (typeof passage !== "string" || !passage.trim() || typeof before !== "string" || typeof brief !== "string") {
      return Response.json({ error: "passage is required" }, { status: 400 });
    }
    // The browser aborts its fetch when the passage changes; request.signal stops paying for the stale review.
    return Response.json(await review(passage, before, brief, strictness, request.signal));
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) return new Response(null, { status: 499 });
    console.error(err);
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "API key is missing or invalid (.env)" }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limited, try again in a few seconds" }, { status: 429 });
    }
    return Response.json({ error: err.message }, { status: err instanceof Anthropic.APIError ? 502 : 500 });
  }
}
