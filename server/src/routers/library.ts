import { z } from "zod";
import type { Request } from "express";
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { libraryCategories, libraryFiles, shareLinks } from "../db/schema";
import { TRPCError } from "@trpc/server";
import { previewCapability } from "../domain/previewCapability";
import { isShareLinkValid } from "../domain/shareLink";
import { selectRelevantPassages } from "../domain/passageRetrieval";
import { router, publicProcedure } from "./trpc";
import { storageAdapter } from "../storage/index";
import { renderOfficePreviewCached, STORAGE_READ_FAILED } from "../services/officePreview";

import { aiAdapter } from "../ai/index";

const PUBLIC_FILTER = and(eq(libraryFiles.status, "published"), eq(libraryFiles.visibility, "public"));

/**
 * Never `select()` a whole library_files row into a response.
 *
 * extractedText holds the entire text of a PDF — hundreds of KB per book —
 * and it dominated every list payload: a 20-file page weighed 825KB over the
 * wire, of which 98% was text no list view renders. That is what made opening
 * a category or the catalogue feel slow. storageKey, checksum and createdBy
 * have no business reaching a public client either.
 *
 * These two column sets are the allow-list. Add a column here only when a
 * view actually renders it.
 */
const LIST_FILE_COLUMNS = {
  id: libraryFiles.id,
  title: libraryFiles.title,
  author: libraryFiles.author,
  year: libraryFiles.year,
  // Not rendered, but previewCapability() needs it to classify the file.
  originalName: libraryFiles.originalName,
  mimeType: libraryFiles.mimeType,
  documentType: libraryFiles.documentType,
  categoryId: libraryFiles.categoryId,
  size: libraryFiles.size,
  pageCount: libraryFiles.pageCount,
  createdAt: libraryFiles.createdAt,
};

const DETAIL_FILE_COLUMNS = {
  ...LIST_FILE_COLUMNS,
  description: libraryFiles.description,
  pageOffset: libraryFiles.pageOffset,
  tags: libraryFiles.tags,
  publishedAt: libraryFiles.publishedAt,
  // The reader only ever asked "is there text to answer questions about?" —
  // it never displayed the text itself, so send the answer, not the corpus.
  hasText: sql<boolean>`(${libraryFiles.extractedText} is not null and length(${libraryFiles.extractedText}) > 0)`,
};

const viewInput = z.union([z.object({ id: z.string().uuid() }), z.object({ token: z.string().min(1) })]);

/**
 * Single gate for "can this viewer see this file": either it's genuinely
 * public (status=published, visibility=public), or the caller holds a
 * currently-valid share token for it — see domain/shareLink.ts. A share link
 * intentionally bypasses status/visibility so an admin can share a Draft
 * with specific people without publishing it site-wide.
 */
async function resolveViewableFile(input: z.infer<typeof viewInput>) {
  if ("token" in input) {
    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, input.token));
    if (!link || !isShareLinkValid(link, new Date())) return null;
    const [file] = await db.select().from(libraryFiles).where(eq(libraryFiles.id, link.fileId));
    return file ?? null;
  }
  const [file] = await db.select().from(libraryFiles).where(and(eq(libraryFiles.id, input.id), PUBLIC_FILTER));
  return file ?? null;
}

/**
 * The reader needs three things to show a file: its metadata, a signed URL for
 * the bytes, and a download link. Asking for them separately cost two serial
 * round-trips to a free-tier instance — ~1.6s before the first PDF byte was
 * requested — because the client could only ask for the URL once it knew from
 * the metadata that the file was previewable. The server already knows that,
 * and signing an R2 URL is a local HMAC with no network call of its own, so
 * every detail response carries the links with it.
 */
type LinkableFile = Pick<typeof libraryFiles.$inferSelect, "id" | "mimeType" | "originalName" | "storageKey" | "previewStorageKey">;

async function viewLinks(file: LinkableFile, req: Request, token?: string) {
  const capability = previewCapability(file.mimeType, file.originalName);
  const inlineFromStorage = capability === "pdf-inline" || capability === "image-inline" || capability === "text-inline";
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
  return {
    preview: capability,
    // Prefer the recompressed, faster-loading rendition when one exists —
    // downloads always use storageKey, the untouched original.
    previewUrl: inlineFromStorage ? await storageAdapter.createPreviewUrl(file.previewStorageKey ?? file.storageKey) : null,
    downloadUrl: `${req.protocol}://${req.get("host")}/download/${file.id}${tokenQuery}`,
  };
}

