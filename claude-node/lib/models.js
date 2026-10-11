// Shared by the model-compare page and its API route. Prices are USD per million tokens.
export const MODELS = [
  {
    id: "claude-haiku-5-5",
    name: "Haiku 5.5",
    tagline: "Fastest and cheapest. High-volume, simple, latency-sensitive work.",
    input: 0.1,
    output: 0.5,
    context: "1M",
    default: true,
  },
  {
    id: "claude-sonnet-5-5",
    name: "Sonnet 5.5",
    tagline: "Balance of speed and capability for everyday coding and agents.",
    input: 2,
    output: 10,
    context: "1M",
    default: true,
  },
  {
    id: "claude-opus-5-5",
    name: "Opus 5.5",
    tagline: "Hard reasoning and complex, multi-step work.",
    input: 4,
    output: 20,
    context: "1M",
    default: true,
  },
  {
    id: "claude-fable-5-1",
    name: "Fable 5.1",
    tagline: "Most capable. The most demanding, long-horizon problems.",
    input: 10,
    output: 50,
    context: "1M",
    default: false,
  },
];

export const EFFORTS = ["low", "medium", "high"];
