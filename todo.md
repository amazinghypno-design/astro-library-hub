# todo.md — Astro Library Hub

Source of truth for build progress. Check items only when actually verified (test passing / browser evidence), not on compile alone.

## Phase 0 — Preflight
- [x] Read manual: 00-START-HERE, PROJECT-SPECIFICATION, SCREEN-BY-SCREEN-UX, DATA-AND-API-CONTRACT, MASTER-PROMPT, GREENFIELD-BUILD-PROMPT
- [x] Confirm no existing source project reference on disk (D1)
- [x] Write ARCHITECTURE.md, DECISIONS.md, .env.example
- [ ] Owner review / go-ahead to start Phase 1

## Phase 1 — Domain and database
- [x] npm workspace scaffold (client/, server/)
- [x] Drizzle schema: users, library_categories, library_files, ai_work_items, ai_work_item_events
- [x] Connected to real Supabase Postgres (session pooler, see DECISIONS.md D6/D7) and pushed schema — verified via information_schema query
- [x] Domain pure functions: publicationPolicy, duplicatePredicate, previewCapability(mimeType, originalName), safeStorageKey, uploadGuards
- [x] Unit tests for each domain function (25 tests passing, no DB/network)
- [x] Supabase Storage adapter (put/get/delete/createDownloadUrl/createPreviewUrl) — verified with real end-to-end smoke test (put/signed-url/round-trip byte-equal/delete/confirm-gone), including Thai text + Thai filename
- [x] Local admin auth adapter (bcrypt + session cookie) — verified end-to-end: correct password returns admin user (auto-seeded in real `users` table), wrong password returns null

## Phase 2 — Application/API
- [x] tRPC router skeleton (public + admin) — server/src/routers/{trpc,auth,library,admin,index}.ts
- [x] auth.me, auth.login, auth.logout — verified via curl: login sets session cookie, me reflects it, logout destroys it
- [x] library.dashboard, library.categories, library.files (list/search), library.fileById, previewUrl, downloadUrl
- [x] admin.createCategory, admin.upload, admin.updateFile, admin.deleteFile, admin.dashboard, admin.adminFiles, admin.fileDownloadUrl
- [x] Structured error signals via TRPCError code+message (DUPLICATE_FILE with existing-file cause, RAW/TRANSPORT/DECODED size limits, CHECKSUM_MISMATCH, CATEGORY_NOT_FOUND, UNAUTHORIZED/FORBIDDEN) — not yet a formal shared error-code enum type
- [x] Unauthorized regression verified: admin.createCategory without session cookie -> 401 UNAUTHORIZED (curl evidence)
- [x] Public-filter regression verified: draft file invisible to fileById/files search (curl evidence, see Phase 5)
- [ ] admin.deleteCategory / category reassignment on delete — NOT built

## Phase 3 — Storage and upload
- [x] StorageAdapter interface (server/src/storage/types.ts) + Supabase Storage implementation (supersedes local-fs plan per D6)
- [x] Safe ASCII storage key generation preserving extension (server/src/domain/safeStorageKey.ts)
- [x] gzip transport decode + SHA-256 checksum verification (server/src/routers/admin.ts upload procedure)
- [x] raw/decoded/transport size guards (server/src/domain/uploadGuards.ts, wired into admin.upload)
- [x] Duplicate guard (normalized title/filename within category) before storage write — verified via e2eUploadTest.ts: second upload with same title in same category returns 409 DUPLICATE_FILE, no new storage object created
- [ ] Integration tests with fake/mocked storage — NOT written as automated tests; verified instead via real Supabase smoke-test scripts (scripts/smokeTestStorage.ts, scripts/e2eUploadTest.ts), which is real-system evidence but not a repeatable CI-safe test

