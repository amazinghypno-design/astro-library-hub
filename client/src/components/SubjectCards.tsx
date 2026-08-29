import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";

/**
 * The table of contents of the whole site: one card per หมวดใหญ่.
 *
 * A subject is a body of knowledge, not a folder — โหราศาสตร์ is one,
 * สั่งจิตใต้สำนึก is the next, and the owner intends many more. Each card is
 * the door into that subject's own world: its วิชา, its books, its pages and
 * its skills, which never mix with another subject's.
 *
 * The counts are on the card because an empty subject should look empty. A
 * card that says "0 ตำรา · 0 โน้ต" is an invitation to fill it; one that hides
 * that is a card you have to click to learn anything from. Pages and skills
 * are the owner's own, so they only appear for a session — a visitor sees the
 * library counts alone.
 */
export default function SubjectCards({ compact = false }: { compact?: boolean }) {
  const subjects = trpc.subjects.list.useQuery();

  if (subjects.isLoading) {
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="card p-6 h-36 animate-pulse bg-navy-900/[0.03]" />
        ))}
      </div>
    );
  }

  if (!subjects.data || subjects.data.length === 0) return null;

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {subjects.data.map((subject) => (
        <Link
          key={subject.id}
          to={`/subject/${subject.slug}`}
          className="card-interactive p-5 sm:p-6 flex gap-4 items-start group"
        >
          <span
            aria-hidden
            className="shrink-0 w-12 h-12 rounded-2xl bg-gold-400/15 border border-gold-500/25 grid place-items-center text-2xl"
          >
            {subject.icon ?? "✦"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-lg sm:text-xl font-semibold text-navy-900 group-hover:text-gold-600 transition-colors">
              {subject.name}
            </span>
            {!compact && subject.description && (
              <span className="block text-sm text-navy-700/70 mt-1 line-clamp-2">{subject.description}</span>
            )}
            <span className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-xs text-navy-700/60">
              <span>
                <b className="text-navy-900 font-semibold">{subject.fileCount}</b> ตำรา
              </span>
              <span>
                <b className="text-navy-900 font-semibold">{subject.categoryCount}</b> วิชา
              </span>
              {subject.noteCount > 0 && (
                <span>
                  <b className="text-navy-900 font-semibold">{subject.noteCount}</b> โน้ต
                </span>
              )}
              {subject.skillCount > 0 && (
                <span>
                  <b className="text-navy-900 font-semibold">{subject.skillCount}</b> สกิล
                </span>
              )}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
