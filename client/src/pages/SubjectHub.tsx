import { Link, useNavigate, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import FileCollection from "../components/FileCollection";
import KnowledgeChatPanel from "../components/KnowledgeChatPanel";
import { IconCategory, IconDocument, IconPlus, IconStar } from "../components/icons";

/**
 * One body of knowledge, whole: its วิชา, its books, its pages and its skills
 * on a single screen.
 *
 * This is the page the site is organised around now — everything narrows by
 * subject before it narrows by anything else, so a reader inside โหราศาสตร์
 * never sees a สั่งจิตใต้สำนึก book in a list, which is exactly the mixing the
 * owner asked to be impossible.
 *
 * The owner's half of the page (pages, skills, the AI) is scoped to this
 * subject too, and a visitor sees only the library half.
 */
export default function SubjectHub() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const me = trpc.auth.me.useQuery();
  const isOwner = !!me.data;
  const utils = trpc.useUtils();

  const hub = trpc.subjects.bySlug.useQuery({ slug }, { enabled: !!slug });
  const files = trpc.library.files.useQuery({ subject: slug, page: 1, pageSize: 12 }, { enabled: !!slug });
  const notes = trpc.notes.list.useQuery({ subject: slug }, { enabled: isOwner && !!slug });
  const skills = trpc.skills.list.useQuery({ subject: slug }, { enabled: isOwner && !!slug });

  const createNote = trpc.notes.create.useMutation({
    onSuccess: async (created) => {
      await utils.notes.list.invalidate();
      navigate(`/notes?id=${created.id}`);
    },
  });

  if (hub.isLoading) return <p className="py-12 text-center text-navy-700/60">กำลังเปิดหมวด…</p>;
  if (hub.isError || !hub.data) return <p className="py-12 text-center text-navy-700">ไม่พบหมวดนี้</p>;

  const { subject, categories, counts } = hub.data;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden
          className="shrink-0 w-14 h-14 rounded-2xl bg-gold-400/15 border border-gold-500/25 grid place-items-center text-3xl"
        >
          {subject.icon ?? "✦"}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">{subject.name}</h1>
          {subject.description && <p className="text-navy-700/70 mt-1 max-w-2xl">{subject.description}</p>}
          <p className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-navy-700/60">
            <span>
              <b className="text-navy-900">{counts.fileCount}</b> ตำรา
            </span>
            <span>
              <b className="text-navy-900">{categories.length}</b> วิชา
            </span>
            {isOwner && (
              <>
                <span>
                  <b className="text-navy-900">{counts.noteCount}</b> โน้ต
                </span>
                <span>
                  <b className="text-navy-900">{counts.skillCount}</b> สกิล
                </span>
              </>
            )}
          </p>
        </div>
        {isOwner && (
          <Link to="/admin/subjects" className="btn-outline text-sm py-2.5 px-4">
            แก้ไขหมวด / เพิ่มวิชา
          </Link>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={() => createNote.mutate({ title: "", subjectId: subject.id })}
            disabled={createNote.isLoading}
            className="btn-gold text-sm py-2.5 px-4 inline-flex items-center gap-1.5"
          >
            <IconPlus width={16} height={16} />
            {createNote.isLoading ? "กำลังเปิด…" : "เขียนโน้ตในหมวดนี้"}
          </button>
        )}
      </header>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900 mb-3">วิชาในหมวดนี้</h2>
        {categories.length === 0 ? (
          <p className="text-navy-700/60 text-sm">
            ยังไม่มีวิชาในหมวดนี้ —{" "}
            <Link to="/admin/subjects" className="text-gold-600 font-medium">
              เพิ่มวิชาที่นี่
            </Link>
          </p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {categories.map((category) => (
              <li key={category.id}>
                <Link to={`/library?categoryId=${category.id}`} className="card-interactive px-4 py-3 flex items-center gap-2.5">
                  <IconCategory width={17} height={17} className="text-gold-600 shrink-0" />
                  <span className="font-medium text-navy-900 truncate">{category.name}</span>
                  <span className="ml-auto text-sm text-navy-700/50">{category.fileCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(files.data?.files.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg font-semibold text-navy-900">ตำราในหมวดนี้</h2>
            <Link to={`/library?all=1`} className="text-sm text-navy-700 hover:text-gold-600 font-medium">
              ดูทั้งคลัง →
            </Link>
          </div>
          <FileCollection files={files.data?.files ?? []} />
        </section>
      )}

      {isOwner && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg font-semibold text-navy-900">โน้ตของฉันในหมวดนี้</h2>
            <Link to="/notes" className="text-sm text-navy-700 hover:text-gold-600 font-medium">
              โน้ตทั้งหมด →
            </Link>
          </div>
          {(notes.data?.length ?? 0) === 0 ? (
            <p className="text-navy-700/60 text-sm">ยังไม่มีโน้ตในหมวดนี้ — กด “เขียนโน้ตในหมวดนี้” เพื่อเริ่ม</p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-2.5">
              {notes.data?.slice(0, 8).map((note) => (
                <li key={note.id}>
                  <Link to={`/notes?id=${note.id}`} className="card-interactive px-4 py-3 flex items-center gap-2.5">
                    <span aria-hidden className="shrink-0">
                      {note.icon ? <span>{note.icon}</span> : <IconDocument width={15} height={15} className="text-navy-700/40" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-navy-900 text-sm truncate">{note.title || "ไม่มีชื่อ"}</span>
                      {note.excerpt && <span className="block text-xs text-navy-700/50 truncate">{note.excerpt}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isOwner && (skills.data?.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg font-semibold text-navy-900">สกิลในหมวดนี้</h2>
            <Link to="/skills" className="text-sm text-navy-700 hover:text-gold-600 font-medium">
              สกิลทั้งหมด →
            </Link>
          </div>
          <ul className="flex flex-wrap gap-2">
            {skills.data?.map((skill) => (
              <li key={skill.id} className="card px-3.5 py-2 flex items-center gap-2">
                <IconStar width={14} height={14} className="text-gold-500" />
                <span className="text-sm font-medium text-navy-900">{skill.name}</span>
                <span className="text-xs text-navy-700/50">{skill.level}/5</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isOwner && <KnowledgeChatPanel subject={slug} />}
    </div>
  );
}
