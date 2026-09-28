import type session from "express-session";
import connectPgSimple from "connect-pg-simple";

/**
 * The Postgres session store, minus the two database round-trips it used to
 * add to every signed-in request.
 *
 * The API and the database sit on different continents, so each statement
 * costs ~130ms. connect-pg-simple as-is runs a SELECT before any handler can
 * start, and an `UPDATE ... SET expire` that express-session waits on before
 * the response is allowed to finish — a quarter of a second on every call,
 * paid only by whoever is signed in.
 *
 * - Reads are served from memory for a few minutes. Every write (login,
 *   logout, any change to the session) goes through this same object, so the
 *   cache is updated alongside the database and never serves a session that
 *   was changed here. The short lifetime bounds staleness for the one case it
 *   cannot see: a second instance during a rolling deploy.
 * - Touches (sliding the expiry forward) answer immediately and reach the
 *   database in the background, at most once an hour per session. The
 *   session lives for a week, so an hour of slack in its expiry is invisible.
 */

const READ_TTL_MS = 5 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
// Nothing expires out of the maps on its own; this keeps them from growing
// without bound. Clearing only costs the next read a trip to the database.
const MAX_CACHED_SESSIONS = 1000;

interface CachedSession {
  json: string;
  cachedAt: number;
}

export function createCachedPgSessionStore(
  sessionModule: typeof session,
  options: ConstructorParameters<ReturnType<typeof connectPgSimple>>[0],
): session.Store {
  const PgSession = connectPgSimple(sessionModule);

  class CachedPgSession extends PgSession {
    private cache = new Map<string, CachedSession>();
    private lastTouchedAt = new Map<string, number>();

    private remember(sid: string, sess: session.SessionData) {
      // A string, not the object: express-session mutates the session it is
      // handed, so each request must get its own copy.
      if (this.cache.size >= MAX_CACHED_SESSIONS) this.cache.clear();
      this.cache.set(sid, { json: JSON.stringify(sess), cachedAt: Date.now() });
    }

    private forget(sid: string) {
      this.cache.delete(sid);
      this.lastTouchedAt.delete(sid);
    }

    override get(sid: string, fn: (err: unknown, sess?: session.SessionData | null) => void) {
      const hit = this.cache.get(sid);
      if (hit && Date.now() - hit.cachedAt < READ_TTL_MS) {
        const sess = JSON.parse(hit.json) as session.SessionData;
        const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Infinity;
        if (expires > Date.now()) {
          fn(null, sess);
          return;
        }
        this.forget(sid);
      }
      super.get(sid, (err, sess) => {
        if (!err && sess) this.remember(sid, sess);
        else if (!err) this.forget(sid);
        fn(err, sess);
      });
    }

    override set(sid: string, sess: session.SessionData, fn?: (err?: unknown) => void) {
      this.remember(sid, sess);
      this.lastTouchedAt.set(sid, Date.now());
      super.set(sid, sess, (err) => {
        if (err) this.forget(sid);
        fn?.(err);
      });
    }

    override destroy(sid: string, fn?: (err?: unknown) => void) {
      this.forget(sid);
      super.destroy(sid, fn);
    }

    override touch(sid: string, sess: session.SessionData, fn?: (err?: unknown) => void) {
      this.remember(sid, sess);
      fn?.();
      const last = this.lastTouchedAt.get(sid) ?? 0;
      if (Date.now() - last < TOUCH_INTERVAL_MS) return;
      if (this.lastTouchedAt.size >= MAX_CACHED_SESSIONS) this.lastTouchedAt.clear();
      this.lastTouchedAt.set(sid, Date.now());
      // Typed as a no-argument callback, but connect-pg-simple does pass the error.
      const onTouched = ((err?: unknown) => {
        if (err) console.error("[session] background touch failed:", err);
      }) as () => void;
      super.touch(sid, sess, onTouched);
    }
  }

  return new CachedPgSession(options);
}
