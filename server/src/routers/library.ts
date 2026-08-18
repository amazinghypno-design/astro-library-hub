import { z } from "zod";
import { and, asc, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { libraryCategories, libraryFiles, shareLinks } from "../db/schema";
import { TRPCError } from "@trpc/server";
import { previewCapability } from "../domain/previewCapability";
import { isShareLinkValid } from "../domain/shareLink";
import { selectRelevantPassages } from "../domain/passageRetrieval";
import { router, publicProcedure } from "./trpc";
import { storageAdapter } from "../storage/index";
import { renderDocxToHtml, renderXlsxToSheets } from "../services/renderOfficePreview";
import { aiAdapter } from "../ai/index";

const PUBLIC_FILTER = and(eq(libraryFiles.status, "published"), eq(libraryFiles.visibility, "public"));

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

export const libraryRouter = router({
  dashboard: publicProcedure.query(async () => {
    const [totalRow] = await db.select({ n: count() }).from(libraryFiles);
    const [publishedRow] = await db.select({ n: count() }).from(libraryFiles).where(PUBLIC_FILTER);
    const [draftRow] = await db.select({ n: count() }).from(libraryFiles).where(eq(libraryFiles.status, "draft"));
    const [archivedRow] = await db.select({ n: count() }).from(libraryFiles).where(eq(libraryFiles.status, "archived"));
    const [uncategorizedRow] = await db
      .select({ n: count() })
      .from(libraryFiles)
      .where(and(PUBLIC_FILTER, isNull(libraryFiles.categoryId)));

    const publishedFiles = await db
      .select({ documentType: libraryFiles.documentType })
      .from(libraryFiles)
      .where(PUBLIC_FILTER);

    const typeCounts = { ebook: 0, document: 0, spreadsheet: 0, slide: 0, poster: 0, other: 0 };
    for (const file of publishedFiles) {
      typeCounts[file.documentType] += 1;
    }

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
      total: totalRow.n,
      published: publishedRow.n,
      draft: draftRow.n,
      archived: archivedRow.n,
      uncategorized: uncategorizedRow.n,
      typeCounts,
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
        .select()
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

  fileById: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    const [file] = await db.select().from(libraryFiles).where(and(eq(libraryFiles.id, input.id), PUBLIC_FILTER));
    if (!file) return null;
    return { ...file, preview: previewCapability(file.mimeType, file.originalName) };
  }),

  fileByShareToken: publicProcedure.input(z.object({ token: z.string().min(1) })).query(async ({ input }) => {
    const file = await resolveViewableFile({ token: input.token });
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "SHARE_LINK_INVALID_OR_EXPIRED" });
    return { ...file, preview: previewCapability(file.mimeType, file.originalName) };
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

    let bytes: Buffer;
    try {
      bytes = await storageAdapter.get(file.storageKey);
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "STORAGE_READ_FAILED" });
    }

    try {
      if (capability === "docx-inline") {
        const html = await renderDocxToHtml(bytes);
        return { html, sheets: null };
      }
      const sheets = await renderXlsxToSheets(bytes);
      return { html: null, sheets };
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PREVIEW_RENDER_FAILED" });
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
