import "dotenv/config";
import { Anthropic } from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const getWeather = betaZodTool({
  name: "get_weather",
  description: "Get the current temperature and conditions for a city.",
  inputSchema: z.object({
    city: z.string().describe("City and country, e.g. Hanoi, Vietnam"),
  }),
  run: async ({ city }) => {
    console.log(`[tool] get_weather(${JSON.stringify({ city })})`);
    return JSON.stringify({
      city,
      temperature: 72,
      unit: "fahrenheit",
      condition: "Sunny",
    });
  },
});

const client = new Anthropic();

const run = async (prompt: string) => {
  // The tool runner calls the API, runs the tools and loops until Claude is done.
  const message = await client.beta.messages.toolRunner({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: [getWeather],
    messages: [{ role: "user", content: prompt }],
  });

  if (message.stop_reason === "refusal") {
    throw new Error(`Request was refused: ${message.stop_details?.explanation}`);
  }

  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
};

console.log(await run("What is the weather in New York City right now?"));
