import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// Next loads claude-node/.env* itself; otherwise reuse the key from the repo root.
// The working directory is claude-node for `npm run dev`, the repo root for `next dev claude-node`.
for (const file of ["../.env", ".env"]) {
  if (process.env.ANTHROPIC_API_KEY) break;
  try {
    process.loadEnvFile(path.resolve(file));
  } catch {}
}

export const client = new Anthropic();