export const libraryRouter = router({
  dashboard: publicProcedure.query(async () => {
    // One row, one connection, one round-trip. This deliberately does NOT fan
    // the counts out across parallel queries: Supabase's session-mode pooler
    // allows 15 client connections in total, shared with the session store and
    // with every other instance of this server, and a burst of concurrent
    // counts exhausts it (PostgresError EMAXCONNSESSION) — which fails the
    // whole tRPC batch, so the homepage renders nothing at all. Conditional
    // aggregates get the same numbers from a single scan instead.
    const publishedSql = sql`${libraryFiles.status} = 'published' and ${libraryFiles.visibility} = 'public'`;
    const publishedCount = (extra?: SQL) =>
      sql<number>`count(*) filter (where ${publishedSql}${extra ? sql` and ${extra}` : sql``})`.mapWith(Number);

    const [totals] = await db
      .select({
        total: count(),
        published: publishedCount(),
        draft: sql<number>`count(*) filter (where ${libraryFiles.status} = 'draft')`.mapWith(Number),
        archived: sql<number>`count(*) filter (where ${libraryFiles.status} = 'archived')`.mapWith(Number),
        uncategorized: publishedCount(sql`${libraryFiles.categoryId} is null`),
        ebook: publishedCount(sql`${libraryFiles.documentType} = 'ebook'`),
        document: publishedCount(sql`${libraryFiles.documentType} = 'document'`),
        spreadsheet: publishedCount(sql`${libraryFiles.documentType} = 'spreadsheet'`),
        slide: publishedCount(sql`${libraryFiles.documentType} = 'slide'`),
        poster: publishedCount(sql`${libraryFiles.documentType} = 'poster'`),
        other: publishedCount(sql`${libraryFiles.documentType} = 'other'`),
      })
      .from(libraryFiles);

    const categoryCounts = await db
      .select({
        categoryId: libraryCategories.id,
        name: libraryCategories.name,
        slug: libraryCategories.slug,
        fileCount: count(libraryFiles.id),
      })
      .from(libraryCategories)
      .leftJoin(libraryFiles, and(eq(libraryFiles.categoryId, libraryCategories.id), PUBLIC_FILTER))
      .groupBy(libraryCategories.id)
      .orderBy(desc(count(libraryFiles.id)));

    return {
      total: totals.total,
      published: totals.published,
      draft: totals.draft,
      archived: totals.archived,
      uncategorized: totals.uncategorized,
      typeCounts: {
        ebook: totals.ebook,
        document: totals.document,
        spreadsheet: totals.spreadsheet,
        slide: totals.slide,
        poster: totals.poster,
        other: totals.other,
      },
      categoryCounts,
    };
  }),

  categories: publicProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ input }) => {
    const where = input?.search ? ilike(libraryCategories.name, `%${input.search}%`) : undefined;
    return db.select().from(libraryCategories).where(where).orderBy(asc(libraryCategories.name));
  }),

  files: publicProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
        categoryId: z.string().uuid().optional(),
        uncategorized: z.boolean().optional(),
        author: z.string().optional(),
        type: z.enum(["ebook", "document", "spreadsheet", "slide", "poster"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      const keywordFilter = input.keyword
        ? or(
            ilike(libraryFiles.title, `%${input.keyword}%`),
            ilike(libraryFiles.originalName, `%${input.keyword}%`),
            ilike(libraryFiles.author, `%${input.keyword}%`),
          )
        : undefined;
      const categoryFilter = input.uncategorized
        ? isNull(libraryFiles.categoryId)
        : input.categoryId
          ? eq(libraryFiles.categoryId, input.categoryId)
          : undefined;
      // Exact match (not ilike-partial): avoids conflating "สม" with "สมชาย" on an author works page.
      const authorFilter = input.author ? eq(libraryFiles.author, input.author) : undefined;
      const typeFilter = input.type ? eq(libraryFiles.documentType, input.type) : undefined;
      const where = and(PUBLIC_FILTER, keywordFilter, categoryFilter, authorFilter, typeFilter);

      const [totalRow] = await db.select({ n: count() }).from(libraryFiles).where(where);
      const files = await db
        .select(LIST_FILE_COLUMNS)
        .from(libraryFiles)
        .where(where)
        .orderBy(desc(libraryFiles.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        files: files.map((f) => ({ ...f, preview: previewCapability(f.mimeType, f.originalName) })),
        total: totalRow.n,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  fileById: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input, ctx }) => {
    const [file] = await db
      .select({ ...DETAIL_FILE_COLUMNS, storageKey: libraryFiles.storageKey, previewStorageKey: libraryFiles.previewStorageKey })
      .from(libraryFiles)
      .where(and(eq(libraryFiles.id, input.id), PUBLIC_FILTER));
    if (!file) return null;
    const { storageKey, previewStorageKey, ...shared } = file;
    return { ...shared, ...(await viewLinks(file, ctx.req)) };
  }),

  fileByShareToken: publicProcedure.input(z.object({ token: z.string().min(1) })).query(async ({ input, ctx }) => {
    // resolveViewableFile reads the whole row because previewUrl/download need
    // storageKey — so the trimming to the public shape happens here instead.
    const file = await resolveViewableFile({ token: input.token });
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "SHARE_LINK_INVALID_OR_EXPIRED" });
    const { extractedText, storageKey, previewStorageKey, checksum, createdBy, status, visibility, updatedAt, ...shared } = file;
    return {
      ...shared,
      hasText: !!extractedText && extractedText.length > 0,
      ...(await viewLinks(file, ctx.req, input.token)),
    };
  }),

  previewUrl: publicProcedure.input(viewInput).query(async ({ input }) => {
    const file = await resolveViewableFile(input);
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "FILE_NOT_PUBLIC" });
    // Prefer the recompressed, faster-loading rendition when one exists —
    // downloads (below) always use storageKey, the untouched original.
    const url = await storageAdapter.createPreviewUrl(file.previewStorageKey ?? file.storageKey);
    return { url };
  }),

  previewHtml: publicProcedure.input(viewInput).query(async ({ input }) => {
    const file = await resolveViewableFile(input);
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "FILE_NOT_PUBLIC" });

    const capability = previewCapability(file.mimeType, file.originalName);
    if (capability !== "docx-inline" && capability !== "xlsx-inline") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "PREVIEW_UNSUPPORTED" });
    }

    try {
      return await renderOfficePreviewCached(file);
    } catch (err) {
      // Worth telling apart: storage being unreachable means "try again",
      // a conversion failure means this file will never render.
      const failedToRead = err instanceof Error && err.message === STORAGE_READ_FAILED;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: failedToRead ? "STORAGE_READ_FAILED" : "PREVIEW_RENDER_FAILED",
      });
    }
  }),

  downloadUrl: publicProcedure.input(viewInput).query(async ({ input, ctx }) => {
    const file = await resolveViewableFile(input);
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "FILE_NOT_PUBLIC" });
    const tokenQuery = "token" in input ? `?token=${encodeURIComponent(input.token)}` : "";
    return { url: `${ctx.req.protocol}://${ctx.req.get("host")}/download/${file.id}${tokenQuery}` };
  }),

  /**
   * Per-book Q&A ("AI librarian") — answers only from this file's own
   * extracted text. Never falls back to the model's own general knowledge:
   * when nothing in the book matches the question, we return the decline
   * message ourselves without even calling the AI (see
   * domain/passageRetrieval.ts), and the AI's own system prompt repeats the
   * same instruction as a second line of defense.
   */
  askBook: publicProcedure
    .input(z.object({ id: z.string().uuid(), question: z.string().trim().min(1).max(500) }))
    .mutation(async ({ input }) => {
      const [file] = await db.select().from(libraryFiles).where(and(eq(libraryFiles.id, input.id), PUBLIC_FILTER));
      if (!file) throw new TRPCError({ code: "NOT_FOUND" });

      if (!file.extractedText) {
        return { answer: null, status: "NO_TEXT" as const };
      }

      const passages = selectRelevantPassages(file.extractedText, input.question);
      if (passages.length === 0) {
        return { answer: "ไม่พบข้อมูลนี้ในเล่มนี้", status: "ANSWERED" as const };
      }

      try {
        const answer = await aiAdapter.answerFromContext(input.question, passages.join("\n\n---\n\n"));
        return { answer, status: "ANSWERED" as const };
      } catch (err) {
        console.error("[library.askBook] AI request failed:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_REQUEST_FAILED" });
      }
    }),
});
