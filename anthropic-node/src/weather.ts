import "dotenv/config";
import { Anthropic } from "@anthropic-ai/sdk";

const getWeather = (location: string) => {
  return {
    location,
    temperature: 72,
    unit: "fahrenheit",
    condition: "Sunny",
    humidity: 45,
  };
};

const getForecase = (location: string) => {
  return {
    location,
    unit: "fahrenheit",
    days: [
      { day: "Today", high: 74, low: 61, condition: "Sunny" },
      { day: "Tomorrow", high: 70, low: 58, condition: "Partly cloudy" },
      { day: "Day after tomorrow", high: 65, low: 55, condition: "Rain" },
    ],
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
    description: "Get the 3-day weather forecast for a given location.",
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
  system: "You are a terse senior code reviewer. Reply in one short parapraph.",
  tools,
  messages,
});

let i = 0;
while (message.stop_reason === "tool_use") {
  console.log("message tooluse", i, message.content);
  messages.push({ role: "assistant", content: message.content });

  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  for (const block of message.content) {
    if (block.type !== "tool_use") continue;
    console.log(`[tool] ${block.name}(${JSON.stringify(block.input)})`);
    try {
      const result = runTool(
        block.name,
        block.input as Record<string, unknown>,
      );
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

  i++;
}

for (const block of message.content) {
  if (block.type === "text") {
    console.log(block.text);
  }
}
