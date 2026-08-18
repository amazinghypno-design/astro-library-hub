# HANDOFF — Astro Library Hub

Status: **local MVP working end-to-end against a real Supabase backend, not yet deployed to the public internet.** This file was updated twice in one long session — first after the initial overnight build, then again after a second round of feature requests (metadata extraction, inline Office viewer, in-document search, UI polish). See "Round 2" below for what changed since the first handoff.

## How to run it

```bash
cd ~/Desktop/Astro-Library-Hub
npm run dev:server   # starts the API on http://localhost:4000
npm run dev:client   # starts the website on http://localhost:5173 (run in a second terminal)
```

Both are currently running in the background from this session (started via `nohup`); if they've stopped, the commands above restart them. Logs: `/tmp/astro-server.log`, `/tmp/astro-client.log`.

## Admin login

- URL: `http://localhost:5173/admin/login`
- Email: `admin@example.com`
- Password: `AstroHub#2026lib`

Change either by editing `.env` (`ADMIN_EMAIL`) and re-running `npx tsx scripts/setAdminPassword.ts '<new password>'` from `server/`.

## What is real right now

- **Database:** real Supabase Postgres project (`qkwzzsrdaedoqejncxpa`, Tokyo region), not a local/fake DB. Connected via the Session Pooler (see DECISIONS.md D7 — the default "Direct connection" host is IPv6-only and unreachable from this network).
- **File storage:** real Supabase Storage bucket `library-files`, not local disk.
- **Content in the library right now:** 1 real PDF ebook you supplied (พรหมชาติ, 40.8 MB) and 2 real .xlsx files you supplied, all uploaded through the actual production code path (not seeded/faked). All test-only fixture files created during development were deleted afterward — nothing fake is left in the database.

## What was verified, and how (not just "should work")

| Claim | Evidence |
|---|---|
| Domain logic (publication policy, duplicate detection, preview classification, upload guards, content-type fix) | 28/28 unit tests passing, `npm test` in `server/` |
| Both workspaces type-check | `tsc --noEmit` clean in `server/` and `client/` |
| DB connection is real | `drizzle-kit push` succeeded + direct `information_schema.tables` query listed all 5 tables |
| Storage adapter is real | Scripted round-trip: put → signed URL → download → byte-equal → delete → confirmed gone (`server/scripts/smokeTestStorage.ts`) |
| Full upload pipeline (checksum, gzip, duplicate guard, publish policy) | Scripted end-to-end test against the live server (`server/scripts/e2eUploadTest.ts`) — upload succeeded, duplicate attempt correctly rejected with 409 before any second storage write, download URL worked |
| Real 40.8 MB Thai-titled PDF | Uploaded via `server/scripts/uploadRealFile.ts`; SHA-256 of the uploaded bytes matched the original file; SHA-256 of the *downloaded* file (via the new `/download/:id` proxy) also matched — byte-perfect round trip end to end |
| Draft/Archived hidden from public | Flipped a real file to `draft` via the admin API — `library.fileById` and `library.files` immediately stopped returning it; flipped back to `published` and it reappeared |
| Unauthorized admin access blocked | `admin.createCategory` without a session cookie returns `401 UNAUTHORIZED` |
| Browser-level check | Logged in, uploaded, searched, and viewed files in the actual rendered app (Claude's browser tool), desktop and 375px mobile, zero console errors after the two bug fixes below |

## Two real bugs found (via testing with your real files) and fixed

1. **Thai text preview showed mojibake.** Root cause: Supabase Storage served `text/plain` files without a charset, so the browser guessed the wrong encoding. Fixed in `server/src/domain/contentType.ts` (adds `charset=utf-8`), covered by tests, re-verified visually.
2. **Downloaded Thai filenames were double-percent-encoded** (would likely show as garbled or fail in some browsers). Root cause: Supabase JS SDK's signed-URL `download` option double-encodes non-ASCII filenames. Fixed by adding our own download proxy (`GET /download/:fileId` in `server/src/index.ts`) that builds the `Content-Disposition` header ourselves. Verified with a Node `fetch` HEAD request (not curl — curl was independently re-encoding the URL, which briefly looked like a third bug but wasn't) and a full byte-for-byte downloaded-file checksum match.

## Known limitations (honest list, nothing hidden)

