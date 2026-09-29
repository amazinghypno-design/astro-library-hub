/**
 * Remembers what the public pages read from the database, so a visit costs
 * no database round-trips at all once someone has asked the same thing.
 *
 * Why this is worth a module: the API runs in Oregon and the database in
 * Tokyo, and every statement crosses the Pacific (~130ms). A homepage visit
 * was spending as long talking to its own database as talking to the reader.
 * The library changes a few times a day and is read far more often than that,
 * so the answer to "what's on the shelf" is almost always the one we gave a
 * moment ago.
 *
 * Staleness is handled by forgetting everything on any write, not by clever
 * per-key invalidation: every write path — every tRPC mutation that touches
 * shared data (see invalidateOnMutation in routers/trpc.ts) and the upload
 * post-processing queue — clears the whole cache. The API is a single
 * instance, so there is no other copy to go stale. The TTL is only a backstop
 * for a write this module was never told about.
 *
 * Cache data, never links: signed storage URLs expire, so callers cache the
 * rows and sign fresh URLs per request (signing is a local HMAC, no network).
 */

const TTL_MS = 10 * 60 * 1000;
// Search keywords make the key space open-ended; clearing on overflow keeps
// memory bounded and only costs the next few reads a trip to the database.
const MAX_ENTRIES = 500;

interface Entry {
  value: Promise<unknown>;
  at: number;
}

// A load still in flight when a write clears the cache is dropped with it, so
// an answer read before the write is never handed to anyone after it.
const entries = new Map<string, Entry>();

export function cachedRead<T>(key: string, load: () => PromiseLike<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;

  if (entries.size >= MAX_ENTRIES) entries.clear();
  // The promise, not the result: ten readers arriving together share one
  // query instead of each starting their own. Promise.resolve matters: a
  // drizzle query is a lazy thenable that runs again every time it is
  // awaited, so it has to be settled into a real promise exactly once.
  const value = Promise.resolve(load());
  entries.set(key, { value, at: Date.now() });
  // A failure is not an answer worth remembering.
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}

export function invalidateReadCache(): void {
  entries.clear();
}
