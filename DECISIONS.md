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

## D15 — A private notebook inside the public library, written for an AI to read

**Decision:** The site gains a second kind of content: the owner's own pages (`/notes`) and their skills (`/skills`), stored in two new tables (`notes`, `skills`) and reachable only by a logged-in session. The library's files stay public; this writing is private, and every procedure filters on `user_id = ctx.user.id` rather than trusting the id in the request — a leaked note id is not enough to read, edit or delete a page.

**Why it lives here rather than staying in Notion:** the stated goal is an AI that knows the owner's skills in detail. Notion can hold the writing but cannot be read by the assistant already wired into this site, so `notes.ask` answers questions from the owner's own pages and skill rows and nothing else — same retrieval as the book Q&A (`domain/passageRetrieval.ts`), a different system prompt, and the same refusal to invent: when the notes don't cover it the answer is "ไม่พบข้อมูลนี้ในโน้ตของคุณ", not a guess from the model's general knowledge. Skill rows go into the context whole (they are a few hundred characters and usually what is being asked about); notes are ranked per page so a quoted passage can be labelled with the page it came from.

**Why Tiptap (ProseMirror) and not a contentEditable driven by `execCommand`:** execCommand is a dozen lines to start and then fights you forever — deprecated, implemented differently by every browser, and unpredictable enough on nested lists, checkboxes and tables that ordinary typing can corrupt a page. ProseMirror edits a validated document, which is exactly what makes "paste a whole page out of Notion and have it still be a page" work: markup that doesn't fit the schema is dropped on the way in instead of being stored as breakage. The cost is real and paid where it can be afforded — the editor is 487KB (153KB gzipped), lazily loaded on `/notes` alone, so no visitor to the public library downloads a byte of it.

**Sanitized on write, not on read.** A note's HTML arrives from the owner's own browser, but also from a paste out of Notion or Word carrying whatever those apps emit — script and style included. `domain/noteContent.ts` runs every save through an allow-list (verified: `<script>` and `onclick` stripped, `javascript:` links dropped while their text survives, `data:` URIs allowed on `<img>` and nowhere else) and stores the result, so the row is already safe for anything that later reads it. `content_text` is written at the same time as its own column, because it is what search matches and what the AI is given, and deriving it per request would mean re-parsing every page's markup on every question.

**Two shapes for skills, because both were asked for and both earn their place.** A skill is a row — name, area, level 1-5, years — which is what makes forty of them readable and sortable, plus a page created with it and tagged `สกิล`, which is where the knowledge actually goes. The page is an ordinary note with the ordinary editor rather than a second, weaker one. Deleting a skill leaves its page alone: the writing usually outlives the decision to keep tracking the skill.

**Moving in from Notion** is `domain/markdownToHtml.ts` (Export → Markdown & CSV, the one way out of Notion needing neither their API nor a token) — ATX headings, `- [ ]` checkboxes, pipe tables, fenced code, indented sub-lists, all round-tripping into the editor's own schema. Deliberately not a general CommonMark implementation, and raw HTML in the source is escaped rather than trusted; anything unrecognised survives as plain text, which is the failure mode that loses nothing. Pasting a page straight from Notion into the editor covers the other half, since the browser hands over real HTML on a paste.

**Verified** against the real database through a tRPC caller: create/update/get/list/search/tag, a Notion-shaped Markdown import (nested list, ticked checkbox and a table all converting correctly), a skill created with its page and renamed together with it, and `notes.ask` answering "ฉันมีสกิลอะไรบ้าง" from the owner's own rows — then every test row deleted. The editor itself was driven in a browser: checklist, 3×3 table and highlight all applied and rendered.

## D16 — Your own fonts, no ceiling on length, and a real save button

Three things the notebook was asked for the day after it shipped, and what each one actually changed.

