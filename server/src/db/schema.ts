import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
  varchar,
  json,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const fileStatusEnum = pgEnum("file_status", ["draft", "published", "archived"]);
export const fileVisibilityEnum = pgEnum("file_visibility", ["public", "private"]);
// "ebook" vs "slide" can't be told apart by MIME type alone — both are
// application/pdf. Distinguished by page-1 orientation at upload time (see
// domain/classifyDocumentType.ts), but always admin-editable afterward since
// orientation detection is a heuristic, not a guarantee.
export const documentTypeEnum = pgEnum("document_type", [
  "ebook",
  "document",
  "spreadsheet",
  "slide",
  "poster",
  "other",
]);
export const drawingToolEnum = pgEnum("drawing_tool", ["pen", "highlighter"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
}));

export const libraryCategories = pgTable("library_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  nameUnique: uniqueIndex("library_categories_name_unique").on(table.name),
  slugUnique: uniqueIndex("library_categories_slug_unique").on(table.slug),
}));

export const libraryFiles = pgTable("library_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").references(() => libraryCategories.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  author: text("author"),
  year: integer("year"),
  description: text("description"),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  // bytes, not a row-content column — see ARCHITECTURE.md: no file bytes in the DB
  size: bigint("size", { mode: "number" }).notNull(),
  checksum: text("checksum").notNull(),
  storageKey: text("storage_key").notNull(),
  // A recompressed, faster-to-load rendition used only for the inline reader
  // (see server/src/services/compressPdfBuffer.ts) — never used for downloads,
  // which always serve storageKey (the untouched original). Null when no
  // rendition was generated (non-PDF files, or compression failed/was skipped).
  previewStorageKey: text("preview_storage_key"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  // Extracted at upload time for PDFs (see server/src/services/pdfMetadata.ts).
  // Nullable: not every file type supports text extraction. Used by the
  // Phase 8c per-book AI Q&A feature (not yet built) as its retrieval source.
  extractedText: text("extracted_text"),
  pageCount: integer("page_count"),
  // "PDF page = printed/table-of-contents page + pageOffset". Front matter
  // (cover, dedication, foreword) is usually unnumbered or roman-numeraled,
  // so a book's real page 1 is rarely the PDF's page 1. Default 0 (no
  // offset) rather than guessed/detected — there's no reliable text layer to
  // read it from on a scanned book, so an admin sets it manually if needed.
  pageOffset: integer("page_offset").notNull().default(0),
  documentType: documentTypeEnum("document_type").notNull().default("other"),
  status: fileStatusEnum("status").notNull().default("draft"),
  visibility: fileVisibilityEnum("visibility").notNull().default("private"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  statusVisibilityIdx: index("library_files_status_visibility_idx").on(table.status, table.visibility),
  categoryIdx: index("library_files_category_idx").on(table.categoryId),
  titleIdx: index("library_files_title_idx").on(table.title),
  checksumIdx: index("library_files_checksum_idx").on(table.checksum),
}));

// Reading position and bookmarks tied to the logged-in account (see progress
// router) — the owner logging into the same admin account from their phone,
// iPad, and computer sees the same reading state on all of them. No public
// registration exists (single-owner site, D3); anonymous visitors still get
// a device-local (localStorage) version of the same features on the client.
export const readingProgress = pgTable("reading_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => libraryFiles.id, { onDelete: "cascade" }),
  lastPage: integer("last_page").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userFileUnique: uniqueIndex("reading_progress_user_file_unique").on(table.userId, table.fileId),
}));

export const bookmarks = pgTable("bookmarks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => libraryFiles.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userFilePageUnique: uniqueIndex("bookmarks_user_file_page_unique").on(table.userId, table.fileId, table.pageNumber),
}));

// A reader's own highlighted passages in an ebook — personal annotations,
// same account-scoped/anonymous-local split as bookmarks (see progress
// router). rects are fractions (0-1) of the page's rendered box, not pixels,
// so they stay correct across zoom levels and screen sizes.
export const highlights = pgTable("highlights", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => libraryFiles.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  text: text("text").notNull(),
  rects: jsonb("rects").$type<{ x: number; y: number; w: number; h: number }[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userFileIdx: index("highlights_user_file_idx").on(table.userId, table.fileId),
}));

// Freehand strokes (pen or stylus) drawn directly on a page — same
// account-scoped/anonymous-local split as bookmarks/highlights. points and
// strokeWidth are both fractions (0-1) of the page's rendered box, not
// pixels, so a stroke stays the right size and position across zoom levels
// and screen sizes exactly like highlight rects do.
export const drawings = pgTable("drawings", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => libraryFiles.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  tool: drawingToolEnum("tool").notNull(),
  color: text("color").notNull(),
  strokeWidth: doublePrecision("stroke_width").notNull(),
  points: jsonb("points").$type<{ x: number; y: number }[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userFileIdx: index("drawings_user_file_idx").on(table.userId, table.fileId),
}));

export const shareLinks = pgTable("share_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileId: uuid("file_id").notNull().references(() => libraryFiles.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenUnique: uniqueIndex("share_links_token_unique").on(table.token),
  fileIdx: index("share_links_file_idx").on(table.fileId),
}));

export const aiWorkItems = pgTable("ai_work_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: text("task_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  owner: text("owner"),
  reviewer: text("reviewer"),
  branch: text("branch"),
  files: jsonb("files").$type<string[]>().notNull().default([]),
  tests: jsonb("tests").$type<string[]>().notNull().default([]),
  acceptance: jsonb("acceptance").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Managed by connect-pg-simple at runtime (createTableIfMissing), not by our
// migrations — declared here only so `drizzle-kit push` sees it and doesn't
// propose dropping it as an "extra" table (see server/src/index.ts).
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey().notNull(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

export const aiWorkItemEvents = pgTable("ai_work_item_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  workItemId: uuid("work_item_id").notNull().references(() => aiWorkItems.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workItemIdx: index("ai_work_item_events_work_item_idx").on(table.workItemId),
}));
