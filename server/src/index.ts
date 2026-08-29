import "./env";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { Readable } from "node:stream";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "./routers/index";
import { createContext } from "./routers/trpc";
import { db } from "./db/client";
import { libraryFiles, noteFonts, shareLinks } from "./db/schema";
import { storageAdapter } from "./storage/index";
import { buildContentDisposition } from "./domain/safeStorageKey";
import { isPubliclyVisible } from "./domain/publicationPolicy";
import { isShareLinkValid } from "./domain/shareLink";
import { warmOfficePreviewCache } from "./services/officePreview";

const app = express();

// Behind a reverse proxy (Render/Railway/etc terminate TLS in front of us) —
// without this, Express sees the connection as plain HTTP and refuses to set
// secure cookies, breaking login in production.
app.set("trust proxy", 1);

// In production the browser origin is pinned to exactly one host. In
// development the Vite dev server moves to another port whenever 5173 is
// taken, and a pinned origin turns that into a wall of opaque CORS failures
// that look like the API is down — so any loopback origin is accepted there.
const isProduction = process.env.NODE_ENV === "production";
const developmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin: isProduction ? (process.env.CLIENT_ORIGIN ?? false) : developmentOrigin,
    credentials: true,
  }),
);
// File bytes now go straight from the browser to storage (see
// admin.createUploadUrl) — this server never sees them, so the JSON body
// limit only needs to cover ordinary metadata payloads, not whole files.
// (A previous mismatch here — Express capped below the app's own upload
// limit — caused uploads to fail with a raw HTML error page instead of
// JSON; keeping this small avoids that whole class of bug by construction.)
// File bytes never come through here (see admin.createUploadUrl), so this
// limit exists for one thing only: a note. A page of writing is measured in
// kilobytes, but a note carries its own pasted images inline, and the owner
// was promised no cap on how much they can write — so the ceiling is set
// where a single request stops being reasonable for a half-CPU instance
// rather than where a piece of writing might plausibly end.
app.use(express.json({ limit: "48mb" }));

// Body-parser errors (e.g. payload too large) otherwise fall through to
// Express's default HTML error page — return JSON instead so the client's
// tRPC/JSON parsing never breaks on a non-JSON response.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && typeof err === "object" && "type" in err && (err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
    return;
  }
  next(err);
});

// Persistent (Postgres-backed) session store — the express-session default
// is in-memory, which silently logs everyone out on every server restart.
// That was happening constantly during development (each file save restarts
// the dev server) and made admin actions like delete "randomly stop
// working" with no visible error. Sessions now survive restarts.
// Client and server live on different domains in production (e.g.
// *.vercel.app talking to *.onrender.com) — that makes every API call a
// cross-site request, and browsers only attach cookies to those when the
// cookie is SameSite=None + Secure. Locally both run on http://localhost
// (same-site), where Secure cookies don't work at all, hence the split.
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      // Its own pool, separate from db/client.ts — capped for the same reason
      // (see the note there). Session reads are one small query per request.
      conObject: { connectionString: process.env.DATABASE_URL, max: 2 },
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET ?? "dev-only",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

/**
 * Doubles as the keep-alive target for the external uptime pinger that stops
 * the free-tier instance from sleeping (see DEPLOY.md). It answers immediately
 * and opens a database connection in the background, so the first real request
 * after a cold start doesn't also pay for establishing the Postgres pool.
 * Always 200: this reports "the process is up", and a ping that flapped on a
 * transient database blip would be noise, not signal.
 */
app.get("/health", (_req, res) => {
  res.json({ ok: true });
  void db.execute(sql`select 1`).catch(() => {});
});

/**
 * Download proxy: builds Content-Disposition ourselves instead of relying on
 * Supabase's signed-URL `download` option, which double-percent-encodes
 * non-ASCII filenames (verified with a real Thai .pdf — see HANDOFF.md).
 * Streams from the storage provider rather than buffering the whole file.
 */
app.get("/download/:fileId", async (req, res) => {
  // Express 4 does NOT catch rejections thrown inside an async handler — on
  // Node 15+ an unhandled rejection crashes the whole process by default, not
  // just this one request. Every await below used to be unguarded, so a
  // single transient failure (a stale storage key, a network blip talking to
  // R2, anything) could take the entire server down for every user, not just
  // whoever was downloading. This try/catch is the fix.
  try {
    const [file] = await db.select().from(libraryFiles).where(eq(libraryFiles.id, req.params.fileId));
    if (!file) return res.status(404).json({ error: "FILE_NOT_FOUND" });

    const sessionUser = (req as unknown as { session?: { user?: { role: string } } }).session?.user;
    const isAdmin = sessionUser?.role === "admin";

    let hasValidShareToken = false;
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (token) {
      const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
      hasValidShareToken = !!link && link.fileId === file.id && isShareLinkValid(link, new Date());
    }

    if (!isAdmin && !hasValidShareToken && !isPubliclyVisible(file.status, file.visibility)) {
      return res.status(404).json({ error: "FILE_NOT_PUBLIC" });
    }

    const rawUrl = await storageAdapter.createPreviewUrl(file.storageKey);
    const upstream = await fetch(rawUrl);
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: "STORAGE_READ_FAILED" });
    }

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", buildContentDisposition(file.originalName));
    res.setHeader("Content-Length", String(file.size));
    Readable.fromWeb(upstream.body as never).pipe(res);
    return undefined;
  } catch (err) {
    console.error("[/download] failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "DOWNLOAD_FAILED" });
    return undefined;
  }
});