**Fonts the owner uploads themselves.** The site loads two Thai faces from Google Fonts; someone writing their own notebook wants the face their printed material already uses, or one they bought. So a font file now goes in the way a book does — the browser PUTs the bytes straight to object storage through a presigned URL (`fonts.createUploadUrl` → `fonts.finalize`), never through this half-CPU instance, and only the row lands in Postgres (`note_fonts`). `GET /font/:id` streams it back with a year-long immutable cache, and `lib/useNoteFonts.ts` turns the account's rows into `@font-face` declarations while the notebook is open, so the toolbar's font menu, the editor and any later render of the same HTML all work through the ordinary CSS mechanism.

*Why that route has no session check:* a browser fetches a font as an anonymous cross-origin request and sends no cookies with it, so a session-gated font route would simply never load a font in production, where client and API sit on different hosts. What an unguessable UUID exposes is a typeface file — not the writing set in it, which stays behind the notes API. Accepted formats are ttf/otf/woff/woff2 and the `format()` hint is stored on the row rather than sniffed later. Deleting a font takes its bytes with it; notes written in it keep the family name and fall back to the site's own face, exactly as they would on a device where the font hadn't loaded.

*The family name is the contract.* It is what gets written into every note set in that face (`font-family: บรรจง`), so it is asked for at upload time rather than derived from a filename, it is unique per account, and it is constrained to letters (Thai included), digits, spaces and hyphens — which is also what the sanitizer's `font-family` allow-list accepts. A `font-family` that is not a plain name (`url(javascript:…)`) is dropped and the text kept.

**No cap on how much can be written.** The 500,000-character ceiling on a note is gone; a page is limited by what Postgres `text` holds, which is not a limit anybody will reach by writing. The one real ceiling left is the HTTP request itself, and `express.json` went from 5MB to 48MB to match — file bytes never travel through this server (D8), so that limit exists for one thing only: a single note, carrying its own inlined images.

**A save button, because autosave alone is a promise you can't see.** Autosave stays (debounced, now 1.5s) — a notebook that can lose a paragraph to a closed tab is not one anybody will trust with writing they are moving out of Notion. But "did that actually save?" is a question the owner should never have to ask about work they just finished, so there is now a real **บันทึก** button with <kbd>Ctrl/Cmd+S</kbd> behind it, a status line that says either "ยังไม่ได้บันทึก" or the time of the last save, and a browser warning if a tab is closed while something is unsaved. The button is the promise; the autosave is the net.

**Verified** against real storage and the running server: an 825KB TTF uploaded through the presigned URL, read back byte-identical, served by `GET /font/:id` as `font/ttf` with the year-long cache and CORS headers, 404 for an unknown id, and both row and object gone after delete; a duplicate family name and a `.png` refused with their own error codes. In the browser, the font menu listed the two built-ins plus the uploaded family, and applying one wrote `font-family: "Noto Serif Thai"` into the document — markup that survives the sanitizer unchanged, quoted Latin name and unquoted Thai name alike.

## D17 — The notebook is a homepage feature, not a menu item

**Decision:** For a logged-in owner the homepage now opens with the notebook: a **เขียนโน้ต** button in the hero beside the upload button, and directly under the hero a panel (`components/NotebookHomePanel.tsx`) holding a single-line capture box — type the first line, press Enter, and the page is created and opened — plus the four pages worked on most recently and a count of tracked skills.

**Why it outranks the library's own dashboard on that page:** the library is a finished collection that is browsed occasionally; the notebook is written in every day, and the owner has said this is what the site is growing into. A feature used daily should not sit two clicks deep behind a nav item, and "จดอะไรสักอย่าง" is the shortest honest path from wanting to write something down to writing it — a title is optional, so pressing the button with an empty box opens a blank page for somebody in a hurry.

**What a visitor sees: nothing.** Both the hero button and the panel render only for a session, and their queries do not even fire without one. The library is public and this is not; a logged-out homepage should not hint that private pages exist behind it. Both gates now key off "is anybody logged in" rather than the admin role, matching the notes API, which is `authedProcedure`.

