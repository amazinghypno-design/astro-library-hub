import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { IconDocument, IconPlus, IconStar } from "./icons";

/**
 * The notebook, on the homepage.
 *
 * This is the owner's most-used feature and the one the whole site is growing
 * towards, so it does not live behind a menu: the first thing under the hero
 * is a box you can type the first line into, which creates the page and opens
 * it — the shortest path there is from "I want to write something down" to
 * writing it. Under that are the pages last worked on, because returning to
 * yesterday's page is the other thing done here every day.
 *
 * Renders nothing at all for a visitor who is not the owner. The library is
 * public; this is not, and a logged-out homepage should not even hint that
 * there are private pages behind it.
 */
export default function NotebookHomePanel() {
  const navigate = useNavigate();
  const me = trpc.auth.me.useQuery();
  const isOwner = !!me.data;

  const [firstLine, setFirstLine] = useState("");
  const utils = trpc.useUtils();
  const recent = trpc.notes.list.useQuery(undefined, { enabled: isOwner });
  const skills = trpc.skills.list.useQuery(undefined, { enabled: isOwner });

  const create = trpc.notes.create.useMutation({
    onSuccess: async (created) => {
      setFirstLine("");
      await utils.notes.list.invalidate();
      navigate(`/notes?id=${created.id}`);
    },
  });

  if (!isOwner) return null;

  function startWriting(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ title: firstLine.trim() || "" });
  }

  const recentNotes = (recent.data ?? []).slice(0, 4);

  return (
    <section className="card p-5 sm:p-6 border-gold-500/30 bg-gradient-to-br from-gold-400/[0.07] to-transparent">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="font-serif text-xl sm:text-2xl font-semibold text-navy-900">สมุดโน้ตของฉัน</h2>
        <span className="text-sm text-navy-700/60">เขียนความรู้และสกิล แล้วให้ AI อ่านได้</span>
        <div className="ml-auto flex gap-2">
          <Link to="/skills" className="text-sm font-medium text-navy-700 hover:text-gold-600 inline-flex items-center gap-1.5">
            <IconStar width={15} height={15} /> สกิล
            {skills.data && skills.data.length > 0 && <span className="text-navy-700/45">{skills.data.length}</span>}
          </Link>
          <Link to="/notes" className="text-sm font-medium text-navy-700 hover:text-gold-600">
            ดูทั้งหมด →
          </Link>
        </div>
      </div>

      {/* One line in, one page out. The title is optional on purpose — pressing
          the button with an empty box opens a blank page, which is what
          somebody in a hurry wants. */}
      <form onSubmit={startWriting} className="flex flex-col sm:flex-row gap-2.5">
        <input
          value={firstLine}
          onChange={(e) => setFirstLine(e.target.value)}
          placeholder="จดอะไรสักอย่าง… (พิมพ์ชื่อเรื่องแล้วกด Enter)"
          aria-label="ชื่อโน้ตใหม่"
          className="input-field py-3"
        />
        <button type="submit" disabled={create.isLoading} className="btn-gold py-3 px-6 shrink-0 inline-flex items-center justify-center gap-2">
          <IconPlus width={17} height={17} />
          {create.isLoading ? "กำลังเปิดหน้า…" : "เขียนเลย"}
        </button>
      </form>

      {recentNotes.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-navy-700/45 mb-2">เขียนล่าสุด</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {recentNotes.map((note) => (
              <li key={note.id}>
                <Link
                  to={`/notes?id=${note.id}`}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-navy-900/[0.07] hover:border-gold-500/50 transition-colors"
                >
                  <span aria-hidden className="shrink-0">
                    {note.icon ? (
                      <span className="text-base leading-none">{note.icon}</span>
                    ) : (
                      <IconDocument width={15} height={15} className="text-navy-700/40" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-navy-900 truncate">{note.title || "ไม่มีชื่อ"}</span>
                    {note.excerpt && <span className="block text-xs text-navy-700/50 truncate">{note.excerpt}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
