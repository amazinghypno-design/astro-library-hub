import { useEffect, useState } from "react";

/**
 * A tiny stale-while-revalidate layer on top of localStorage.
 *
 * The API lives on Render's free tier, which shuts the instance down after a
 * spell with no traffic; the first request after that waits ~30s for the
 * container to come back. React Query's own cache is in-memory, so a fresh tab
 * has nothing to show and the page sits on empty skeletons for the whole wake-
 * up. Keeping the last successful payload on disk means a returning visitor
 * sees real content immediately, and the network result quietly replaces it.
 *
 * Only safe for endpoints whose payload is plain JSON (this API uses no tRPC
 * transformer, so responses are already JSON-round-trip clean) and whose data
 * being a few minutes stale is harmless.
 */

const PREFIX = "alh:cache:";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

interface Envelope<T> {
  savedAt: number;
  data: T;
}

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || typeof parsed.savedAt !== "number") return undefined;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return undefined;
    }
    return parsed.data;
  } catch {
    // Private-mode / quota / corrupted entry — the cache is an optimization,
    // never a correctness requirement, so failing to read it is a non-event.
    return undefined;
  }
}

function write(key: string, data: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data } satisfies Envelope<unknown>));
  } catch {
    // Ignore — see read().
  }
}

/**
 * Returns `data` once the query resolves, and the last saved copy until then.
 * Read the snapshot once on mount so the value can't change identity underneath
 * a render pass after the fresh data has already arrived.
 */
export function useStaleCache<T>(key: string, data: T | undefined): T | undefined {
  const [snapshot] = useState(() => read<T>(key));

  useEffect(() => {
    if (data !== undefined) write(key, data);
  }, [key, data]);

  return data ?? snapshot;
}

/**
 * True once a load has been running long enough that it's worth telling the
 * reader the server is waking up rather than leaving them staring at a
 * skeleton wondering whether the site is broken.
 */
export function useSlowLoadNotice(isLoading: boolean, delayMs = 3500): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [isLoading, delayMs]);

  return slow;
}