**Also fixed here, found while previewing:** Tiptap fires `onUpdate` for transactions carrying no steps — a caret move, or the editor settling after it parses the note's HTML. Treating those as edits marked a page "ยังไม่ได้บันทึก" the moment it was opened and then wrote it straight back to the database with nobody having typed a thing. The editor now emits only when `transaction.docChanged`. Verified in the browser: a freshly opened page reads "บันทึกแล้ว" with the save button disabled, one typed character turns it gold and enables it, and pressing บันทึก returns it to "บันทึกแล้ว 22:11".

**Refactor that made the preview honest:** the page's title/icon/tags/save row moved into `components/NoteHeader.tsx`, presentational and state-free, so the notebook renders it against a real note while the dev-only playground (`/tmp-editor`) renders it against local state — what is seen in the playground is genuinely the same component, not a mockup of one.

## D18 — A microphone in the editor, on the recogniser the search box already uses

**Decision:** The editor toolbar has a mic. Press it and every phrase the recogniser settles on is typed in at the caret; press it again to stop. It sits with undo/redo rather than among the formatting marks, because it is a way of putting words in, not a way of styling them.

**Same engine as D14, one setting apart.** No audio leaves the machine, there is no transcription API and no server route — the browser listens and hands back Thai text (`th-TH`). The one difference from the search box is `continuous`: dictating a page means stopping to think, and a recogniser that ends after each sentence would have to be pressed again every time. Browsers end the session on silence regardless, so the hook restarts it as long as the microphone was not switched off; `no-speech` is treated as a pause rather than a failure, while `not-allowed` or a missing microphone clears that intent so it cannot spin.

**Only settled phrases are inserted.** Interim guesses show in the listening strip beside the button instead, because half-heard words landing in the document and then being rewritten is unreadable. Text goes in as a plain text node, never as HTML, so nothing spoken can become markup. The separating space is decided rather than always added: Thai runs words together, so a space belongs between one spoken phrase and the previous one, and nowhere else.

**Where it isn't:** the button renders nothing in Firefox or on a non-secure origin, exactly as the search mic does — a mic that cannot listen is worse than no mic, and the keyboard next to it still works.

**Verified** with the recogniser stubbed in a real browser: pressing the mic opened a session with `continuous = true` and `lang = "th-TH"` and showed "กำลังฟัง…", two settled phrases landed at the caret as "…เข้าใจได้ ประโยคแรก ประโยคที่สอง" — one space between each, none inside the Thai — and pressing stop ended the session cleanly.

## D19 — Secret: one vault, many subjects

**Decision:** The site is renamed **Secret**, and its top level is no longer "the library" but **หมวดใหญ่ — subjects**: bodies of knowledge, each with its own วิชา, books, pages and skills. Two exist now (`astrology`, `subconscious`); the structure is built for many, because the owner's stated goal is to keep their whole brain here and connect it to AI tools later.

**The rule that shaped the schema:** subjects never mix. Every existing row was filed under โหราศาสตร์ by the migration (38 files, 4 วิชา), and `subject_id` now sits directly on `library_categories`, `library_files`, `notes` and `skills` rather than being reached through a join chain — because every list on the site narrows by subject *first*, and a filter that has to walk two tables to find out which world a row belongs to is one that will eventually get it wrong. A new file inherits its subject from the วิชา it is filed under (derived server-side in `finalizeUpload`, never asked twice), and a วิชา cannot be created without one.

**Why not tags or a top-level category:** categories already exist and are the wrong grain — "ฤกษ์ยาม" is a วิชา inside astrology, not a peer of "สั่งจิตใต้สำนึก". A tag would have been weaker still: nothing would stop a book being tagged into two subjects at once, which is precisely the mixing being ruled out.

**UX:** the homepage is now the vault's table of contents — the notebook's capture box, then the subject cards, then the library's own statistics. `/subject/:slug` is each subject's whole world on one screen: its วิชา with counts, its books, its pages, its skills, and an AI question scoped to it. Uploading asks for the หมวดใหญ่ first and then offers only that subject's วิชา. Counts appear everywhere on purpose: an empty subject should look empty, since that is an invitation to fill it.

