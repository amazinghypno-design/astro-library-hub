# Decision Records — Astro Library Hub

## D1 — No existing source project reference

Checked `~/Desktop` for an existing Astro Library Hub codebase before starting. Found only the manual folder (`Astro-Library-Hub-Claude-Code-Manual/`) and its own zip backup — no prior implementation. Treated this as a true greenfield build per `GREENFIELD-BUILD-PROMPT-CLAUDE-CODE.md` rather than a migration.

## D2 — Local-first stack for development (no external accounts required yet)

**Decision:** Use SQLite (file-based) for the database and a local filesystem adapter for object storage during Phase 0–5, instead of provisioning a managed database/storage provider up front.

**Why:** The manual explicitly says: if credentials/accounts/OAuth/storage/database/DNS are needed, stop and ask the owner rather than guessing or fabricating secrets. No provider account details were supplied. A local-first stack lets the full product (search, upload, viewer, admin, publication rules) get built and verified end-to-end with zero external dependency, while keeping every provider-specific call behind an adapter interface (see `ARCHITECTURE.md`).

**Consequence:** Moving to Cloudflare R2 / Supabase Storage / managed Postgres later is a config + adapter-implementation change, not a rewrite. This decision must be revisited before Phase 6 (Release) — see D4.

## D3 — Local credential auth instead of OAuth for the admin role

**Decision:** Admin login uses a single seeded credential (email + bcrypt password hash from environment variables) and a server-side session cookie, instead of an OAuth provider.

**Why:** No OAuth app/provider account was supplied. The product requirement is "admin role exists and is enforced server-side" — it does not mandate a specific identity provider. The `AuthAdapter` interface (`getCurrentUser`, `requireRole`) isolates this choice so real OAuth (Google, GitHub, Manus, etc.) can be swapped in later without touching `routers.ts` guards or any page component.

**Open question for owner:** confirm this is acceptable for the real deployment, or supply an OAuth provider to integrate instead.

## D4 — Deferred: deployment target, managed DB, and object storage provider

