import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { notes, skills, subjects } from "../db/schema";
import { deriveNoteTitle, htmlToPlainText, sanitizeNoteHtml } from "../domain/noteContent";
import { markdownToHtml } from "../domain/markdownToHtml";
import { selectOverviewPassages, selectRelevantPassages } from "../domain/passageRetrieval";
import { chunkForProofreading, mergeFixes, parseProofreadFixes, PROOFREAD_SYSTEM_PROMPT } from "../domain/proofread";
import { aiAdapter } from "../ai/index";
import { authedProcedure, router } from "./trpc";

/**
 * The owner's own notebook: their pages and their skills.
 *
 * Every procedure here is `authedProcedure` **and** filters on
 * `userId = ctx.user.id` in the WHERE clause, never only on the id passed in.
 * The library's files are a public collection; this is private writing that
 * happens to live in the same app, and the two must not be reachable the same
 * way. A note id guessed or leaked is not enough to read, edit or delete a
 * note — it has to be your own.
 *
 * Content arrives as HTML and is sanitized on the way *in* (see
 * domain/noteContent.ts), so what is stored is already safe for anything that
 * later reads it. contentText is written at the same time: it is what search
 * matches and what the AI is given, and deriving it per request would mean
 * re-parsing every note's markup on every question.
 */

/** Columns for a list view — never contentHtml, which is the whole page. */
const NOTE_SUMMARY = {
  id: notes.id,
  title: notes.title,
  subjectId: notes.subjectId,
  icon: notes.icon,
  tags: notes.tags,
  isPinned: notes.isPinned,
  updatedAt: notes.updatedAt,
  excerpt: sql<string>`left(${notes.contentText}, 180)`,
};

const KNOWLEDGE_SYSTEM_PROMPT = `คุณเป็นผู้ช่วยส่วนตัวที่รู้จักโน้ตและสกิลของเจ้าของสมุดบันทึกนี้

กฎที่ต้องทำตามทุกครั้ง:
1. ตอบโดยอ้างอิงจาก "ข้อมูลจากโน้ตและสกิล" ที่ให้มาเท่านั้น ห้ามเดาหรือเติมความรู้ภายนอกที่เจ้าของไม่ได้เขียนไว้
2. ถ้าข้อมูลที่ให้มาไม่มีคำตอบ ให้ตอบว่า "ไม่พบข้อมูลนี้ในโน้ตของคุณ" แล้วบอกสั้นๆ ว่าควรจดอะไรเพิ่ม
3. สรุป จัดกลุ่ม เปรียบเทียบ และเรียบเรียงข้อมูลที่มีได้เต็มที่ — นั่นคืองานหลักของคุณ
4. เมื่ออ้างถึงเนื้อหา ให้บอกชื่อโน้ตหรือชื่อสกิลที่เอามาด้วย
5. ตอบเป็นภาษาไทย กระชับ เป็นข้อๆ เมื่อเหมาะสม`;

const SKILL_LEVELS = ["เริ่มต้น", "พอใช้", "ปานกลาง", "ชำนาญ", "เชี่ยวชาญ"];

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(20);