**Caught while building this:** drizzle renders a bare column reference inside a raw `sql` subquery unqualified (`"id"`), which binds to the *inner* table and silently returns zero — every category count came back 0 against a database that plainly had 38 files in them. The fix is `${table}.id` rather than `${table.id}`; it is written down here because it fails as a wrong number, never as an error.

**Still queued:** a read-only export for AI tools (Codex, Claude Code) — one endpoint per subject returning its pages and skills as Markdown behind a key, so an outside assistant can read this knowledge without a browser session. The structure above is what makes that a small job: a subject is already the unit an outside tool would ask for.

**Verified** against the real database and in the browser: `subjects.list` reports 38 ไฟล์ / 4 วิชา for โหราศาสตร์ and zeroes for สั่งจิตใต้สำนึก; the hub page shows ทักษาพยากรณ์ 4, ฤกษ์ยาม 7, เลข 7 ตัว 7, โหราศาสตร์ไทย 20 (38 total, matching the raw count); `library.files({ subject: "subconscious" })` returns nothing while `astrology` returns all 38.

## D20 — The vault's shape is edited from inside the vault

**Decision:** `/admin/subjects` ("หมวดใหญ่และวิชา") is where the structure is changed: create a หมวดใหญ่, rename one (name, emoji, description), add a วิชา *inside* the subject it belongs to, move a วิชา to another subject, and delete either — all on one page.

**Why one page and not two:** subjects and วิชา are one decision — "what is kept here, and how is it divided". Splitting them across two screens is exactly what produces things filed in the wrong place: you would create a วิชา on one page and then pick its parent from a dropdown, which is a question asked after the fact and answered carelessly. Here every subject is a card holding its own วิชา, and the "เพิ่มวิชา" box sits inside that card, so the parent is context rather than a field.

**Thai slugs are allowed.** A Thai-named subject should not have to invent an English handle before it can exist, and the existing วิชา slugs already carry Thai. The slug is auto-filled from the name and stays editable, because it is the stable id an outside tool (Codex, Claude Code) will store — and for that reason renaming a subject deliberately does *not* change it.

**Two guards, both refusing rather than guessing:** a subject cannot be deleted while it still holds a วิชา, a file or a page (the alternative — silently orphaning them — is not something a delete button should be able to do), and moving a วิชา takes its files with it, since leaving them behind is the mixing this whole structure exists to prevent.

**Verified** against the real database through the same procedures the page calls: a subject created with a Thai slug, renamed with a new emoji and description, given a วิชา (count went to 1), refused deletion while occupied (`SUBJECT_NOT_EMPTY`), its วิชา moved into โหราศาสตร์ and confirmed there, then the emptied subject deleted and the test วิชา removed — leaving โหราศาสตร์ at 4 วิชา / 38 ไฟล์ and สั่งจิตใต้สำนึก at 0/0, exactly as before.

## D21 — A bookmark says what the page was about

**Decision:** A bookmark is no longer just a page number. `bookmarks` gains a `note` column and both readers (PdfReader, OfficePreview) let the reader write, edit and clear a short line describing what they marked — asked for at the moment they mark it.

**Why the moment of marking:** a list of "หน้า 5, หน้า 21, หน้า 88" is unreadable a month later, which is the failure this fixes; and the only time the reason is still in the reader's head is the second they press the button. So marking a page opens the list with that bookmark's note field already focused, Enter saves, Escape leaves it blank. Nothing forces a note — an unwritten one shows as "ยังไม่ได้เขียนว่าหน้านี้เกี่ยวกับอะไร" and can be filled in later from the same list, with the pencil beside it.

**Empty string, not null.** Bookmarks made before this column existed read as "no note yet" rather than as a third state every screen would have to distinguish. The same holds on the device-local side: `getBookmarks` still accepts the old `[5, 21]` shape saved in localStorage and reads it as notes-less bookmarks, rewriting it in the new shape on the next save — nobody loses a bookmark to the upgrade.

