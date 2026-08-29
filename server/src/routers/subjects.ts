import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { libraryCategories, libraryFiles, notes, skills, subjects } from "../db/schema";
import { adminProcedure, publicProcedure, router } from "./trpc";

/**
 * หมวดใหญ่ — the top level of the site.
 *
 * Note the `${table}.id` form in the counting subqueries below rather than
 * `${table.id}`: drizzle renders a bare column reference unqualified ("id"),
 * which inside a subquery binds to the *inner* table and silently counts
 * nothing at all — a wrong answer rather than an error. Qualifying by the
 * table keeps the correlation real.
 *
 * A subject is a body of knowledge (โหราศาสตร์, สั่งจิตใต้สำนึก), and the rule
 * the owner set is that they never mix: the วิชา inside one subject, its
 * books, its pages and its skills all stay inside it. Everything else on the
 * site narrows by subject first, which is why the id lives on every one of
 * those tables rather than being reached through a join chain.
 *
 * The counts here are what make the homepage's subject cards honest — a
 * subject with nothing in it says so, instead of looking identical to a full
 * one. Books are counted with the public filter (what a visitor would see);
 * pages and skills are the owner's own and are counted only for a session.
 */

// Thai is allowed in a slug, the same way the existing วิชา slugs already
// carry it: a Thai-named subject should not force its owner to invent an
// English handle before it can exist. The URL percent-encodes it and the
// slug stays the stable id an outside tool stores.
const slugPattern = /^[a-z0-9ก-๙]+(?:-[a-z0-9ก-๙]+)*$/;

export const subjectsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id ?? null;
    const rows = await db
      .select({
        id: subjects.id,
        slug: subjects.slug,
        name: subjects.name,
        description: subjects.description,
        icon: subjects.icon,
        sortOrder: subjects.sortOrder,
        fileCount: sql<number>`(
          select count(*)::int from ${libraryFiles} f
          where f.subject_id = ${subjects}.id and f.status = 'published' and f.visibility = 'public'
        )`,
        categoryCount: sql<number>`(
          select count(*)::int from ${libraryCategories} c where c.subject_id = ${subjects}.id
        )`,
        noteCount: userId
          ? sql<number>`(select count(*)::int from ${notes} n where n.subject_id = ${subjects}.id and n.user_id = ${userId})`
          : sql<number>`0`,
        skillCount: userId
          ? sql<number>`(select count(*)::int from ${skills} s where s.subject_id = ${subjects}.id and s.user_id = ${userId})`
          : sql<number>`0`,
      })
      .from(subjects)
      .orderBy(asc(subjects.sortOrder), asc(subjects.name));
    return rows;
  }),

  /** One subject with the วิชา inside it — the subject hub page's whole payload. */
  bySlug: publicProcedure.input(z.object({ slug: z.string().min(1) })).query(async ({ input, ctx }) => {
    const [subject] = await db.select().from(subjects).where(eq(subjects.slug, input.slug));
    if (!subject) throw new TRPCError({ code: "NOT_FOUND" });

    const categories = await db
      .select({
        id: libraryCategories.id,
        name: libraryCategories.name,
        slug: libraryCategories.slug,
        description: libraryCategories.description,
        fileCount: sql<number>`(
          select count(*)::int from ${libraryFiles} f
          where f.category_id = ${libraryCategories}.id and f.status = 'published' and f.visibility = 'public'
        )`,
      })
      .from(libraryCategories)
      .where(eq(libraryCategories.subjectId, subject.id))
      .orderBy(asc(libraryCategories.name));

    const [counts] = await db
      .select({
        fileCount: sql<number>`(
          select count(*)::int from ${libraryFiles} f
          where f.subject_id = ${subject.id} and f.status = 'published' and f.visibility = 'public'
        )`,
        noteCount: ctx.user
          ? sql<number>`(select count(*)::int from ${notes} n where n.subject_id = ${subject.id} and n.user_id = ${ctx.user.id})`
          : sql<number>`0`,
        skillCount: ctx.user
          ? sql<number>`(select count(*)::int from ${skills} s where s.subject_id = ${subject.id} and s.user_id = ${ctx.user.id})`
          : sql<number>`0`,
      })
      .from(subjects)
      .where(eq(subjects.id, subject.id));

    return { subject, categories, counts };
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        slug: z.string().trim().min(1).max(60).regex(slugPattern, "SLUG_INVALID"),
        description: z.string().trim().max(400).optional(),
        icon: z.string().max(8).optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const [clash] = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(sql`${subjects.slug} = ${input.slug} or ${subjects.name} = ${input.name}`);
      if (clash) throw new TRPCError({ code: "CONFLICT", message: "SUBJECT_EXISTS" });

      const [created] = await db
        .insert(subjects)
        .values({
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          icon: input.icon ?? null,
          sortOrder: input.sortOrder ?? 99,
        })
        .returning({ id: subjects.id, slug: subjects.slug });
      return created;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().trim().max(400).nullish(),
        icon: z.string().max(8).nullish(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.icon !== undefined) patch.icon = input.icon;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      // The slug is deliberately not editable: it is in every link and would
      // be the one thing an outside tool has stored.
      const updated = await db.update(subjects).set(patch).where(eq(subjects.id, input.id)).returning({ id: subjects.id });
      if (updated.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return updated[0];
    }),

  /** Refused while anything still lives in it — an empty subject is the only safe one to remove. */
  remove: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    const [held] = await db
      .select({
        files: sql<number>`(select count(*)::int from ${libraryFiles} f where f.subject_id = ${input.id})`,
        categories: sql<number>`(select count(*)::int from ${libraryCategories} c where c.subject_id = ${input.id})`,
        notes: sql<number>`(select count(*)::int from ${notes} n where n.subject_id = ${input.id})`,
      })
      .from(subjects)
      .where(eq(subjects.id, input.id));
    if (!held) throw new TRPCError({ code: "NOT_FOUND" });
    if (held.files > 0 || held.categories > 0 || held.notes > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "SUBJECT_NOT_EMPTY" });
    }
    await db.delete(subjects).where(eq(subjects.id, input.id));
    return { ok: true };
  }),

  /** Moves a วิชา (and every file in it) from one subject to another, in one step. */
  moveCategory: adminProcedure
    .input(z.object({ categoryId: z.string().uuid(), subjectId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const [subject] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, input.subjectId));
      if (!subject) throw new TRPCError({ code: "NOT_FOUND", message: "SUBJECT_NOT_FOUND" });

      await db.update(libraryCategories).set({ subjectId: input.subjectId, updatedAt: new Date() }).where(eq(libraryCategories.id, input.categoryId));
      // A file follows its วิชา — leaving them behind is exactly the mixing
      // this structure exists to prevent.
      await db
        .update(libraryFiles)
        .set({ subjectId: input.subjectId, updatedAt: new Date() })
        .where(and(eq(libraryFiles.categoryId, input.categoryId)));
      return { ok: true };
    }),
});
