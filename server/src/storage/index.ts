import "../env";
import type { StorageAdapter } from "./types";

const driver = process.env.STORAGE_DRIVER ?? "supabase";

// Dynamic import (not a static one) so only the active provider's module
// loads — each provider module throws at import time if ITS OWN required
// env vars are missing, and we don't want an unused provider's checks to
// fail the app just because it isn't configured.
let storageAdapter: StorageAdapter;
if (driver === "r2") {
  storageAdapter = (await import("./r2")).r2StorageAdapter;
} else if (driver === "supabase") {
  storageAdapter = (await import("./supabase")).supabaseStorageAdapter;
} else {
  throw new Error(`Unknown STORAGE_DRIVER: "${driver}" (expected "r2" or "supabase")`);
}

export { storageAdapter };
