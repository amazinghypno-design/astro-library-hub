import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { notes, skills, subjects } from "../db/schema";
import { authedProcedure, router } from "./trpc";

/**
 * The owner's skills — the structured half of the notebook.
 *
 * A skill row carries only what is worth sorting and filtering on (name,
 * area, level, how long they have practiced). Everything long-form lives in a
 * note, created with the skill and linked by noteId, so writing about a skill
 * uses the same editor with the same tools as any other page instead of a
 * second, weaker one. That note is also tagged `SKILL_TAG`, which is what
 * makes every skill page show up in the notebook's own list and in a
 * tag-scoped AI question.
 *
 * Deleting a skill leaves its note alone. The writing usually outlives the
 * decision to keep tracking the skill, and a delete that silently takes pages
 * with it is not a delete anyone can undo.
 */
export const SKILL_TAG = "สกิล";

const levelSchema = z.number().int().min(1).max(5);

export const skillsRouter = router({
  list: authedProcedure.input(z.object({ subject: z.string().trim().max(60).optional() }).optional()).query(async ({ input, ctx }) => {
    const filters = [eq(skills.userId, ctx.user.id)];
    if (input?.subject) filters.push(sql`${skills.subjectId} = (select id from ${subjects} where slug = ${input.subject})`);
    return db
      .select({
        id: skills.id,
        name: skills.name,
        category: skills.category,
        level: skills.level,
        summary: skills.summary,
        experience: skills.experience,
        noteId: skills.noteId,
        subjectId: skills.subjectId,
        noteTitle: notes.title,
        updatedAt: skills.updatedAt,
      })
      .from(skills)
      .leftJoin(notes, eq(skills.noteId, notes.id))
      .where(and(...filters))
      .orderBy(asc(skills.category), desc(skills.level), asc(skills.name));
  }),

  create: authedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        category: z.string().trim().max(60).optional(),
        level: levelSchema.default(1),
        summary: z.string().trim().max(500).optional(),
        experience: z.string().trim().max(120).optional(),
        subjectId: z.string().uuid().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select({ id: skills.id })
        .from(skills)
        .where(and(eq(skills.userId, ctx.user.id), eq(skills.name, input.name)));
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "SKILL_NAME_TAKEN" });

      // The skill's own page, made up front rather than on first edit: an
      // empty page invites writing, and a skill with nowhere to write is the
      // thing this feature exists to fix.
      const [note] = await db
        .insert(notes)
        .values({
          userId: ctx.user.id,
          title: input.name,
          contentHtml: "",
          contentText: "",
          subjectId: input.subjectId ?? null,
          tags: input.category ? [SKILL_TAG, input.category] : [SKILL_TAG],
        })
        .returning({ id: notes.id });

      const [created] = await db
        .insert(skills)
        .values({
          userId: ctx.user.id,
          name: input.name,
          category: input.category ?? null,
          level: input.level,
          summary: input.summary ?? null,
          experience: input.experience ?? null,
          subjectId: input.subjectId ?? null,
          noteId: note.id,
        })
        .returning({ id: skills.id, noteId: skills.noteId });
      return created;
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        category: z.string().trim().max(60).nullish(),
        level: levelSchema.optional(),
        summary: z.string().trim().max(500).nullish(),
        experience: z.string().trim().max(120).nullish(),
        subjectId: z.string().uuid().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [before] = await db
        .select({ name: skills.name, noteId: skills.noteId })
        .from(skills)
        .where(and(eq(skills.id, input.id), eq(skills.userId, ctx.user.id)));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.category !== undefined) patch.category = input.category;
      if (input.level !== undefined) patch.level = input.level;
      if (input.summary !== undefined) patch.summary = input.summary;
      if (input.experience !== undefined) patch.experience = input.experience;
      if (input.subjectId !== undefined) patch.subjectId = input.subjectId;

      const updated = await db
        .update(skills)
        .set(patch)
        .where(and(eq(skills.id, input.id), eq(skills.userId, ctx.user.id)))
        .returning({ id: skills.id, noteId: skills.noteId });
      if (updated.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      // A renamed skill renames its page too, but only while the page still
      // carries the old name — a title the owner has since written themselves
      // is theirs, not ours to overwrite.
      if (input.name !== undefined && input.name !== before.name && before.noteId) {
        await db
          .update(notes)
          .set({ title: input.name, updatedAt: new Date() })
          .where(and(eq(notes.id, before.noteId), eq(notes.userId, ctx.user.id), eq(notes.title, before.name)));
      }
      return updated[0];
    }),

  remove: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const deleted = await db
      .delete(skills)
      .where(and(eq(skills.id, input.id), eq(skills.userId, ctx.user.id)))
      .returning({ id: skills.id });
    if (deleted.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    return { ok: true };
  }),
});