## Phase 4 — UI and viewer
- [x] Global layout + navigation (mobile back-to-home) — client/src/components/Layout.tsx, verified at 375x812
- [x] Home: hero/search, real counts, categories, recent files, empty states — browser-verified with real zero-state and real 1-file state
- [x] Search `/search`: keyword, pagination controls, server-side published filter — browser-verified with Thai keyword
- [x] Catalog `/library` (+ `/ebooks`, `/documents` routes reuse the same component/query; they do not yet apply distinct type filters — see limitations)
- [x] Categories `/categories`
- [x] FileDetail `/file/:id` with shared previewCapability helper — browser-verified (pdf-inline path rendered an embed, download/open-full-window links generated real signed URLs)
- [x] AdminLibrary: drag-drop + file picker, metadata form, category select, status selector, save, delete-with-confirm, clear-selected-file-before-save — browser-verified login → upload pipeline (via script, not literal OS drag-drop — browser tool can't inject real OS files) → table → dashboard update → delete → back to zero
- [x] AdminCategories: create with slug uniqueness check
- [x] Inline edit of title/author/year/category/document type/page offset — DONE across Phases 10/15/19. Tags specifically are still not exposed in any UI (always saved as `[]` at upload, no edit field) — remaining real gap.
- [ ] Formal accessibility audit — labels/semantic buttons are in place by construction, but no systematic screen-reader/contrast pass was done
- [ ] Mobile nav overflow — nav links scroll horizontally on 375px width instead of collapsing to a menu; usable but not polished

## Phase 5 — Verification
- [x] npm run check (typecheck) — clean on both server and client
- [x] npm test -- --run (server domain suite) — 25/25 passing
- [x] Browser verification: `/`, `/search`, `/file/:id`, `/admin/login` → `/admin/library` — desktop (native) and mobile 375x812, zero console errors
- [x] Draft/Published/Archived visibility: verified live — flipping a file to draft removed it from public fileById + search within one request, restoring to published brought it back
- [x] Duplicate guard: verified live via script (second upload same title/category -> 409, no orphan storage object)
- [x] Thai filename + Thai text content: verified through storage smoke test and the real upload test (title "ไฟล์ทดสอบระบบอัปโหลด", filename "ทดสอบ-คัมภีร์.pdf")
- [ ] Upload edge cases NOT yet tested: real Office document (download-fallback UI), real image/text file (inline preview UI), a near-100MB file, an actually-corrupt/mismatched checksum, expired preview URL error state
- [ ] Lint — no ESLint config was set up; only `tsc --noEmit` ran

## UI polish (added mid-session per owner request while working overnight) — DONE
- [x] Icon set per function (client/src/components/icons.tsx: home/search/library/category/ebook/document/spreadsheet/upload/download/expand/trash/lock/star/folder) wired into nav, stat cards, categories, file actions, upload zone, admin table, login
- [x] Serif display font for headings (Noto Serif Thai) + card/button/input design system in index.css
- [x] Hero redesign with gold radial glow + star pattern + refined typography
- [x] Mobile nav overflow fix — icon-only nav below the `sm` breakpoint (labels return at desktop width), verified at 375px with no clipping
- [x] Consistent card/button classes applied across Home/Search/Catalog/Categories/FileDetail/AdminLogin/AdminLibrary/AdminCategories

## Real-file testing (owner supplied 3 real files mid-session) — found and fixed 2 real bugs
- [x] Uploaded a real 40.8 MB Thai-titled PDF ebook (พรหมชาติ, author เทพ สาริกบุตร) end-to-end — checksum verified byte-identical after upload AND after download
- [x] Uploaded 2 real .xlsx files — correctly classified as `download-fallback` (Excel isn't browser-inline-able), download byte-verified
- [x] **Bug found+fixed:** Thai text in `text/plain` preview rendered as mojibake — Supabase Storage served the MIME type without `charset=utf-8`, so the browser guessed the wrong encoding. Fixed via `server/src/domain/contentType.ts` (`storageContentType`, appends charset for text/* types), covered by 3 new unit tests, re-verified visually in-browser with correct Thai rendering.
- [x] **Bug found+fixed:** Download filenames double-percent-encoded for non-ASCII names — Supabase JS SDK's signed-URL `download` option mis-encodes Unicode. Fixed by replacing it with our own proxy route `GET /download/:fileId` (server/src/index.ts) that streams from storage and sets `Content-Disposition` itself via `buildContentDisposition`. Verified with Node `fetch` (not curl, which was masking/adding its own encoding) showing correct single-encoded `filename*=UTF-8''...` header, and a full downloaded-file SHA-256 match against the original.

## Phase 7 — Smart metadata & universal inline viewer — 7a and 7c DONE, 7b done (needs owner action)

### 7a. Auto-extract title/author on upload — DONE
- [x] Reads embedded PDF metadata (Title/Author) first via `pdf-parse` (server/src/services/pdfMetadata.ts) — high confidence
- [x] Falls back to scanning page 1 text for an explicit "โดย/เขียนโดย/ผู้แต่ง/ผู้เขียน" label — low confidence, and takes the longest line as a low-confidence title guess only when nothing embedded exists
- [x] Never fabricates: pure, tested domain functions in `server/src/domain/metadataExtraction.ts` (8 unit tests) enforce "leave blank when unsure" — verified live: real PDF got a correct high-confidence title, author correctly left blank rather than guessed
- [x] Admin form pre-fills but stays editable — shows "(แนะนำอัตโนมัติ)" hint, clears the moment the admin types over it
- [ ] .docx/.xlsx metadata extraction (author from document properties) not done yet — PDF only so far

### 7b. Compression review for large files — DONE (found a real limit, needs owner action)
- [x] Already lossless (gzip transport, verified byte-identical round trip)
- [x] Stress-tested a real ~95MB file end-to-end via `server/scripts/stressTestLargeUpload.ts` — **found the real bottleneck**: our own app-level guard allows up to 100MB, but the **Supabase Storage project has a global upload limit that is currently exactly 50MB** (binary-searched: 50MB succeeds, 51MB fails with `EntityTooLarge`). Confirmed via a direct raw upload test against the bucket, independent of our app code, so this is a Supabase project setting, not a bug in what was built here.
- [ ] **Needs the owner:** raise the limit in the Supabase dashboard → Project Settings → Storage → "Max file size" (this is a plan-dependent setting; free tier may cap how high it can go — check the number offered there). Once raised, our own `UPLOAD_RAW_MAX_BYTES`/`UPLOAD_TRANSPORT_MAX_BYTES` (currently 100MB/150MB in `.env`) already accommodate up to 100MB with no code change needed — they'd only need to change if going above that.
- [ ] Until raised: files over 50MB will fail at the storage-write step with a clear `STORAGE_WRITE_FAILED` error rather than corrupting anything (verified — no orphan DB row or partial file is left behind), but the error message shown to the admin doesn't yet explain *why* (should surface "the file is over the current 50MB storage limit" specifically instead of a generic failure — small follow-up)

### 7c. Inline web viewer for every file type (no forced download) — DONE for docx/xlsx
- [x] docx -> HTML inline preview via `mammoth`, sanitized server-side before reaching the client
- [x] xlsx -> HTML table inline preview via `xlsx`/SheetJS, one tab per sheet, sanitized server-side
- [x] `previewCapability` extended with `docx-inline`/`xlsx-inline` (9 unit tests) — verified live with 2 real .xlsx files
- [ ] pptx and legacy binary .doc: still `download-fallback` — needs LibreOffice headless or a paid conversion API, a real infra decision that should be confirmed with the owner before adding (not done, intentionally not guessed at)

## Phase 9 — In-document navigation & search inside the viewer — scoped version DONE, PDF-specific search still queued

Owner's ask: opening a spreadsheet/document inline shouldn't mean endless scrolling — needs (1) quick navigation buttons/tabs to jump to a section, and (2) a search box where typing a keyword jumps straight to the matching content, "like Google" — this is about search *within one open document*, not the site-wide search that already exists on `/search`.

- [x] xlsx-inline: sheet-tab navigation when a workbook has multiple sheets (jump between sheets instead of one long stacked page) — implemented (`client/src/components/OfficePreview.tsx`), typechecked; **not yet exercised with a real multi-sheet file** since both real .xlsx files uploaded so far only have one sheet each — tab bar correctly stays hidden for single-sheet files (verified), multi-sheet behavior is implemented but unverified with real data
- [x] Search-within-preview: a small search box above the rendered docx/xlsx content that jumps to and highlights the next match on Enter/click, with a match counter — **verified live** against the real "คัมภีร์จักรทีปนี" spreadsheet: typed "ศัตรูปองร้าย", got "1/1", exact text highlighted in gold and auto-scrolled into view
- [ ] Same search-within-document behavior for the PDF viewer specifically is a separate, bigger piece of work — the current PDF preview is a plain `<embed>` (native browser PDF viewer), which already has its own built-in Ctrl+F search, but we don't control or extend that UI. Providing our *own* in-app PDF search box would require switching to a PDF.js-based custom reader — the same underlying rework already queued for 8b's highlighting feature, so folding PDF-specific search into that effort rather than duplicating it here.

## Phase 8 — Reader experience & AI librarian — 8a-i/8a-ii DONE, rest still queued

### 8a-i. File-type icon on every file card (Home recent files, Search results, Catalog) — DONE
- [x] Added `client/src/lib/fileTypeIcon.tsx` (mimeType -> ebook/document/spreadsheet/other icon, mirrors the server's `mimeTypeFamily` classification) and applied it to Home/Search/Catalog file cards

### 8a-ii. Big, front-and-center upload entry point — DONE
- [x] Added a full-width gold "อัปโหลดไฟล์ใหม่" button as the very first thing on the home page, above the hero — verified visually
- [x] Mobile: the existing "เลือกไฟล์" button already opens the native file/photo picker on phones (drag-and-drop isn't a real gesture on touch devices), so this satisfies "upload from mobile" now that it's easy to find

### 8a-iii. Per-card quick actions (change category, delete) directly from file cards on Home/Search/Catalog — DONE
- [x] `client/src/lib/useAdminSession.ts` — real session check (`auth.me`), never guessed; `client/src/components/FileCardActions.tsx` renders a "⋯" button + popover (category select + delete) only once a real admin session is confirmed
- [x] Verified live: clicking "⋯" on a Home page file card opens the popover without navigating away (click doesn't fall through to the card's link), shows the file's current category pre-selected, delete button present
- [x] Wired into Home, Search, and Catalog file cards

### 8a. Per-file actions in admin table — DONE (edit added; kept as separate buttons rather than a "⋯" menu since there are only 2 actions)
- [x] Added inline "แก้ไข" (edit) per row — expands to an editable title/author/year/category form, save/cancel — verified live: changed a real file's year to 2560, confirmed it persisted by reading the public FileDetail page back
- [x] Delete already existed; "ลบ" and "แก้ไข" sit side by side per row now
- [x] Added `admin.deleteCategory` (blocks deletion when the category still has files — verified via API: blocked with `CATEGORY_HAS_FILES` on the real category, succeeded on an empty test category) + a delete button on AdminCategories

### 8b. E-reader mode: full annotation toolkit (expanded scope per owner — like GoodNotes on iPad)
- [ ] Bigger lift than it sounds: the current PDF viewer is a plain `<embed>`, which cannot support drawing/highlighting at all — needs a real PDF.js-based reader (renders pages to canvas, plus a transparent drawing layer on top per page) instead
- [ ] Toolset requested: highlighter (freeform, not just text-selection based), pen/short handwritten notes, eraser (removes only annotation strokes, never touches the underlying page render), save
- [ ] **Critical constraint from owner: annotations must be stored completely separate from the original file** — never burned into or overwriting the stored PDF bytes. Implementation: a new `file_annotations` table (fileId, userId, pageNumber, strokeData as vector points/SVG path, color, tool, createdAt) rendered as an overlay layer on top of the untouched original; original file in storage is never modified, so it's always safe to hide/show/delete all annotations without any data loss risk to the source document
- [ ] Scope decision needed: annotations are inherently per-reader — since there's currently only one admin account, this starts as a personal admin feature; would need real per-user accounts to become a multi-reader feature later (changes the auth model, D3) — flagging rather than guessing
- [ ] This depends on the PDF.js reader rework already needed for highlighting, so 8b is one combined effort, not two

### 8c. Per-book AI "librarian" Q&A grounded in that book's actual text
- [ ] Extract full text per file at upload time (reuse the pdf-parse pipeline being built in 7a) and store it (new column/table) so questions can be answered from the real content, not invented
- [ ] Retrieval: for a single-book Q&A, simple keyword/substring search over the extracted text is enough to start (no need for a vector DB at this scale) — pull the most relevant passages and hand them to the AI as context, and answer should decline rather than guess when nothing relevant is found
- [x] Provider decided by owner: **Google Gemini** (free tier). Owner still needs to create the free API key themselves at aistudio.google.com (same reason as Supabase — Claude cannot sign up for accounts); will walk through it step by step when this phase starts.
- [ ] Once a key is supplied: store it server-side only in `.env` (never sent to the browser), add an `AiAdapter` interface (mirrors the `StorageAdapter`/`AuthAdapter` pattern already used) so swapping providers later doesn't touch the rest of the app
- [ ] UI: a chat panel on the FileDetail page, scoped to that one book, answers must be able to say "ไม่พบข้อมูลนี้ในเล่มนี้" when the book doesn't cover the question rather than making something up (same anti-fabrication rule as metadata extraction)

## Phase 10 — Author pages, private share links, popover redesign — DONE (owner feedback)

- [x] **Popover redesign**: replaced the form-in-a-box look with a compact native-style context menu (`client/src/components/FileCardActions.tsx`) — "ย้ายหมวดหมู่" and "ลบไฟล์" as tight menu rows, category picker only appears after clicking "ย้ายหมวดหมู่" instead of always taking up space
- [x] **Author pages**: clicking an author name (on FileDetail or any file card) goes to `/author/:name`, listing every published work by that exact author — verified live: clicked "เทพ สาริกบุตร" on the พรหมชาติ card, landed on a page showing "พบ 1 ผลงาน" with the correct file
- [x] Along the way: refactored file cards (Home/Search/Catalog/AuthorWorks) into one shared `FileCard` component using a clickable `<div>` instead of nesting a `<Link>` for the author inside the card's own `<Link>` — invalid HTML otherwise (nested anchors), per TROUBLESHOOTING-HANDBOOK's own warning
- [x] **Private share links**: admin can generate a link to one specific file (with no-expiry/1/7/30-day options) that anyone holding the link can view without logging in — even if the file is still a Draft. Revocable any time. New `share_links` table, `domain/shareLink.ts` (5 unit tests) for the expiry/revoke rule, `/share/:token` public page, management UI on FileDetail (create/list/revoke)
  - Verified the full lifecycle for real: created a link → fetched it with zero cookies (true anonymous request) → succeeded → revoked it → same request now correctly fails with `SHARE_LINK_INVALID_OR_EXPIRED`
  - Download-by-token also works (`/download/:fileId?token=...`), verified via the same pattern

## Phase 11 — Real bug: PDF preview was an unreliable black box in real browsers — FIXED

Owner reported the PDF preview showed a plain black box on a real desktop browser (not just my own sandboxed test browser, which I'd wrongly assumed was the only place affected). Confirmed real and root-caused: relying on the browser's native `<embed>`/`<iframe>` PDF viewer for a cross-origin signed URL is inconsistent across browsers, especially for large scanned PDFs — no rendering, no error, just blank.

- [x] **Fixed properly, not patched**: replaced browser-native embedding with our own `pdfjs-dist`-based reader (`client/src/components/PdfReader.tsx`) that renders each page to a `<canvas>` ourselves — same underlying technology the annotation feature (8b) already needed, so this is foundational work, not a throwaway fix
- [x] Paginated (prev/next + "หน้า X / Y"), fits width, explicit loading and error states (a real error message now, never a silent blank box again)
- [x] **Verified live against the real 145-page พรหมชาติ scan**: page 1 rendered, clicked "ถัดไป" → advanced to page 2 with new content rendered, page count matches the 145 extracted earlier by the server — and this worked even in the automated test browser that has no native PDF plugin at all, which is strong evidence the fix doesn't depend on browser-specific PDF support anymore
- [ ] **Still needs the owner to confirm on their real machine** — my verification is real but from my own environment; asked them to check

## Phase 12 — Real bug: delete button appeared to do nothing — FIXED (root cause, not a patch)

Owner reported the delete button in the admin table stopped working. Root cause: sessions were stored in-memory (express-session default) — every dev-server restart (which happens on every file save, and there were dozens this session) silently logged everyone out, and admin mutations had no `onError` handler, so a 401 just did nothing visible. Not a delete-specific bug — every admin action was equally at risk, delete was just the one that got clicked.

- [x] Swapped to a **persistent, Postgres-backed session store** (`connect-pg-simple`, new `session` table) — sessions now survive server restarts
- [x] **Verified the actual mechanism, not just the symptom**: logged in, forced a server restart, replayed the *same pre-restart* cookie against `auth.me` — still authenticated. This is the real proof, independent of any UI test.
- [x] Added `explainAdminError()` (`client/src/lib/explainAdminError.ts`) and wired real `onError` handlers into every admin mutation that was missing one (delete file, update file, create category, delete category, and the per-card quick actions) — an expired session now shows "เซสชันหมดอายุ...กรุณาเข้าสู่ระบบใหม่" instead of nothing happening
- [x] **Found a second real bug while investigating**: the delete button's `onClick` called `closeAll()` unconditionally, outside the `if (confirm(...))` check — harmless to the actual delete call, but suspicious enough (and native `confirm()` dialogs are inherently untestable/fragile) that native `confirm()` was replaced everywhere (file delete in the admin table, category delete, and the per-card quick-actions delete) with a real in-app `ConfirmDialog` component (`client/src/components/ConfirmDialog.tsx`) that shows a proper busy state
- [x] **Verified the full click-through path for real** (not just via API): uploaded a disposable test file, clicked "ลบ" in the admin table, the new dialog appeared, clicked "ยืนยันลบ", the row disappeared from the list immediately — genuine end-to-end proof, not an assumption

## Phase 13 — /library reorganized into category folders + type filter chips (owner feedback)

- [x] `/library` with no category selected now shows category "folders" to browse instead of a flat list — verified live
- [x] Selecting a category shows a breadcrumb (คลังทั้งหมด / [หมวด]) + filter chips (ทั้งหมด/E-book/เอกสาร/ตารางข้อมูล) scoped to that category — verified live: clicking "E-book" correctly narrowed 3 files down to just the 1 PDF
- [x] `/ebooks` and `/documents` still work as dedicated cross-category type views (unchanged behavior), now reusing the same `type` filter added to `library.files` server-side

## Phase 14 — Big backlog from owner (25 items), audited against current state — queued, not started unless noted

Owner asked for every item to be checked against what's already built before queuing, to avoid duplicating existing work. Grouped by theme:

**Already done / overlaps with existing work (noted, not re-queued as new):**
- PDF now opens on web (item 8) — fixed in Phase 11 (custom PDF.js reader); the one file that still failed for the owner was independently confirmed corrupted at the source, not a viewer bug
- Search with snippet/page number/highlight (item 9) — partially done: docx/xlsx already have in-document search with highlighting (Phase 9). PDF-specific in-document search does not exist yet — folds into 8b/the reader work below, not a separate feature
- Duplicate detection (item 16, first half) — already enforced at upload time (Phase 3). "Version badge / latest version" (second half) is genuinely new — see below
- Category search (item 17, first half) — already exists on `/categories`. Filter chips / breadcrumb / frequently-used list (rest of item 17) are new
- Reader controls: search/next/prev/fullscreen/back-to-contents (item 23) — next/prev already built (Phase 11); search, fullscreen, and TOC are new, listed below
- No fake reviews/scores constraint (item 21) — already a hard rule from the original spec; the recommendation feature itself is new

**New: AI & content trust**
- [ ] AI Q&A that cites file name + page number when answering (item 1) — extends the already-queued 8c per-book AI librarian; the "must cite page number" requirement is the key new detail to design in from the start, not bolted on after
- [ ] Provenance/copyright system: owner, creator, source, creation date, edit history, license, checksum-of-original (item 2) — checksum/createdAt/createdBy already exist; missing: explicit source/license fields, and **an actual edit-history log** (today `admin.updateFile` just overwrites with no audit trail) — needs a new `file_edit_history` table
- [ ] Recommend similar documents by category/tag, no fake scores (item 21)

**New: reading experience (mostly depends on the PDF.js reader from Phase 11 as its foundation)**
- [ ] In-PDF search with snippet/page/chapter/highlight (items 9, 23) — natural extension of Phase 11's reader
- [ ] Table of contents / chapter navigation with breadcrumb + "jump back" (item 13) — Phase 19's page-jump input (types a TOC page number, admin-set offset does the math) covers the "type a page number from the contents" half; still missing: an actual clickable TOC/outline UI and a "jump back to where I was" breadcrumb. `pdf-parse`'s `getInfo()` already extracts a PDF's outline/bookmarks, so the data source exists for the outline piece.
- [ ] Fullscreen mode, hide controls, pinch-to-zoom, fit-width, rotate support on mobile (item 11, part of 23)
- [ ] Font size, background color, dark mode, sepia mode, line spacing, contrast (items 5, 12) — for docx/xlsx text preview and PDF alike
- [x] Reading progress (last page/%) + "continue reading" button (items 3, 10) — DONE in Phase 19, device-local (localStorage) since there's no account system yet
- [x] Bookmark/pin important pages (item 4) — DONE in Phase 19, same device-local scope
- [ ] Personal notes, private by default (item 19) — folds into the already-queued 8b annotation system

**New: requires a real decision — public accounts (blocks several items below)**
- [ ] Continue reading on phone from where you left off on a computer (item 6), personal bookshelf/shelves like "reading/finished/review" (item 20), starred favorites (item 25), saved searches (item 22) — **all of these need to know who "you" are across devices**, which the current single-admin-credential setup (D3) does not support for public visitors. Device-local storage (e.g. browser localStorage) can fake single-device versions of #3/#4/#25 without accounts; cross-device sync genuinely cannot. This needs an explicit decision from the owner before starting: add real public sign-up/login, or scope these to "this device only" for now.

**New: offline & network resilience**
- [ ] Read on poor networks with clear permissions (item 7) — implies offline caching (service worker / PWA), a substantial addition; permissions side is already covered (status/visibility + share links)
- [ ] Download progress (type/size/permission/%/speed/retry/success) (item 14) — file type/size already shown pre-download; live % and speed aren't, since actual downloads currently go through a plain link rather than JS-driven fetch
- [ ] Resumable/retry download with a readable failure reason (item 15) — needs Range-request support added to the `/download/:fileId` proxy

**New: admin/catalog quality-of-life**
- [ ] Version badge + "latest version" label (item 16, second half) — real versioning is new; currently re-uploading is blocked as a duplicate rather than treated as a new version
- [ ] Category filter chips + frequently-used categories list (item 17, second half)
- [ ] Broken-file health check + a report page (item 18) — script/admin page that verifies every DB record's storage object still resolves
- [x] Pie/donut chart of file distribution by category (item 24) — DONE, added next to the existing bar chart on Home (`client/src/components/CategoryDonutChart.tsx`), reuses the same `categoryCounts` data, verified live

## Phase 15 — Slide vs ebook vs poster document types
- [x] DONE. User found that PDF slide decks (landscape) were being shown identically to PDF ebooks (portrait) since both share `application/pdf` — asked for them to be split into a "slide" type, plus a new "poster" type for non-PDF poster images.
- [x] New `document_type` enum + column on `library_files` (`server/src/db/schema.ts`): `ebook | document | spreadsheet | slide | poster | other`. Pushed to Supabase via `drizzle-kit push`.
- [x] Fixed a drizzle-kit push footgun found along the way: it wanted to *drop* the `session` table (created at runtime by `connect-pg-simple`, never declared in `schema.ts`) as an "extra" table. Declared `session` in `schema.ts` (matching connect-pg-simple's own `table.sql`) so it's protected going forward — verified the table's 4 rows survived the push.
- [x] `server/src/domain/classifyDocumentType.ts` — pure function, 10 unit tests. "poster" is deliberately never auto-assigned (no reliable file-level signal for it, same "don't guess" rule as metadata extraction) — always a manual admin choice.
- [x] `server/src/services/pdfMetadata.ts` extended to read page-1 width/height via `pdf-parse`'s `getInfo({ parsePageInfo: true })` and derive `pageOrientation`.
- [x] Wired into `admin.inspectFile` (returns a `documentType` suggestion pre-upload) and `admin.upload` (auto-classifies at save time, admin choice always wins if provided) and `admin.updateFile` (always editable afterward).
- [x] `library.ts`'s `dashboard.typeCounts` and `files` type-filter switched from deriving type from `mimeType` on the fly to reading the stored `documentType` column — required, since slide/ebook can no longer be told apart by MIME type alone.
- [x] Client: new `IconSlide`/`IconPoster`, `fileTypeIcon()` switched from mimeType-based to documentType-based, `Home.tsx` stat cards + donut chart labels + `Catalog.tsx` filter chips all extended to 5 types.
- [x] Admin upload form gained a "ประเภทเอกสาร" (document type) select, pre-filled with the auto-detected suggestion but editable — same suggested/overridden pattern as title/author. Also added to the per-file inline edit row and the file-list "ชนิด" column.
- [x] One-time backfill script (`server/scripts/backfillDocumentType.ts`) reclassified the 2 pre-existing library files that were stuck at the "other" default from before this column existed.
- [x] Verified live in-browser: real landscape-PDF upload untested (none available this session), but the manual-edit path was verified end-to-end — changed a file's type via the admin edit row, confirmed it persisted (table + dashboard stat cards + donut chart all updated), and confirmed the `/library` type filter chips correctly filter by the new column.
- [x] Both workspaces typecheck clean (`tsc --noEmit`), full Vitest suite passes (53/53).

## Phase 16 — Standalone PDF compression tool for oversized scans
- [x] DONE. User hit `RAW_SIZE_LIMIT` uploading a 191MB, 372-page scanned PDF ("เลข 7 ตัว 9 ฐาน") and asked for a way to compress without losing quality.
- [x] `server/scripts/compressPdf.ts` — standalone CLI (`npx tsx scripts/compressPdf.ts <input.pdf> <output.pdf> [--quality=85]`), not wired into the web app (must run *before* the browser-side size check even sees the file, so a web UI button can't help here).
- [x] Approach: per page, extract the embedded image via `pdf-parse`'s `getImage()`. If one image's aspect ratio closely matches the page's (a full-page scan placed edge-to-edge), re-encode it as JPEG via `sharp` at the SAME pixel resolution (no downsampling) — only the encoding changes, not the resolution. Any page without a clear full-page scan image (real text/vector content) is copied through byte-for-byte unchanged via `pdf-lib`'s `copyPages`, so real selectable text is never destroyed.
- [x] New deps: `pdf-lib`, `sharp` (added to `server/package.json`).
- [x] Verified with synthetic test PDFs (not the user's real file — don't have its path): an 8-page worst-case random-noise "scan" (116.7MB) compressed to 4.24MB (96% smaller) with page count, page dimensions, and image pixel resolution all confirmed unchanged. A second mixed-content test (1 scan page + 1 real-text page) confirmed the text page's selectable text survives byte-for-byte, and only the scan page got recompressed.
- [x] Real scanned book pages (mostly white background, high redundancy) should compress far better than the random-noise stress test, so a 191MB file is very likely to land well under both the 100MB app limit and Supabase's 50MB storage cap after this.
- [x] Both workspaces typecheck clean, full Vitest suite still passes (53/53) after adding the new deps.

## Phase 17 — Migrate file storage from Supabase Storage to Cloudflare R2
- [x] DONE. User hit the Supabase Storage 50MB cap (D9) again on the same 191MB file, decided against compressing it (Phase 16), and chose to migrate storage instead.
- [x] `server/src/storage/r2.ts` — new `StorageAdapter` implementation using `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` against R2's S3-compatible endpoint. `server/src/storage/index.ts` — new driver-selector reading `STORAGE_DRIVER` from env (`r2` | `supabase`), dynamically importing only the active provider so an unconfigured one's env checks never fire.
- [x] All 3 call sites (`index.ts`, `routers/admin.ts`, `routers/library.ts`) switched from importing `supabaseStorageAdapter` directly to the new `storageAdapter` indirection — zero business-logic changes, confirming the adapter pattern (D2) did its job.
- [x] Guided the user step-by-step through the parts only they could do (account creation, R2 subscription activation, bucket creation, API token generation — screenshots at every step). Filled in non-financial form fields (name/address) on request; explicitly refused to touch card-number fields or click payment-authorization checkboxes.
- [x] `server/scripts/migrateToR2.ts` — one-time copy of both existing library files from Supabase Storage to R2 (by storageKey), run *before* flipping the driver so nothing was orphaned. Verified: downloaded the migrated file straight from its live R2 signed URL afterward and confirmed it's a valid, byte-correct .xlsx.
- [x] `STORAGE_DRIVER` flipped to `r2` in `.env`; server restarted; confirmed a real `library.previewUrl` call now returns an `r2.cloudflarestorage.com` URL, not Supabase.
- [x] Raised `UPLOAD_RAW_MAX_BYTES`/`UPLOAD_TRANSPORT_MAX_BYTES` from 100MB/150MB to 300MB/450MB — R2 has no low per-object cap like Supabase's 50MB, so the guard that was protecting against that no longer needs to be so conservative.
- [x] `.env.example` updated to document all new vars and reflect `r2` as the new example default driver.
- [x] Both workspaces typecheck clean, full Vitest suite passes (53/53).
- [x] VERIFIED: user uploaded their real 191.27MB file through the real UI — succeeded (previously blocked). Confirmed via direct DB query and live browser testing in Phase 18/19.

## Phase 6 — Release prep (stop before actual cutover)
- [ ] NOT STARTED. Site currently only runs via `npm run dev:server` + `npm run dev:client` on this machine (localhost) — it is not reachable from the internet yet.
- [ ] Deployment target (hosting for the client + server) has not been chosen or discussed with the owner
- [ ] Export manifest + storage checksum report — not written
- [ ] Deployment notes + rollback plan — not written
- [ ] Owner approval checkpoint for any future DNS/production step — nothing to approve yet since nothing is deployed

## Phase 18 — PDF reader: touch swipe, Retina sharpness, fast-loading rendition
- [x] DONE. Three related complaints in one session: (1) reader canvas looked "compressed"/blurry on the user's Mac, (2) wanted touch-swipe page turning, (3) big scanned ebooks felt slow to open.
- [x] **Retina/HiDPI blur fix** (`client/src/components/PdfReader.tsx`): canvas was rendered at CSS-pixel resolution with no `devicePixelRatio` awareness, so the browser upscaled it ~2-3x on Retina screens — the actual cause of the "compressed text" complaint, not any server-side compression (none was applied to that file at the time). Now renders at `displayScale * devicePixelRatio` internally while keeping the same on-screen CSS size via explicit `canvas.style.width/height`.
- [x] **Touch swipe**: `onTouchStart`/`onTouchEnd` on the canvas wrapper, 60px vertical threshold — swipe up = next page, swipe down = previous page. Verified via synthetic `TouchEvent`s in a live browser session (both directions advance/retreat the page counter correctly). Added a thin side progress bar (page position, desktop+tablet only) as a visual affordance.
- [x] **Fast-loading inline rendition, separate from the download**: new nullable `previewStorageKey` column on `library_files`. `server/src/services/compressPdfBuffer.ts` extracted from the Phase 16 CLI script's logic (now shared by both) — same recompress-only-full-page-scans approach, plus an optional `maxDimension` downscale (used here: 1800px longest edge, quality 80) since the goal is fast on-screen reading, not archival fidelity.
- [x] `admin.upload` generates this rendition automatically for PDFs over 5MB (skipped for smaller files — not worth the extra work); `library.previewUrl` prefers it when present, falling back to the original. **Downloads always serve `storageKey` (the untouched original)** — `library.downloadUrl`/`index.ts`'s `/download/:fileId` route were not touched.
- [x] `server/scripts/backfillPreviewRendition.ts` generated the rendition for the one existing large file retroactively: **191.27MB → 54.37MB (72% smaller)**, all 372 pages correctly identified as full-page scans and recompressed. Verified live: the same page the user screenshotted as "compressed" now renders crisp, and the page loads in a few seconds instead of ~20-30s.
- [x] `deleteFile` now also cleans up the preview object from storage (`storageAdapter.delete(file.previewStorageKey)`) so deleting a file doesn't orphan its rendition.
- [x] Both workspaces typecheck clean, full Vitest suite passes (53/53).
- [x] **Follow-up same session**: user clarified the single-page-at-a-time view wasn't what they wanted — asked for continuous scroll through every page (first to last), a scroll control on the right, and the prev/next buttons moved to the bottom (thumb reach), plus faster page-to-page transitions.
- [x] Rewrote `PdfReader.tsx` from a single-canvas-per-pageNum design to a virtualized continuous scroll: all N pages are lightweight placeholder divs inside one `overflow-y-auto` container (browser's native scrollbar = "the control on the right", touch-drag scrolls naturally through everything); each page is its own `PageSlot` with its own `IntersectionObserver` (1000px preload margin) that lazily renders its canvas as it nears the viewport and tears it back down once scrolled well away, bounding memory for a 372-page book. The 1000px preload margin also fixes the "next page is slow" complaint as a side effect — by the time you scroll or tap next, that page has usually already rendered in the background.
- [x] Removed the earlier touch-swipe (±page) handlers from this same session — redundant/conflicting once native scroll IS the page-turning gesture.
- [x] Prev/next buttons + page counter moved from above the reader to below it (thumb-reachable on mobile), and now `scrollIntoView({ behavior: "smooth" })` the target page rather than swapping a single canvas.
- [x] Verified live against the real 372-page/54MB rendition: scrolling renders pages 2, 3, 4... continuously (not stuck on page 1), the current-page indicator tracks scroll position correctly (confirmed at page 6, then 7 after clicking "next"), and real book content (text pages, signature page, etc.) all render sharp.
- [x] Both workspaces typecheck clean, full Vitest suite passes (53/53).

## Phase 19 — Jump-to-page (table of contents), bookmarks, continue-reading, visual redesign
- [x] DONE. Same session: user asked for a page-number input matching the book's own table-of-contents numbering (not necessarily the same as the raw PDF page index), a bookmarking system, and — separately — for the reader's look to match the site's premium Midnight Navy/Gold branding rather than plain gray chrome.
- [x] New `pageOffset` column on `library_files` ("PDF page = table-of-contents page + pageOffset"), default 0. Deliberately never auto-detected — no reliable text layer to read it from on a scanned book, so it's a manual admin field ("เลขหน้าอ้างอิง (สารบัญ)") added to the file edit row, editable any time (matches the project's standing "don't guess" rule already applied to metadata extraction and document-type classification).
- [x] `PdfReader.tsx` gained a page-jump form: types a TOC/printed page number, adds `pageOffset`, and scrolls straight to the resulting PDF page. Verified live (typed "20", landed exactly on PDF page 20/372 — this file's offset is currently 0 until the user tells us the real front-matter count).
- [x] New `client/src/lib/readingProgress.ts` — localStorage-only (this app has no public account system, so "this device only" is the honest scope, same reasoning as the earlier backlog note about client-side reading-progress). Two pieces: auto-saved last-read page (shows a dismissible "อ่านค้างไว้ที่หน้า X — ไปต่อ" banner on return, the same pattern Kindle/Google Play Books use) and a manual per-page bookmark toggle with a dropdown list of everything bookmarked. Both keyed per fileId, wired through `FilePreviewPane` → `FileDetail.tsx`/`ShareView.tsx`.
- [x] Verified live end-to-end in a fresh browser session: bookmarked page 20 → button flipped to "คั่นหน้านี้แล้ว" → bookmarks list showed "หน้า 20" → confirmed the localStorage keys directly. Continue-reading banner also verified appearing on a return visit after auto-save.
- [x] **Visual redesign** to match the site's actual design tokens (`tailwind.config.js`: navy-950/900, gold-400/500/600, the existing `.card`/`shadow-card` system) instead of generic gray borders: whole reader now a proper rounded-2xl bordered card; loading state is a dark navy panel with a pulsing gold three-dot indicator instead of plain gray text; the primary prev/next/page-counter bar is a navy-950 strip with new `IconChevronLeft`/`IconChevronRight` icons and the current page number in gold serif; the utility row (jump input, bookmark controls) sits below on white with gold focus rings matching `.input-field`; individual pages get a soft drop shadow so they read as physical pages resting in the case; the resume banner and bookmark dropdown got the same gold-accent treatment.
- [x] Both workspaces typecheck clean, full Vitest suite passes (53/53). Verified the redesigned reader live in a fresh browser session (screenshot-confirmed) — same functional behavior, new premium chrome.

## Phase 20 — Reading progress/bookmarks sync across devices via the existing admin account
- [x] DONE. User asked to log in and have reading progress/bookmarks update across phone, computer, and iPad. First built a full public sign-up system (own accounts, `role="user"`) per the initial ask — user then clarified this is single-owner use only ("ไม่ได้ทำให้ใครมาใช้ระบบของฉัน... ทำใช้เอง"), no public registration wanted. Reverted the public sign-up/login pages, the `register` mutation, and the `users.password_hash` column entirely; kept only what's needed to sync the owner's own existing admin account.
- [x] New `reading_progress` and `bookmarks` tables, keyed by `userId` + `fileId` (unique per user+file, and per user+file+page for bookmarks). New `progress` router (`get`/`saveLastPage`/`toggleBookmark`) behind a new `authedProcedure` (any logged-in account, not admin-only — kept generic in case a real public system is wanted later, even though only the admin account exists today).
- [x] `PdfReader.tsx` now branches on login state (`trpc.auth.me`): logged in → reads/writes through the `progress` router, synced to the account; logged out → same local-storage fallback as before, unchanged. No UI difference between the two paths — the resume banner and bookmark controls work identically either way.
- [x] Along the way: discovered the admin password was lost/unknown (user couldn't log in to test). Generated a new one (`AstroLib2026!`), updated `ADMIN_PASSWORD_HASH` in `.env`, restarted the server — gave the user the new credential directly in chat (their own account, not a third party's).
- [x] Verified live end-to-end, including a real cross-device proof: logged in as admin, jumped to page 15, bookmarked it (page 11 auto-saved as reading progress mid-scroll) — confirmed both landed in Postgres (`bookmarks`/`reading_progress` tables), not just the browser. Then **cleared localStorage entirely** (simulating a different device with no local data) and reloaded: the "อ่านค้างไว้ที่หน้า 11" resume banner and the "รายการที่คั่น (1)" bookmark count both still appeared correctly, proving the data came from the account via Postgres, not the browser.
- [x] Both workspaces typecheck clean, full Vitest suite passes (53/53).

## Phase 21 — Direct-to-R2 upload rewrite (speed + real progress bar) + server crash-safety hardening
- [x] DONE. User asked for two things at once: (1) faster uploads with a real progress bar showing percentage/speed/time-remaining — explicitly the top priority, and (2) the backend hardened so any document type/age uploads without bugs.
- [x] **Root cause of the old upload's slowness**: every file went browser → our own server → storage, gzip-compressed and base64-encoded first (base64 alone adds ~33% transport size; gzip did nothing for already-compressed PDFs/Office files, just burned CPU), then re-uploaded from our server to storage — meaning slow home-network upload bandwidth was spent twice (once to us, once from us to storage) with no progress feedback at all (`fetch` cannot report upload progress).
- [x] **Rewritten to direct-to-storage upload**: new `admin.createUploadUrl` returns a short-lived presigned PUT URL straight to R2; the browser uploads raw bytes directly to R2 via `XMLHttpRequest` (not `fetch` — only `xhr.upload.onprogress` can report real upload progress), completely bypassing our server for the slow part. `admin.finalizeUpload` (replacing the old `admin.upload`) then just reads the already-uploaded bytes from storage for checksum/inspection and writes the DB row — no re-upload.
- [x] `client/src/lib/upload.ts` rewritten (`uploadFileDirect`): computes SHA-256 client-side, gets the presigned URL, PUTs via XHR with live `{loadedBytes, totalBytes, speedBytesPerSec, etaSeconds}` progress callbacks (cumulative-average speed for a smooth, non-jittery reading).
- [x] `AdminLibrary.tsx` upload UI redesigned: animated gold progress bar with live percentage, loaded/total size, speed (MB/s), and ETA while uploading — replaces the old plain "uploading..." text.
- [x] Storage key generation moved to a flat `${uuid}.${ext}` scheme (`admin.ts`'s `storageKeyFor`) since the upload now starts the instant a file is picked, before the category is chosen — the old category-prefixed key scheme required knowing the category first. Removed the now-unused `server/src/domain/safeStorageKey.ts` `safeStorageKey()` function (kept `buildContentDisposition`, still used by the download route).
- [x] **CORS blocker**: R2 bucket only allowed `GET, HEAD` (set up for read-only preview/download in Phase 17); the browser's direct PUT was blocked by CORS. My R2 API token is deliberately least-privilege (Object Read & Write only, no Admin scope), so it can't call `PutBucketCorsCommand` itself (`AccessDenied`) — walked the user through the Cloudflare dashboard UI (Settings → CORS Policy → Edit) to add `PUT` to `AllowedMethods` themselves.
- [x] **Found and fixed a likely root cause of this session's many "mysterious server crashes"**: `/download/:fileId` in `server/src/index.ts` had zero try/catch around its async storage/fetch calls. On Node 15+ (this machine runs v24), an unhandled promise rejection kills the *entire* process by default, not just that one request — explaining the repeated need for manual `nohup npm run dev:server &` restarts throughout the session. Fixed with a full try/catch wrap, plus defense-in-depth: a final Express error-handling middleware and process-level `unhandledRejection`/`uncaughtException` handlers that log instead of crashing.
- [x] Also fixed the unrelated "Unexpected token '<', is not valid JSON" error some uploads hit: Express's own `express.json()` body-size limit was lower than the app's upload limit, so oversized requests got Express's default HTML error page instead of a JSON error, breaking `JSON.parse` on the client. Now moot for file bytes (they never pass through Express anymore) — limit dropped back to a small `5mb` for ordinary metadata payloads, with a JSON-returning handler for the `entity.too.large` case that can still occur.
- [x] Simplified `uploadGuards.ts`/`UploadLimits` to just `maxRawBytes` (dropped `maxTransportBytes`/transport-size and decoded-size checks — no longer meaningful once file bytes stop passing through our server). Vitest suite went from 53 to 51 tests after removing the 2 tests for the now-deleted checks.
- [x] **Verified live end-to-end** (via direct API calls simulating the real browser flow, since the in-app browser tool can't drive a native OS file picker): logged in as admin → `createUploadUrl` → confirmed a real CORS preflight (`OPTIONS` with `Origin: http://localhost:5173`) now returns `Access-Control-Allow-Methods: GET, HEAD, PUT` → raw `PUT` of file bytes to the presigned R2 URL succeeded (200 OK) → `inspectFile` correctly read the embedded PDF title/author back from the just-uploaded object → `finalizeUpload` created the DB row → `/download/:fileId` served back bytes that diffed byte-for-byte identical to the original upload → cleaned up the test row.
- [x] Both workspaces typecheck clean; full Vitest suite passes (51/51).
