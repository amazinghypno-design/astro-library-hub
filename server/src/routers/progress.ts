import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { bookmarks, highlights, readingProgress } from "../db/schema";
import { router, authedProcedure } from "./trpc";

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
      .select({ pageNumber: bookmarks.pageNumber })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, ctx.user.id), eq(bookmarks.fileId, input.fileId)));
    const highlightRows = await db
      .select({ id: highlights.id, pageNumber: highlights.pageNumber, text: highlights.text, rects: highlights.rects })
      .from(highlights)
      .where(and(eq(highlights.userId, ctx.user.id), eq(highlights.fileId, input.fileId)))
      .orderBy(asc(highlights.pageNumber));
    return {
      lastPage: progress?.lastPage ?? null,
      bookmarks: marks.map((m) => m.pageNumber).sort((a, b) => a - b),
      highlights: highlightRows,
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
      const marks = await db
        .select({ pageNumber: bookmarks.pageNumber })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, ctx.user.id), eq(bookmarks.fileId, input.fileId)));
      return marks.map((m) => m.pageNumber).sort((a, b) => a - b);
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
});
