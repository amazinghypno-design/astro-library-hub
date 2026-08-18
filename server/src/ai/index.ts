import "../env";
import type { AiAdapter } from "./types";

const driver = process.env.AI_PROVIDER ?? "groq";

// Dynamic import (not a static one) so only the active provider's module
// loads — mirrors server/src/storage/index.ts.
let aiAdapter: AiAdapter;
if (driver === "groq") {
  aiAdapter = (await import("./groq")).groqAiAdapter;
} else {
  throw new Error(`Unknown AI_PROVIDER: "${driver}" (expected "groq")`);
}

export { aiAdapter };