export const notesRouter = router({
  list: authedProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(200).optional(),
          tag: z.string().trim().max(40).optional(),
          subject: z.string().trim().max(60).optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      const filters = [eq(notes.userId, ctx.user.id)];
      if (input?.search) {
        const term = `%${input.search}%`;
        filters.push(or(ilike(notes.title, term), ilike(notes.contentText, term))!);
      }
      // tags is jsonb; `?` asks Postgres whether the array contains the string.
      if (input?.tag) filters.push(sql`${notes.tags} ? ${input.tag}`);
      if (input?.subject) filters.push(sql`${notes.subjectId} = (select id from ${subjects} where slug = ${input.subject})`);

      return db
        .select(NOTE_SUMMARY)
        .from(notes)
        .where(and(...filters))
        .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
        .limit(300);
    }),

  tags: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ tag: sql<string>`tag`, count: sql<number>`count(*)::int` })
      .from(sql`${notes}, jsonb_array_elements_text(${notes.tags}) as tag`)
      .where(eq(notes.userId, ctx.user.id))
      .groupBy(sql`tag`)
      .orderBy(sql`count(*) desc`);
    return rows;
  }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input, ctx }) => {
    const [note] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, input.id), eq(notes.userId, ctx.user.id)));
    if (!note) throw new TRPCError({ code: "NOT_FOUND" });
    return note;
  }),

  create: authedProcedure
    .input(
      z
        .object({
          title: z.string().trim().max(200).optional(),
          contentHtml: z.string().optional(),
          tags: tagsSchema.optional(),
          icon: z.string().max(8).nullish(),
          subjectId: z.string().uuid().nullish(),
        })
        .optional(),
    )
    .mutation(async ({ input, ctx }) => {
      const html = sanitizeNoteHtml(input?.contentHtml ?? "");
      const [created] = await db
        .insert(notes)
        .values({
          userId: ctx.user.id,
          title: input?.title ?? "",
          icon: input?.icon ?? null,
          contentHtml: html,
          contentText: htmlToPlainText(html),
          tags: input?.tags ?? [],
          subjectId: input?.subjectId ?? null,
        })
        .returning({ id: notes.id });
      return created;
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().max(200).optional(),
        icon: z.string().max(8).nullish(),
        contentHtml: z.string().optional(),
        tags: tagsSchema.optional(),
        isPinned: z.boolean().optional(),
        subjectId: z.string().uuid().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) patch.title = input.title;
      if (input.icon !== undefined) patch.icon = input.icon;
      if (input.tags !== undefined) patch.tags = input.tags;
      if (input.isPinned !== undefined) patch.isPinned = input.isPinned;
      if (input.subjectId !== undefined) patch.subjectId = input.subjectId;
      if (input.contentHtml !== undefined) {
        const html = sanitizeNoteHtml(input.contentHtml);
        patch.contentHtml = html;
        patch.contentText = htmlToPlainText(html);
      }

      const updated = await db
        .update(notes)
        .set(patch)
        .where(and(eq(notes.id, input.id), eq(notes.userId, ctx.user.id)))
        .returning({ id: notes.id, updatedAt: notes.updatedAt });
      if (updated.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return updated[0];
    }),

  remove: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const deleted = await db
      .delete(notes)
      .where(and(eq(notes.id, input.id), eq(notes.userId, ctx.user.id)))
      .returning({ id: notes.id });
    if (deleted.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    return { ok: true };
  }),

  /**
   * Bringing writing in from Notion (or anywhere else that exports Markdown).
   * The title comes from the file's own H1 when the importer doesn't name it,
   * because that is what a Notion export puts on the first line of every page.
   */
  importMarkdown: authedProcedure
    .input(
      z.object({
        markdown: z.string().min(1),
        title: z.string().trim().max(200).optional(),
        tags: tagsSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const html = sanitizeNoteHtml(markdownToHtml(input.markdown));
      const title = input.title?.trim() || deriveNoteTitle(html, "นำเข้าจาก Notion");
      const [created] = await db
        .insert(notes)
        .values({
          userId: ctx.user.id,
          title,
          contentHtml: html,
          contentText: htmlToPlainText(html),
          tags: input.tags ?? [],
        })
        .returning({ id: notes.id, title: notes.title });
      return created;
    }),

  /**
   * "ถาม AI เกี่ยวกับความรู้ของฉัน" — the point of keeping the notes here
   * rather than in Notion: an assistant that has read all of them.
   *
   * The skills table goes into the context whole (it is a few hundred
   * characters and it is exactly what the question is usually about), while
   * the notes are retrieved per note with the same keyword ranking the book
   * Q&A uses — scored inside each note so a matched passage can be labelled
   * with the page it came from, which a single concatenated corpus loses.
   * When nothing matches, an overview of the most recently edited pages goes
   * instead, so "ฉันมีความรู้เรื่องอะไรบ้าง" is answerable at all.
   *
   * Only this account's own rows are ever loaded, and the model is given
   * nothing else.
   */
  ask: authedProcedure
    .input(
      z.object({
        question: z.string().trim().min(1).max(500),
        tag: z.string().trim().max(40).optional(),
        subject: z.string().trim().max(60).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const skillFilters = [eq(skills.userId, ctx.user.id)];
      if (input.subject) skillFilters.push(sql`${skills.subjectId} = (select id from ${subjects} where slug = ${input.subject})`);
      const skillRows = await db
        .select()
        .from(skills)
        .where(and(...skillFilters))
        .orderBy(asc(skills.category), desc(skills.level));

      const noteFilters = [eq(notes.userId, ctx.user.id)];
      if (input.tag) noteFilters.push(sql`${notes.tags} ? ${input.tag}`);
      if (input.subject) noteFilters.push(sql`${notes.subjectId} = (select id from ${subjects} where slug = ${input.subject})`);
      const noteRows = await db
        .select({ id: notes.id, title: notes.title, tags: notes.tags, contentText: notes.contentText })
        .from(notes)
        .where(and(...noteFilters))
        .orderBy(desc(notes.updatedAt))
        .limit(200);

      const skillBlock =
        skillRows.length > 0
          ? [
              "### สกิลของเจ้าของ",
              ...skillRows.map((s) =>
                [
                  `- ${s.name}`,
                  s.category ? `(หมวด: ${s.category})` : "",
                  `ระดับ ${s.level}/5 — ${SKILL_LEVELS[s.level - 1] ?? ""}`,
                  s.experience ? `ประสบการณ์: ${s.experience}` : "",
                  s.summary ? `สรุป: ${s.summary}` : "",
                ]
                  .filter(Boolean)
                  .join(" "),
              ),
            ].join("\n")
          : "";

      const MAX_CONTEXT_CHARS = 9000;
      const passages: string[] = [];
      let budget = MAX_CONTEXT_CHARS - skillBlock.length;

      for (const note of noteRows) {
        if (budget <= 0) break;
        if (!note.contentText.trim()) continue;
        const matched = selectRelevantPassages(note.contentText, input.question, { maxPassages: 2, maxTotalChars: 2400 });
        if (matched.length === 0) continue;
        const block = `### โน้ต: ${note.title || "ไม่มีชื่อ"}${note.tags.length ? ` [${note.tags.join(", ")}]` : ""}\n${matched.join("\n…\n")}`;
        passages.push(block.slice(0, budget));
        budget -= block.length;
      }

      if (passages.length === 0) {
        for (const note of noteRows.slice(0, 8)) {
          if (budget <= 0) break;
          if (!note.contentText.trim()) continue;
          const overview = selectOverviewPassages(note.contentText, { maxPassages: 2, maxTotalChars: 1200 });
          if (overview.length === 0) continue;
          const block = `### โน้ต: ${note.title || "ไม่มีชื่อ"}\n${overview.join("\n…\n")}`;
          passages.push(block.slice(0, budget));
          budget -= block.length;
        }
      }

      const context = [skillBlock, ...passages].filter(Boolean).join("\n\n---\n\n");
      if (!context.trim()) {
        return { answer: null, status: "NO_KNOWLEDGE" as const };
      }

      try {
        const answer = await aiAdapter.answerFromContext(input.question, context, {
          systemPrompt: KNOWLEDGE_SYSTEM_PROMPT,
          maxTokens: 900,
        });
        return { answer, status: "ANSWERED" as const };
      } catch (err) {
        console.error("[notes.ask] AI request failed:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_REQUEST_FAILED" });
      }
    }),

  /**
   * Proofreads the page the reader is looking at.
   *
   * Takes the text from the editor rather than a note id on purpose: the
   * point is to check what is on screen right now, including the paragraph
   * just dictated and not yet saved. Nothing is written here — the reply is a
   * list of suggested replacements and the editor decides what to do with
   * them, so a check can never alter a note by itself.
   *
   * See domain/proofread.ts for why the model is asked for replacements
   * instead of a corrected copy of the page.
   */
  proofread: authedProcedure
    .input(z.object({ text: z.string().max(200_000) }))
    .mutation(async ({ input }) => {
      const chunks = chunkForProofreading(input.text);
      if (chunks.length === 0) {
        return { fixes: [], checkedChars: 0, uncheckedChars: 0 };
      }

      const checkedChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

      try {
        // One request at a time. The pages long enough to need several are
        // rare, and a burst of parallel calls is the quickest way to spend a
        // free tier's rate limit on a single button press.
        const batches = [];
        for (const chunk of chunks) {
          const raw = await aiAdapter.transform(PROOFREAD_SYSTEM_PROMPT, chunk, { maxTokens: 1500 });
          batches.push(parseProofreadFixes(raw, chunk));
        }
        return {
          fixes: mergeFixes(batches),
          checkedChars,
          // Honest about the tail of a very long page that was not read,
          // rather than reporting "no mistakes" for text nobody looked at.
          uncheckedChars: Math.max(0, input.text.length - checkedChars),
        };
      } catch (err) {
        console.error("[notes.proofread] AI request failed:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_REQUEST_FAILED" });
      }
    }),
});
