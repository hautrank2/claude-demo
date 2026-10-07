import "dotenv/config";
import { Anthropic } from "@anthropic-ai/sdk";

const getWeather = (location: string) => {
  return {
    location,
    temperature: 72,
    condition: "Sunny",
  };
};

const getForecase = (location: string) => {
  return {
    location,
    temperature: 72,
    condition: "Sunny",
  };
};

const tools: Anthropic.Tool[] = [
  {
    name: "get_weather",
    description: "Get the current weather for a given location.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City and country",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "get_forecast",
    description: "Get the current forecase for a given location.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City and country",
        },
      },
      required: ["location"],
    },
  },
];

const runTool = (name: string, input: Record<string, unknown>) => {
  switch (name) {
    case "get_weather":
      return getWeather(input.location as string);
    case "get_forecast":
      return getForecase(input.location as string);
    default:
      throw new Error(`Tool ${name} not found`);
  }
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const messages: Anthropic.MessageParam[] = [
  {
    role: "user",
    content: "Return the current weather for New York City.",
  },
];

let message = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  tools,
  messages,
});

while (message.stop_reason === "tool_use") {
  messages.push({ role: "assistant", content: message.content });

  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  for (const block of message.content) {
    if (block.type !== "tool_use") continue;
    console.log(`[tool] ${block.name}(${JSON.stringify(block.input)})`);
    try {
      const result = runTool(block.name, block.input as Record<string, unknown>);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    } catch (error) {
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: String(error),
        is_error: true,
      });
    }
  }
  messages.push({ role: "user", content: toolResults });

  message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools,
    messages,
  });
}

for (const block of message.content) {
  if (block.type === "text") {
    console.log(block.text);
  }
}