**Status:** Not decided. Requires owner-owned accounts (free tier or paid) for hosting, managed database, and object storage (e.g. R2 vs Supabase Storage per the manual's own guidance). Per the manual's rules, Claude Code must stop at a release-candidate/staging plan and ask rather than picking or provisioning these itself.

**Action when ready:** owner supplies target provider(s) and credentials via environment variables (never hardcoded); Phase 6 will produce the adapter implementation, staging parity report, and rollback plan before any DNS cutover.

## D6 — Switched to Supabase Postgres + Supabase Storage (supersedes part of D2)

**Decision:** Owner created a free Supabase project (`amazing.hypno@gmail.com's Project`, region `ap-northeast-1` / Tokyo, project ref `qkwzzsrdaedoqejncxpa`). The database is now Supabase-managed Postgres via a direct connection string, and object storage is Supabase Storage, instead of local SQLite + local filesystem.

**Why:** D2 chose local-first only because no provider account existed yet. The owner supplied one directly, so there is no reason to build against a throwaway local DB and migrate later — building against the real target from Phase 1 removes a migration step and lets `todo.md`'s acceptance gates be verified against the actual system.

**Credentials received (stored only in local `.env`, gitignored, never in source):**
- Project URL: `https://qkwzzsrdaedoqejncxpa.supabase.co`
- Publishable/anon key (safe for client bundle)
- Secret key (server-only, full privilege — never sent to the browser)
- Database connection string (pending)

**Still local:** admin auth stays local-credential (D3) — Supabase Auth was not requested by the owner, and the local `AuthAdapter` interface still isolates this choice from the rest of the app.

**Consequence for ARCHITECTURE.md:** `StorageAdapter` now has a `server/src/storage/supabase.ts` implementation (using the secret key, server-side only) instead of `local.ts`. Drizzle now connects to the Supabase Postgres URL instead of a local sqlite file. The adapter interfaces themselves are unchanged, so this was a config swap, not a redesign.

## D7 — Use Supabase Session Pooler, not the direct connection host

**Problem:** `db.qkwzzsrdaedoqejncxpa.supabase.co` (the "Direct connection" host Supabase shows first) only has an IPv6 (AAAA) DNS record, no IPv4 (A) record — confirmed via `dig`. This machine/network cannot reach it, causing `ENOTFOUND`.

**Decision:** Use the **Session pooler** connection string instead: host `aws-0-ap-northeast-1.pooler.supabase.com`, port `5432`, user `postgres.qkwzzsrdaedoqejncxpa` (project ref appended to username is required by the pooler). This resolves over IPv4 and works for our long-lived Express server (Session pooler is explicitly recommended by Supabase for persistent-connection apps, as opposed to Transaction pooler for serverless).

**Verified:** `drizzle-kit push` succeeded and a direct query against `information_schema.tables` confirmed all 5 tables (`users`, `library_categories`, `library_files`, `ai_work_items`, `ai_work_item_events`) exist in the real database.

## D8 — Office documents render as sanitized server-side HTML, not via a third-party viewer

**Decision:** docx renders via `mammoth` and xlsx renders via `xlsx` (SheetJS), both pure-Node, run on our own server against bytes read from our own storage, output passed through `sanitize-html` before ever reaching the client's `dangerouslySetInnerHTML`.

**Why:** The obvious shortcut — embedding Google Docs Viewer or Microsoft Office Online — requires handing the viewer a fetchable URL to the file. Our files are access-controlled (draft/published, signed URLs), so that would mean either making files effectively public to a third party or building a public proxy just for their benefit. Rendering server-side keeps every file behind our own auth/visibility checks with no new privacy surface.

**Consequence:** PowerPoint (.pptx) and legacy binary Word (.doc) are not covered by these libraries — they still fall back to download-only. Supporting them would need a heavier dependency (LibreOffice headless) or a paid conversion API, which is why it's queued separately in todo.md Phase 7c rather than bundled in.

## D9 — Supabase Storage's global upload limit is 50MB, independent of our app's own guard

**Finding (from `server/scripts/stressTestLargeUpload.ts`):** binary-searched directly against the Supabase Storage API (bypassing our app code entirely) — 50MB uploads succeed, 51MB fails with `EntityTooLarge`. This is a project-level Supabase setting (Settings → Storage → Max file size), not a bug introduced here; confirmed the bucket itself has no override (`file_size_limit: null`), so it inherits the project default.

**Consequence:** our own `UPLOAD_RAW_MAX_BYTES=100MB` guard is currently more generous than what Supabase will actually accept — anything between 50MB and 100MB will pass our validation and then fail at the storage-write step. The error message was improved to say this explicitly rather than a generic failure. Raising the real ceiling requires the owner to change the Supabase project setting; our code needs no change to support up to 100MB once that's done.

## D10 — Migrating file storage from Supabase Storage to Cloudflare R2

**Decision:** User chose to migrate object storage to Cloudflare R2 (after being given the alternative of raising the Supabase limit or compressing large files) — driven directly by D9's 50MB Supabase Storage cap blocking a real 191MB upload. Database stays on Supabase Postgres; only file storage moves.

**Why the adapter pattern (D2) pays off here:** the `StorageAdapter` interface meant this was a new `server/src/storage/r2.ts` implementation (S3-compatible client pointed at R2's endpoint) plus a small `server/src/storage/index.ts` driver-selector reading `STORAGE_DRIVER` from env, with zero changes to any router's business logic — only the 3 call sites' import line changed, from `supabaseStorageAdapter` directly to the new `storageAdapter` indirection.

**Consequence:** R2 has no comparable low per-object size cap, so the compression tool from Phase 16 becomes optional rather than necessary for this file. Requires the owner to create a Cloudflare account, an R2 bucket, and an API token (Account ID + Access Key ID + Secret Access Key) — account/billing setup is something Claude cannot do on the user's behalf, so this is a manual step with guided instructions. `STORAGE_DRIVER` stays `supabase` in `.env` until those credentials are supplied and verified with a real upload.

## D5 — Package manager: npm instead of pnpm

**Decision:** Use npm workspaces. The manual's example commands use `pnpm`; this machine has Node 24 and npm 11 installed, pnpm is not. Functionally equivalent for this project's needs — `npm run check` / `npm test` mirror the manual's `pnpm check` / `pnpm test -- --run`.
