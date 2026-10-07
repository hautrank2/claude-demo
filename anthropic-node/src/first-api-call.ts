import "dotenv/config";
import { Anthropic } from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const message = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: "You are a terse senior code reviewer. Reply in one short parapraph.",
  messages: [
    {
      role: "user",
      content: "Review this: function add(a) { return a / 0; }",
    },
  ],
});

for (const block of message.content) {
  if (block.type === "text") {
    console.log(block.text);
  }
}
