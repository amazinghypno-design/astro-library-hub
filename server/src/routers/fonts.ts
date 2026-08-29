import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { noteFonts } from "../db/schema";
import { storageAdapter } from "../storage/index";
import { authedProcedure, router } from "./trpc";

/**
 * Fonts the owner brings in themselves.
 *
 * The site ships two Thai faces. Someone writing in their own notebook wants
 * the face their printed material already uses, or one they bought — so a
 * font file goes in the same way a book does: the browser PUTs the bytes
 * straight to object storage through a presigned URL (never through this
 * half-CPU instance), and only the row lands here.
 *
 * `format` is the CSS `format()` hint, decided from the extension at upload
 * time and stored, so an @font-face rule can be built from the row alone
 * without re-sniffing the file.
 */

const FONT_FORMATS: Record<string, { format: string; mimeType: string }> = {
  woff2: { format: "woff2", mimeType: "font/woff2" },
  woff: { format: "woff", mimeType: "font/woff" },
  ttf: { format: "truetype", mimeType: "font/ttf" },
  otf: { format: "opentype", mimeType: "font/otf" },
};

/** A Thai face with full glyph coverage is a few hundred KB; 12MB is generous for even an unsubsetted CJK-sized file. */
const MAX_FONT_BYTES = 12 * 1024 * 1024;

function extensionOf(originalName: string): string {
  const lastDot = originalName.lastIndexOf(".");
  return lastDot > 0 ? originalName.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

/**
 * The family name is written into note markup as `font-family: …` and is
 * matched by the sanitizer's allow-list (domain/noteContent.ts), so it stays
 * a plain name: letters (Thai included), digits, spaces and hyphens.
 */
const familySchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\w฀-๿][\w฀-๿ -]*$/, "FAMILY_NAME_INVALID");

export const fontsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: noteFonts.id,
        family: noteFonts.family,
        originalName: noteFonts.originalName,
        format: noteFonts.format,
        size: noteFonts.size,
        createdAt: noteFonts.createdAt,
      })
      .from(noteFonts)
      .where(eq(noteFonts.userId, ctx.user.id))
      .orderBy(asc(noteFonts.family));
  }),

  createUploadUrl: authedProcedure
    .input(z.object({ originalName: z.string().min(1), size: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const extension = extensionOf(input.originalName);
      const known = FONT_FORMATS[extension];
      if (!known) throw new TRPCError({ code: "BAD_REQUEST", message: "FONT_FORMAT_UNSUPPORTED" });
      if (input.size > MAX_FONT_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "FONT_TOO_LARGE" });

      const storageKey = `note-fonts/${ctx.user.id}/${randomUUID()}.${extension}`;
      const uploadUrl = await storageAdapter.createUploadUrl(storageKey, known.mimeType);
      return { uploadUrl, storageKey, format: known.format, mimeType: known.mimeType };
    }),

  /** Step 2: the bytes are already at storageKey — this only records them. */
  finalize: authedProcedure
    .input(
      z.object({
        storageKey: z.string().min(1),
        family: familySchema,
        originalName: z.string().min(1),
        size: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const extension = extensionOf(input.originalName);
      const known = FONT_FORMATS[extension];
      if (!known) throw new TRPCError({ code: "BAD_REQUEST", message: "FONT_FORMAT_UNSUPPORTED" });

      // The key is built server-side in createUploadUrl and namespaced by
      // account; refusing anything outside that prefix keeps this from being
      // a way to point a row at somebody else's object.
      if (!input.storageKey.startsWith(`note-fonts/${ctx.user.id}/`)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "FONT_KEY_INVALID" });
      }

      const [existing] = await db
        .select({ id: noteFonts.id })
        .from(noteFonts)
        .where(and(eq(noteFonts.userId, ctx.user.id), eq(noteFonts.family, input.family)));
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "FONT_FAMILY_TAKEN" });

      const [created] = await db
        .insert(noteFonts)
        .values({
          userId: ctx.user.id,
          family: input.family,
          originalName: input.originalName,
          format: known.format,
          mimeType: known.mimeType,
          size: input.size,
          storageKey: input.storageKey,
        })
        .returning({ id: noteFonts.id, family: noteFonts.family, format: noteFonts.format });
      return created;
    }),

  /**
   * Removing a font takes its bytes with it — unlike a note, nothing else can
   * ever reference them. Notes written in it keep the family name in their
   * markup and simply fall back to the site's own face, which is the same
   * thing that happens on a device where the font never loaded.
   */
  remove: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const [font] = await db
      .select({ storageKey: noteFonts.storageKey })
      .from(noteFonts)
      .where(and(eq(noteFonts.id, input.id), eq(noteFonts.userId, ctx.user.id)));
    if (!font) throw new TRPCError({ code: "NOT_FOUND" });

    await db.delete(noteFonts).where(and(eq(noteFonts.id, input.id), eq(noteFonts.userId, ctx.user.id)));
    // Best-effort: a row that is gone with bytes left behind is an orphan the
    // usage scan will find (scripts/findOrphanedObjects.ts); a row kept
    // because storage was briefly unreachable would be a font that cannot be
    // deleted at all.
    try {
      await storageAdapter.delete(font.storageKey);
    } catch (err) {
      console.error("[fonts.remove] storage delete failed:", err);
    }
    return { ok: true };
  }),
});