- **Not deployed.** This only runs on this Mac right now. Going live needs a hosting decision (see below) — deliberately not made without you, per the manual's own rule against provisioning production infra unasked.
- **Admin table inline-editing** only covers status (Draft/Published/Archived). Editing title/author/year/tags after upload isn't wired to a UI yet — the API (`admin.updateFile`) already supports it.
- **No category delete** yet (create only).
- **Upload progress** is stage-based (preparing → compressing → uploading → done), not a live byte percentage. A true percentage would need bypassing the batched tRPC transport for uploads specifically.
- **No automated integration tests with mocked storage** — the storage/upload pipeline is verified with real scripts against the real Supabase project instead, which is stronger evidence but not repeatable in CI without network access.
- **No formal accessibility audit** (labels/keyboard focus exist by construction, but not systematically checked with a screen reader).
- **Large-file ceiling untested beyond ~41 MB** — the 100 MB raw-size guard is unit-tested but not exercised with an actual 100 MB file.
- Session storage is in-memory (`express-session` default) — restarting the server logs everyone out. Fine for local dev, not for production.

## Going live — what has to happen next (needs your decision, nothing done yet)

1. Pick a hosting target for the client (static) and server (Node/Express) — e.g. Vercel/Netlify for the client, Render/Railway/Fly.io for the server. Supabase (DB+storage) stays as-is.
2. Move `SESSION_SECRET`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `ADMIN_PASSWORD_HASH` into that host's environment-variable settings — never commit `.env`.
3. Swap `express-session`'s MemoryStore for a persistent store (e.g. `connect-pg-simple` against the same Supabase Postgres) so logins survive restarts.
4. Point `VITE_API_URL` (client) and `CLIENT_ORIGIN` (server CORS) at the real domains.
5. Re-run the full verification list above against the deployed environment before calling it done.

## Round 2 — built after the first handoff, same session

Everything below is real and verified the same way as round 1 (real files, real API calls, byte/behavior checks — not "should work"):

- **Auto-fill title/author on PDF upload**, conservatively. Reads embedded PDF metadata first (high confidence), falls back to scanning page 1 for an explicit "โดย/เขียนโดย/ผู้แต่ง" label (low confidence), and **leaves fields blank rather than guessing** when neither is found — matches the no-fabrication rule from the original spec. Verified against the real 145-page พรหมชาติ PDF: correctly pulled the embedded title, correctly left author blank (no embedded author, no explicit label on page 1) instead of inventing one. Admin form shows a "(แนะนำอัตโนมัติ)" hint next to auto-filled fields and clears it the moment the admin edits the field.
- **Page count** extracted and shown (145 หน้า for the real ebook).
- **Word (.docx) and Excel (.xlsx/.xls) now open inline in the browser** — no download required. Rendered server-side (mammoth / SheetJS) into sanitized HTML, never handed to a third-party viewer (see DECISIONS.md D8 for why). Verified visually with both real .xlsx files — actual Thai table content rendered correctly.
- **Search inside an open document.** A search box above the preview jumps to and highlights matches with a counter (e.g. "1/1"), verified live against the real spreadsheet content. Multi-sheet tab navigation is implemented for xlsx but unverified since neither real file has more than one sheet yet.
- **Found and fixed a real bug via testing:** Thai text in the plain-text inline preview rendered as mojibake (missing charset on the stored content-type) — fixed, re-verified visually.
- **Found and fixed a real bug via testing:** Thai filenames were double-percent-encoded on download — replaced Supabase's built-in signed-URL download option with our own download proxy (`GET /download/:fileId`) that builds the header itself. Verified with a byte-for-byte SHA-256 match between the original 40.8MB file and the downloaded copy.
- **Found a real infrastructure limit via stress testing:** Supabase Storage's project-wide upload limit is exactly 50MB (binary-searched), independent of and lower than our own 100MB app-level guard. **Needs the owner:** raise it in Supabase dashboard → Settings → Storage → Max file size. See DECISIONS.md D9.
- **UI redesign pass:** serif display font, a consistent card/button/input design system, a gold-accented hero, a bar chart of files-per-category on the home page, a full icon set applied to navigation/stat cards/file lists/upload/download/delete, and a prominent "อัปโหลดไฟล์ใหม่" button at the very top of the home page (previously there was no upload entry point on the public home page at all, despite the original spec calling for one — a gap from round 1, now fixed).

### Still queued, not started (see todo.md Phase 8/9 for full detail)

- Per-file quick actions (change category, delete) directly on the public file cards, not just the admin table
- Full e-reader annotation mode (highlighter, pen, eraser) with annotations stored completely separate from the original file bytes — a bigger rework since it needs a PDF.js-based reader instead of the current plain `<embed>`
- Per-book AI "librarian" Q&A grounded in that book's actual extracted text — **owner chose Google Gemini** as the provider; blocked on the owner creating a free API key themselves (same reason Claude couldn't sign up for Supabase). The groundwork (full-text extraction and storage per PDF) is already built and ready for this.

## Files worth knowing about

- `todo.md` — full phase-by-phase checklist with checked/unchecked state and evidence notes
- `DECISIONS.md` — every non-obvious technical decision and why (D1–D7)
- `ARCHITECTURE.md` — layer/adapter design
- `server/scripts/` — the verification scripts referenced above; safe to re-run any time