**One list, both readers.** The panel is `components/BookmarkMenu.tsx`, shared by the PDF and Office readers, so the note-editing behaviour cannot drift between a book and a spreadsheet. Writing a note on a page that isn't bookmarked yet creates the bookmark (`setBookmarkNote` on the server, `setBookmarkNoteLocal` in the browser), because marking and describing are one gesture to the reader and shouldn't need two round trips in the right order.

**Verified** in the browser against the running app: bookmarking a page opened the panel with the note field focused, a Thai note typed and saved appeared in the list and in localStorage as `[{"pageNumber":5,"note":"…"}]`; a legacy `[3,9]` written into localStorage came back as two notes-less bookmarks rather than disappearing; editing an existing note preloaded it and saved the correction; the trash button removed the bookmark and the whole list with it. The same flow was driven end to end in the Office reader on a real .xlsx. On the account-synced side the new column was added to the live database (`ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT ''`, kept as `server/scripts/addBookmarkNoteColumn.mjs`) and read/updated through drizzle with the existing rows restored afterwards.

## D22 — โปรแกรม Excel: a place to keep the tools, not just the tables

**Decision:** `document_type` gains a seventh value, **`program`** — a macro-enabled Excel workbook (`.xlsm`, `.xlsb`, `.xltm`, and the add-in formats `.xlam`/`.xla`). It gets its own filter chip, its own homepage tile, and its own route (`/programs`), beside E-book, เอกสาร, ตารางข้อมูล, สไลด์ and โปสเตอร์.

**Why not just file them under "ตารางข้อมูล":** the owner's ask was to preserve programs — spreadsheets that carry formulas and macros, kept so they survive and can be fetched back — and that is a different thing to look for than a table of data. Folding them into "spreadsheet" would have made a library of 1 data file and N tools indistinguishable from a library of N+1 tables. `classifyDocumentType` therefore tests for the macro formats *before* the plain-spreadsheet test, since a `.xlsm` is also "a spreadsheet" by MIME and the more specific answer is the useful one.

**Storage only — nothing is executed.** The file is stored byte-for-byte and downloaded byte-for-byte (the `/download` route has always served the untouched `storageKey`), so formulas and VBA come back exactly as they went in. The inline preview renders the *sheets* through SheetJS on our own server, the same path .xlsx already used — it is a picture of the workbook, never a run of it. Add-ins (`.xlam`/`.xla`) have no sheets to show and fall to `download-fallback`.

**Extension is load-bearing, not MIME.** Safari and Firefox report nothing for `.xlsm`, which reaches the server as `application/octet-stream`. Every decision about these files — type, preview, text extraction — therefore consults the filename too (`domain/excelFormats.ts`, the single list all three import), and `lib/mimeFromName.ts` fills in the real Excel MIME at upload time so the stored row, and the download that reads it, hand the browser something Excel will open.

**Enum growth, not a push.** `drizzle-kit push` offers to drop and recreate a changed enum, which would take every row's `document_type` with it; the value was added with `ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'program' BEFORE 'slide'`, kept as `server/scripts/addProgramDocumentType.mjs`. The homepage counts each type by name, so this had to be run *before* the new code served a request.

**Verified** against the live database and in the browser: the enum reads `ebook, document, spreadsheet, program, slide, poster, other`; the homepage renders the new โปรแกรม Excel tile (0 files, 39 total unchanged) with no console or server errors; `/programs` and `/library?type=program` both resolve to the โปรแกรม Excel view with its empty state, and the chip appears in every category view. The pipeline was run over the bytes of a real `.xlsm` carrying Thai sheet names and a formula: `documentType: program`, `preview: xlsx-inline`, text extracted as `[ฐานคำนวณ] สูตรคำนวณดวง,ค่า,ผลลัพธ์ …`, and the sheet rendered to HTML — identically whether the MIME arrived as `application/vnd.ms-excel.sheet.macroEnabled.12` or as `application/octet-stream`.
