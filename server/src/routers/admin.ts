import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { count, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { libraryCategories, libraryFiles, shareLinks } from "../db/schema";
import { router, adminProcedure } from "./trpc";
import { findDuplicate } from "../domain/duplicatePredicate";
import { checkChecksum, checkRawSize } from "../domain/uploadGuards";
import { defaultStatusForNewUpload, visibilityForStatus, type FileStatus } from "../domain/publicationPolicy";
import { storageAdapter } from "../storage/index";
import { inspectPdf } from "../services/pdfMetadata";
import { compressPdfBuffer } from "../services/compressPdfBuffer";
import { fromEmbeddedInfo, fromFirstPageText, mergeSuggestions } from "../domain/metadataExtraction";
import { classifyDocumentType } from "../domain/classifyDocumentType";

const LIMITS = {
  maxRawBytes: Number(process.env.UPLOAD_RAW_MAX_BYTES ?? 104_857_600),
};

/**
 * Object key is a flat UUID (+ extension), not category-prefixed — a file's
 * storage location must be knowable before its category is (the direct
 * upload starts the instant a file is picked, category is chosen after).
 */
function storageKeyFor(originalName: string): string {
  const lastDot = originalName.lastIndexOf(".");
  const extension = lastDot > 0 ? originalName.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const id = randomUUID();
  return extension ? `${id}.${extension}` : id;
}

const statusEnum = z.enum(["draft", "published", "archived"]);
const documentTypeEnumValues = z.enum(["ebook", "document", "spreadsheet", "slide", "poster", "other"]);

export const adminRouter = router({
  dashboard: adminProcedure.query(async () => {
    const files = await db.select().from(libraryFiles);
    return { totalRows: files.length };
  }),

  createCategory: adminProcedure
    .input(z.object({ name: z.string().min(1), slug: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const existing = await db
        .select()
        .from(libraryCategories)
        .where(eq(libraryCategories.slug, input.slug));
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "CATEGORY_SLUG_EXISTS" });
      }
      const [created] = await db.insert(libraryCategories).values(input).returning();
      return created;
    }),

  /**
   * Category deletion must either reassign dependents or be blocked — see
   * DATA-AND-API-CONTRACT.md "Consistency rules". We block rather than
   * reassign: silently moving files to some other category would be a
   * surprising side effect an admin didn't ask for.
   */
  deleteCategory: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    const [{ n: fileCount }] = await db
      .select({ n: count() })
      .from(libraryFiles)
      .where(eq(libraryFiles.categoryId, input.id));
    if (fileCount > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "CATEGORY_HAS_FILES" });
    }
    const [deleted] = await db.delete(libraryCategories).where(eq(libraryCategories.id, input.id)).returning();
    if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "CATEGORY_NOT_FOUND" });
    return { ok: true };
  }),

  adminFiles: adminProcedure.query(async () => {
    return db.select().from(libraryFiles);
  }),

  /**
   * Step 1 of upload: the browser gets a URL it can PUT bytes to DIRECTLY —
   * bypassing our own server for the (slow) transfer entirely. Old flow was
   * browser -> our server -> R2 with a gzip+base64 wrapper (~33% transport
   * overhead just from base64, plus CPU time gzip-compressing files that are
   * usually already-compressed PDFs/Office docs, buying nothing). New flow
   * is browser -> R2 directly, raw bytes, with real upload progress via
   * XMLHttpRequest (fetch can't report upload progress).
   */
  createUploadUrl: adminProcedure
    .input(z.object({ originalName: z.string().min(1), mimeType: z.string().min(1), rawSize: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const rawSizeCheck = checkRawSize(input.rawSize, LIMITS);
      if (!rawSizeCheck.ok) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: rawSizeCheck.code });

      const storageKey = storageKeyFor(input.originalName);
      const uploadUrl = await storageAdapter.createUploadUrl(storageKey, input.mimeType);
      return { uploadUrl, storageKey };
    }),

  /**
   * Step 2 (optional, after the direct upload finishes): suggests title/
   * author/document type by reading the just-uploaded bytes back from
   * storage — a fast server-to-storage read, not through the admin's own
   * upload bandwidth. Never persists anything — pure inspection.
   */
  inspectFile: adminProcedure
    .input(z.object({ storageKey: z.string().min(1), mimeType: z.string().min(1), originalName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const fallbackDocumentType = classifyDocumentType(input.mimeType, input.originalName);
      if (input.mimeType !== "application/pdf") {
        return { title: null, author: null, pageCount: null, documentType: fallbackDocumentType };
      }
      try {
        const bytes = await storageAdapter.get(input.storageKey);
        const inspection = await inspectPdf(bytes);
        const suggestion = mergeSuggestions(
          fromEmbeddedInfo(inspection.embeddedTitle, inspection.embeddedAuthor),
          fromFirstPageText(inspection.firstPageText),
        );
        const documentType = classifyDocumentType(input.mimeType, input.originalName, inspection.pageOrientation);
        return { title: suggestion.title, author: suggestion.author, pageCount: inspection.pageCount, documentType };
      } catch {
        // A malformed/encrypted/scanned-without-text-layer PDF must not block upload — just skip suggestions.
        return { title: null, author: null, pageCount: null, documentType: fallbackDocumentType };
      }
    }),

  /**
   * Step 3: bytes are already sitting at storageKey (from createUploadUrl) —
   * this only handles metadata, validation, and the DB row. Re-downloads the
   * object once server-side to verify the checksum (integrity) and to run
   * PDF inspection/compression, same as the old flow did with bytes it
   * already had in memory — the cost moved from "through the admin's
   * connection" to "between our server and storage", which is normally much
   * faster and doesn't block on the admin's own upload speed.
   */
  finalizeUpload: adminProcedure
    .input(
      z.object({
        storageKey: z.string().min(1),
        originalName: z.string().min(1),
        mimeType: z.string().min(1),
        rawSize: z.number().int().positive(),
        checksumSha256: z.string().min(1),
        categoryId: z.string().uuid(),
        title: z.string().min(1),
        author: z.string().optional(),
        year: z.number().int().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).default([]),
        status: statusEnum.optional(),
        documentType: documentTypeEnumValues.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const category = await db.select().from(libraryCategories).where(eq(libraryCategories.id, input.categoryId));
      if (category.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "CATEGORY_NOT_FOUND" });
      }

      const existingFiles = await db
        .select({ id: libraryFiles.id, title: libraryFiles.title, originalName: libraryFiles.originalName, categoryId: libraryFiles.categoryId })
        .from(libraryFiles)
        .where(eq(libraryFiles.categoryId, input.categoryId));
      const duplicate = findDuplicate(input.title, input.originalName, input.categoryId, existingFiles);
      if (duplicate) {
        await storageAdapter.delete(input.storageKey).catch(() => {});
        throw new TRPCError({ code: "CONFLICT", message: "DUPLICATE_FILE", cause: duplicate });
      }

      let bytes: Buffer;
      try {
        bytes = await storageAdapter.get(input.storageKey);
      } catch (err) {
        const detail = err instanceof Error ? err.message : "";
        throw new TRPCError({ code: "BAD_REQUEST", message: `UPLOAD_NOT_FOUND: ${detail}` });
      }

      const actualChecksum = createHash("sha256").update(bytes).digest("hex");
      const checksumCheck = checkChecksum(input.checksumSha256, actualChecksum);
      if (!checksumCheck.ok) {
        await storageAdapter.delete(input.storageKey).catch(() => {});
        throw new TRPCError({ code: "BAD_REQUEST", message: checksumCheck.code });
      }

      const status: FileStatus = input.status ?? defaultStatusForNewUpload({ hasTitle: true, hasCategoryId: true });
      const visibility = visibilityForStatus(status);

      // Best-effort: extracted text/page count power the page-count display and the
      // future per-book Q&A (Phase 8c). A malformed PDF must not fail the upload.
      let extractedText: string | null = null;
      let pageCount: number | null = null;
      let detectedDocumentType = classifyDocumentType(input.mimeType, input.originalName);
      if (input.mimeType === "application/pdf") {
        try {
          const inspection = await inspectPdf(bytes);
          extractedText = inspection.fullText;
          pageCount = inspection.pageCount;
          detectedDocumentType = classifyDocumentType(input.mimeType, input.originalName, inspection.pageOrientation);
        } catch {
          // leave extractedText/pageCount null; detectedDocumentType keeps its orientation-less fallback
        }
      }
      // "poster" is never auto-detected (see domain/classifyDocumentType.ts) — an
      // explicit admin choice always wins over the heuristic.
      const documentType = input.documentType ?? detectedDocumentType;

      // A second, recompressed rendition used ONLY by the inline reader, so
      // opening a heavy scanned PDF doesn't mean streaming the full original
      // through the browser first. Downloads always serve the untouched
      // original (storageKey) — this is purely a read-speed optimization.
      // Best-effort: skipped for small files (not worth it) and never fails
      // the upload itself if compression errors out.
      let previewStorageKey: string | null = null;
      const PREVIEW_WORTHY_MIN_BYTES = 5 * 1024 * 1024;
      if (input.mimeType === "application/pdf" && bytes.byteLength > PREVIEW_WORTHY_MIN_BYTES) {
        try {
          const { bytes: previewBytes } = await compressPdfBuffer(bytes, { quality: 80, maxDimension: 1800 });
          if (previewBytes.byteLength < bytes.byteLength) {
            const key = `${input.storageKey}.preview.pdf`;
            await storageAdapter.put(key, previewBytes, "application/pdf");
            previewStorageKey = key;
          }
        } catch {
          // leave previewStorageKey null — the reader falls back to the original
        }
      }

      const [created] = await db
        .insert(libraryFiles)
        .values({
          categoryId: input.categoryId,
          title: input.title,
          author: input.author,
          year: input.year,
          description: input.description,
          originalName: input.originalName,
          mimeType: input.mimeType,
          size: bytes.byteLength,
          checksum: actualChecksum,
          storageKey: input.storageKey,
          previewStorageKey,
          tags: input.tags,
          extractedText,
          pageCount,
          documentType,
          status,
          visibility,
          createdBy: ctx.user.id,
          publishedAt: status === "published" ? new Date() : null,
        })
        .returning();

      return created;
    }),

  updateFile: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        author: z.string().optional(),
        year: z.number().int().optional(),
        description: z.string().optional(),
        categoryId: z.string().uuid().optional(),
        tags: z.array(z.string()).optional(),
        status: statusEnum.optional(),
        documentType: documentTypeEnumValues.optional(),
        pageOffset: z.number().int().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, status, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (status) {
        patch.status = status;
        patch.visibility = visibilityForStatus(status);
        if (status === "published") patch.publishedAt = new Date();
      }
      const [updated] = await db.update(libraryFiles).set(patch).where(eq(libraryFiles.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "FILE_NOT_FOUND" });
      return updated;
    }),

  deleteFile: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    const [file] = await db.select().from(libraryFiles).where(eq(libraryFiles.id, input.id));
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "FILE_NOT_FOUND" });

    await storageAdapter.delete(file.storageKey).catch(() => {});
    if (file.previewStorageKey) await storageAdapter.delete(file.previewStorageKey).catch(() => {});
    await db.delete(libraryFiles).where(eq(libraryFiles.id, input.id));
    return { ok: true };
  }),

  fileDownloadUrl: adminProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input, ctx }) => {
    const [file] = await db.select().from(libraryFiles).where(eq(libraryFiles.id, input.id));
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "FILE_NOT_FOUND" });
    return { url: `${ctx.req.protocol}://${ctx.req.get("host")}/download/${file.id}` };
  }),

  // Share links: grant view access to one file without publishing it, to
  // whoever holds the token — separate from status/visibility. See
  // domain/shareLink.ts for the expiry/revoke rule.
  createShareLink: adminProcedure
    .input(z.object({ fileId: z.string().uuid(), expiresInDays: z.number().int().positive().optional() }))
    .mutation(async ({ input, ctx }) => {
      const [file] = await db.select({ id: libraryFiles.id }).from(libraryFiles).where(eq(libraryFiles.id, input.fileId));
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "FILE_NOT_FOUND" });

      const token = randomBytes(24).toString("base64url");
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const [created] = await db
        .insert(shareLinks)
        .values({ fileId: input.fileId, token, expiresAt, createdBy: ctx.user.id })
        .returning();

      const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
      return { id: created.id, token: created.token, expiresAt: created.expiresAt, url: `${clientOrigin}/share/${created.token}` };
    }),

  listShareLinksForFile: adminProcedure.input(z.object({ fileId: z.string().uuid() })).query(async ({ input }) => {
    return db.select().from(shareLinks).where(eq(shareLinks.fileId, input.fileId)).orderBy(desc(shareLinks.createdAt));
  }),

  revokeShareLink: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    const [updated] = await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, input.id)).returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "SHARE_LINK_NOT_FOUND" });
    return { ok: true };
  }),
});
