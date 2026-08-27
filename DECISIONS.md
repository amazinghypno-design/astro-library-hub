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

## D11 — OCR runs in-process with Tesseract, not against a cloud OCR API

**Finding:** 24 of the library's 36 files had no usable text — every exported poster (PNG/JPEG, which the upload pipeline skipped entirely) and every scanned book. Those files were findable by title only: invisible to content search, and refused by the per-book Q&A, which needs `extracted_text` to have something in it.

**Decision:** OCR with `tesseract.js` (WASM, in-process) behind an `OcrAdapter` interface, selected by `OCR_PROVIDER` — the same adapter pattern as D2's storage and the AI provider. Page images come from `pdf-parse`'s own image extractor rather than by rasterizing pages, so no native canvas dependency has to survive a deploy; a scanned page *is* one full-page image, so pulling it out is both faithful and much cheaper than rendering.

**Why not a cloud OCR (Google Vision, Azure):** they read Thai markedly better, and they cost money per page and need another account and key. This is one person's collection on a free instance, and measured on real files Tesseract is good enough for the job it has: a clean scanned book came back as accurate Thai with tone marks intact ("มหาบทวัน มหาบทยาม", 11 pages, 21,897 characters in 25s), and its Q&A went from refusing every question to answering them from the text. Decorative poster type is weaker — tone marks and vowels drop ("แก้กำลัง" → "แกกาลง", confidence ~88) — which makes those a good search index and a poor transcript. That is the right trade for search; if exact transcription is ever wanted, a second `OcrAdapter` is one file and one env var.

**Consequence:** OCR is always a last resort, never a first one. A file that carries its own text layer never reaches it (`isTextLayerThin` judges by characters *per page*, so a scan carrying only a scanner header still counts as thin). Everything is bounded — page cap, pixel cap, byte cap, per-file time budget — because this shares half a CPU with the site itself. Three scans of 180–250MB are over the byte cap and stay text-less unless run deliberately with `scripts/backfillOcr.ts --max-mb`.

## D12 — Book covers are page 1, rendered in the admin's browser — not generated by an AI

**Decision:** Every list of files shows a real cover, and that cover is page 1 of the file's own PDF, rasterized by pdf.js **in the admin's browser** at upload time and posted back as a ~40KB WebP (`client/src/lib/renderCover.ts` → `admin.saveCover` → `covers/<fileId>.webp`). Served by `GET /cover/:id` with a one-year immutable cache, version-busted by the file's `updatedAt`.

**Why not an AI-generated cover,** which is what was originally proposed: three reasons, in order of weight.

1. **Image models cannot render Thai.** Almost every title in this library is Thai. A generated cover carrying its own title produces glyphs that look like Thai and read as nothing — on every book, with no exceptions and no prompt that fixes it.
2. **The real cover already exists.** Page 1 is what the owner would recognise off a shelf. An invented cover is prettier in the abstract and less useful in every concrete case.
3. **The AI already wired up cannot draw.** `server/src/ai/groq.ts` is text-only and Groq has no free image endpoint, so this would have meant a second provider and a second key for a worse result.

**Why the browser and not the server:** the free instance has half a CPU and already refuses to compress anything over 25MB for fear of an OOM that takes the whole site down (see `services/postUploadProcessing.ts`), and rasterizing a page needs a canvas it does not have. In the browser, pdf.js is already loaded for the reader, the file's bytes are already in memory from the upload, and the server only ever receives a finished thumbnail. The backfill path (`components/CoverBackfillPanel.tsx`) renders from a presigned URL with range requests, so taking a cover from a 50MB scan costs a few hundred KB, not 50MB.

**Verified:** a real book rendered to 600×849 WebP, 40KB, in ~1s including fetches, with the Thai on the page fully legible; `storeCover` resized a 1200×1700 input to 600×850 and `GET /cover/:id` returned identical bytes as `image/webp` with the year-long cache header, then 404 after removal.

**Consequence:** a cover can only be made where a browser is. There is no server-side path and no cron that can produce one, which is why the backfill is a button an admin presses rather than a script. Non-PDFs (Word, Excel, posters) have no page 1 to photograph and fall back to a designed placeholder — navy gradient, star field, type icon, title in serif. Giving *those* a generated cover is the one place the AI idea still has a job, and it is queued, not built: Groq reading `extracted_text` and returning a theme (palette, motif, mood) that the server composes as SVG, so the Thai title stays real text rather than generated pixels.

## D13 — Two views over the same list: a shelf and an index

**Decision:** Every collection of files (`components/FileCollection.tsx`) renders one of two views, chosen by the reader and remembered in localStorage:

- **cover** — the shelf. Each book's own front page, five across on a desktop.
- **list** — the index. No cover at all, one dense row per file with type, page count, year and size.

**Why both, rather than one good one:** they answer different questions. "Which one was that" is answered fastest by recognising a cover; "what is in this category" is answered fastest by forty titles on one screen, and a cover costs roughly ten rows of the vertical space that question needs. Neither view is a degraded version of the other, which is also why the choice belongs to the reader and not to the page: someone who thinks in titles wants the list on the catalogue, on search results and on an author's page alike.

**Why localStorage and not the URL or the account:** it is a habit, not a place — it should not travel in a shared link, and it should survive for a visitor who never logs in. The homepage's "ไฟล์ล่าสุด" row follows the same saved preference but shows no toggle of its own; it is a showcase, not a browser.

## D14 — Voice search uses the browser's own recogniser, not a transcription API

**Decision:** The microphone in the search box (`lib/useVoiceSearch.ts`, `components/VoiceSearchButton.tsx`) is the Web Speech API, running entirely in the reader's browser with `lang = "th-TH"`. No audio is uploaded to our instance, there is no server route, and a spoken phrase runs the search as soon as the recogniser marks it final.

**Why not a transcription API** (Whisper, Google STT, Groq's audio endpoint): a search box is the highest-frequency thing on the site, and every press of the mic would be an upload plus a paid API call for a query that is usually three words long. The free instance has half a CPU and already refuses to compress anything over 25MB for fear of an OOM (see D11) — it has no business receiving audio either. Meanwhile every phone the owner will actually use this on already has a Thai recogniser sitting behind one JavaScript constructor, at no cost and with lower latency than a round trip.

**The trade, stated plainly:** support is uneven and this is not a feature everyone gets. Chrome, Edge and Safari have the API; Firefox does not ship it at all, and browsers only expose the microphone on a secure origin. So the button *renders nothing at all* when `SpeechRecognition` is missing or `isSecureContext` is false, rather than appearing and then failing — a mic that cannot listen is worse than no mic. Typing is untouched everywhere. The second trade is privacy: Chrome's implementation sends the audio to Google's servers to be recognised. That is Chrome's behaviour, not ours, and it is the same path as the phone keyboard's own dictation key — but it is the reason this is a button someone presses and not an always-on mic.

**Interim results are on** so the field fills in as the reader speaks, which is the only feedback that the mic is actually hearing them; `continuous` is off so one press means one phrase and the microphone indicator goes out when they stop talking.

**Verified** on the homepage hero and the `/search` field: an interim transcript filled the field live with the listening state showing, a final transcript navigated to `/search?q=โหราศาสตร์ไทย` on its own, and a `not-allowed` error rendered the Thai "อนุญาตไมโครโฟน" message instead of failing silently.
