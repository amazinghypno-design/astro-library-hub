import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { bookmarks, drawings, highlights, readingProgress } from "../db/schema";
import { router, authedProcedure } from "./trpc";

const pointSchema = z.object({ x: z.number(), y: z.number() });

interface BookmarkRow {
  pageNumber: number;
  note: string;
}

const sortByPage = (rows: BookmarkRow[]) => [...rows].sort((a, b) => a.pageNumber - b.pageNumber);

async function listBookmarks(userId: string, fileId: string): Promise<BookmarkRow[]> {
  const rows = await db
    .select({ pageNumber: bookmarks.pageNumber, note: bookmarks.note })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.fileId, fileId)));
  return sortByPage(rows);
}

/**
 * Account-scoped reading progress + bookmarks — the synced-across-devices
 * counterpart to the localStorage version in client/src/lib/readingProgress.ts,
 * which anonymous readers still get. Requires login (authedProcedure): any
 * role, not just admin — this is a public-reader feature.
 */
export const progressRouter = router({
  get: authedProcedure.input(z.object({ fileId: z.string().uuid() })).query(async ({ input, ctx }) => {
    const [progress] = await db
      .select()
      .from(readingProgress)
      .where(and(eq(readingProgress.userId, ctx.user.id), eq(readingProgress.fileId, input.fileId)));
    const marks = await db
      .select({ pageNumber: bookmarks.pageNumber, note: bookmarks.note })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, ctx.user.id), eq(bookmarks.fileId, input.fileId)));
    const highlightRows = await db
      .select({ id: highlights.id, pageNumber: highlights.pageNumber, text: highlights.text, rects: highlights.rects })
      .from(highlights)
      .where(and(eq(highlights.userId, ctx.user.id), eq(highlights.fileId, input.fileId)))
      .orderBy(asc(highlights.pageNumber));
    const drawingRows = await db
      .select({
        id: drawings.id,
        pageNumber: drawings.pageNumber,
        tool: drawings.tool,
        color: drawings.color,
        strokeWidth: drawings.strokeWidth,
        points: drawings.points,
      })
      .from(drawings)
      .where(and(eq(drawings.userId, ctx.user.id), eq(drawings.fileId, input.fileId)))
      .orderBy(asc(drawings.createdAt));
    return {
      lastPage: progress?.lastPage ?? null,
      bookmarks: sortByPage(marks),
      highlights: highlightRows,
      drawings: drawingRows,
    };
  }),

  saveLastPage: authedProcedure
    .input(z.object({ fileId: z.string().uuid(), page: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select({ id: readingProgress.id })
        .from(readingProgress)
        .where(and(eq(readingProgress.userId, ctx.user.id), eq(readingProgress.fileId, input.fileId)));
      if (existing) {
        await db
          .update(readingProgress)
          .set({ lastPage: input.page, updatedAt: new Date() })
          .where(eq(readingProgress.id, existing.id));
      } else {
        await db.insert(readingProgress).values({ userId: ctx.user.id, fileId: input.fileId, lastPage: input.page });
      }
      return { ok: true };
    }),

  toggleBookmark: authedProcedure
    .input(z.object({ fileId: z.string().uuid(), page: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, ctx.user.id), eq(bookmarks.fileId, input.fileId), eq(bookmarks.pageNumber, input.page)));
      if (existing) {
        await db.delete(bookmarks).where(eq(bookmarks.id, existing.id));
      } else {
        await db.insert(bookmarks).values({ userId: ctx.user.id, fileId: input.fileId, pageNumber: input.page });
      }
      return listBookmarks(ctx.user.id, input.fileId);
    }),

  /**
   * Writes (or clears) the note on a bookmark. Marking a page and saying what
   * it is about are one gesture to the reader, so a note on a page that isn't
   * bookmarked yet creates the bookmark rather than failing — otherwise the
   * client would have to make two round trips in the right order for what the
   * reader experienced as one action.
   */
  setBookmarkNote: authedProcedure
    .input(z.object({ fileId: z.string().uuid(), page: z.number().int().positive(), note: z.string().max(500) }))
    .mutation(async ({ input, ctx }) => {
      const note = input.note.trim();
      const [existing] = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, ctx.user.id), eq(bookmarks.fileId, input.fileId), eq(bookmarks.pageNumber, input.page)));
      if (existing) {
        await db.update(bookmarks).set({ note }).where(eq(bookmarks.id, existing.id));
      } else {
        await db.insert(bookmarks).values({ userId: ctx.user.id, fileId: input.fileId, pageNumber: input.page, note });
      }
      return listBookmarks(ctx.user.id, input.fileId);
    }),

  addHighlight: authedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        page: z.number().int().positive(),
        text: z.string().min(1),
        rects: z.array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [created] = await db
        .insert(highlights)
        .values({ userId: ctx.user.id, fileId: input.fileId, pageNumber: input.page, text: input.text, rects: input.rects })
        .returning({ id: highlights.id, pageNumber: highlights.pageNumber, text: highlights.text, rects: highlights.rects });
      return created;
    }),

  removeHighlight: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    await db.delete(highlights).where(and(eq(highlights.id, input.id), eq(highlights.userId, ctx.user.id)));
    return { ok: true };
  }),

  addDrawing: authedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        page: z.number().int().positive(),
        tool: z.enum(["pen", "highlighter"]),
        color: z.string().min(1),
        strokeWidth: z.number().positive(),
        points: z.array(pointSchema).min(2),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [created] = await db
        .insert(drawings)
        .values({
          userId: ctx.user.id,
          fileId: input.fileId,
          pageNumber: input.page,
          tool: input.tool,
          color: input.color,
          strokeWidth: input.strokeWidth,
          points: input.points,
        })
        .returning({
          id: drawings.id,
          pageNumber: drawings.pageNumber,
          tool: drawings.tool,
          color: drawings.color,
          strokeWidth: drawings.strokeWidth,
          points: drawings.points,
        });
      return created;
    }),

  removeDrawing: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    await db.delete(drawings).where(and(eq(drawings.id, input.id), eq(drawings.userId, ctx.user.id)));
    return { ok: true };
  }),

  clearPageDrawings: authedProcedure
    .input(z.object({ fileId: z.string().uuid(), page: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(drawings)
        .where(and(eq(drawings.userId, ctx.user.id), eq(drawings.fileId, input.fileId), eq(drawings.pageNumber, input.page)));
      return { ok: true };
    }),
});