/**
 * Cover images. A shelf view asks for twenty of these at once, so this
 * deliberately does NOT presign twenty storage URLs per list response —
 * signing is cheap but twenty extra columns of URL in every payload are not,
 * and a presigned URL expires, which makes it uncacheable by the browser.
 * Instead the client builds a stable `/cover/:id?v=<updatedAt>` URL and this
 * route serves it with a one-year cache: the version changes whenever the
 * cover is regenerated, so a stale cover is impossible without ever asking
 * for the same bytes twice.
 */
app.get("/cover/:fileId", async (req, res) => {
  try {
    const [file] = await db
      .select({
        coverStorageKey: libraryFiles.coverStorageKey,
        status: libraryFiles.status,
        visibility: libraryFiles.visibility,
      })
      .from(libraryFiles)
      .where(eq(libraryFiles.id, req.params.fileId));
    if (!file?.coverStorageKey) return res.status(404).json({ error: "COVER_NOT_FOUND" });

    const sessionUser = (req as unknown as { session?: { user?: { role: string } } }).session?.user;
    if (sessionUser?.role !== "admin" && !isPubliclyVisible(file.status, file.visibility)) {
      return res.status(404).json({ error: "FILE_NOT_PUBLIC" });
    }

    const rawUrl = await storageAdapter.createPreviewUrl(file.coverStorageKey);
    const upstream = await fetch(rawUrl);
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: "STORAGE_READ_FAILED" });
    }

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    Readable.fromWeb(upstream.body as never).pipe(res);
    return undefined;
  } catch (err) {
    console.error("[/cover] failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "COVER_FAILED" });
    return undefined;
  }
});

/**
 * An uploaded font's bytes, for the @font-face rule the notebook builds
 * (client/src/lib/useNoteFonts.ts).
 *
 * No session check, deliberately: a browser fetches a font file as an
 * anonymous cross-origin request and sends no cookies with it, so a
 * session-gated route would simply never load a font in production, where
 * the client and the API sit on different hosts. What is exposed by an
 * unguessable UUID is a typeface file — not the writing set in it, which
 * stays behind the notes API. Cached for a year: a font's bytes never change,
 * a replacement is a new row with a new id.
 */
app.get("/font/:fontId", async (req, res) => {
  try {
    const [font] = await db
      .select({ storageKey: noteFonts.storageKey, mimeType: noteFonts.mimeType })
      .from(noteFonts)
      .where(eq(noteFonts.id, req.params.fontId));
    if (!font) return res.status(404).json({ error: "FONT_NOT_FOUND" });

    const rawUrl = await storageAdapter.createPreviewUrl(font.storageKey);
    const upstream = await fetch(rawUrl);
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: "STORAGE_READ_FAILED" });
    }

    res.setHeader("Content-Type", font.mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    // CSS-initiated font requests are cross-origin and credential-less; the
    // cors() middleware above only answers requests that carry an Origin it
    // recognises, and a font fetch from a cached stylesheet may not.
    res.setHeader("Access-Control-Allow-Origin", "*");
    Readable.fromWeb(upstream.body as never).pipe(res);
    return undefined;
  } catch (err) {
    console.error("[/font] failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "FONT_FAILED" });
    return undefined;
  }
});

// Final safety net for any route added later that forgets its own try/catch
// (Express doesn't call this for async errors unless something explicitly
// passes them to next(err), but it's cheap insurance and keeps every
// response JSON instead of Express's default HTML error page).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled route error]:", err);
  if (!res.headersSent) res.status(500).json({ error: "INTERNAL_ERROR" });
});

// Last-resort process-level safety net. On Node 15+, an unhandled promise
// rejection anywhere in the process crashes the entire server by default —
// taking every user down over one bad request, not just the one that failed.
// Logging and staying up beats a silent, unexplained restart (this was the
// likely cause of several "the site just went down" moments during
// development, traced to /download's previously-unguarded async handler).
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]:", err);
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Secret server listening on http://localhost:${port}`);
  // Converting the Office documents takes seconds of CPU that somebody has to
  // spend; better now, while the port has just opened and nobody is waiting on
  // a page, than under the first reader who opens one. Fire-and-forget.
  void warmOfficePreviewCache();
});
