import { CHART_HUES, FILE_TYPE_HUES, categoryHues } from "../lib/chartPalette";

interface Slice {
  id: string;
  label: string;
  count: number;
}

const TYPE_LABELS: Record<string, string> = {
  ebook: "E-book (PDF/EPUB)",
  document: "เอกสาร (Word/ข้อความ)",
  spreadsheet: "ตารางข้อมูล (Excel/CSV)",
  program: "โปรแกรม Excel",
  slide: "สไลด์ (PDF แนวนอน)",
  poster: "โปสเตอร์",
  other: "อื่นๆ",
};

// Slices carry identity, not magnitude — the share is already in the labels —
// so each one takes its own hue from the shared categorical palette rather than
// a step of a single gold ramp (see lib/chartPalette for the palette and the
// separation figures). Every slice is direct-labeled in the legend, so identity
// never rests on telling two colours apart.

// Degrees of white card surface between neighbouring slices, so two of them
// never bleed into one shape.
const SLICE_GAP_DEG = 1.5;

function Donut({ slices, centerLabel, colorFor }: { slices: Slice[]; centerLabel: string; colorFor: (id: string, i: number) => string }) {
  const withCounts = slices.filter((s) => s.count > 0);
  const total = withCounts.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return <div className="card text-navy-700/60 py-10 text-center flex-1 flex items-center justify-center">ยังไม่มีไฟล์ในหมวดนี้เลย</div>;
  }

  let cursor = 0;
  const segments = withCounts.map((s, i) => {
    const startDeg = (cursor / total) * 360;
    cursor += s.count;
    const endDeg = (cursor / total) * 360;
    return { ...s, color: colorFor(s.id, i), startDeg, endDeg };
  });

  const gap = segments.length > 1 ? SLICE_GAP_DEG : 0;
  const gradient = segments
    .flatMap((s) => [`#fff ${s.startDeg}deg ${s.startDeg + gap}deg`, `${s.color} ${s.startDeg + gap}deg ${s.endDeg}deg`])
    .join(", ");

  return (
    <div className="card p-5 sm:p-6 flex-1 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8">
      <div
        role="img"
        aria-label={`กราฟวงกลมแสดงสัดส่วน ${centerLabel}`}
        className="w-36 h-36 rounded-full shrink-0 relative"
        style={{ background: `conic-gradient(${gradient})` }}
      >
        <div className="absolute inset-[18%] bg-white rounded-full flex flex-col items-center justify-center">
          <div className="text-xl font-serif font-semibold text-navy-950">{total}</div>
          <div className="text-[11px] text-navy-700/50">{centerLabel}</div>
        </div>
      </div>
      <ul className="space-y-2.5 text-sm w-full sm:w-auto sm:min-w-[220px] sm:max-w-[260px]">
        {segments.map((s) => (
          <li key={s.id} className="flex items-start gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: s.color }} />
            <span className="text-navy-900 flex-1 leading-snug">{s.label}</span>
            <span className="text-navy-700/60 tabular-nums shrink-0">{s.count} ({Math.round((s.count / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategoryDonutChart({ categories }: { categories: { categoryId: string; name: string; fileCount: number }[] }) {
  const slices = categories.map((c) => ({ id: c.categoryId, label: c.name, count: c.fileCount }));
  const hues = categoryHues(slices.filter((s) => s.count > 0).map((s) => s.id));
  return <Donut slices={slices} centerLabel="ไฟล์ทั้งหมด" colorFor={(_id, i) => hues[i]} />;
}

export function FileTypeDonutChart({ typeCounts }: { typeCounts: Record<string, number> }) {
  const slices = Object.entries(typeCounts).map(([key, count]) => ({
    id: key,
    label: TYPE_LABELS[key] ?? key,
    count,
  }));
  return <Donut slices={slices} centerLabel="ไฟล์ตามประเภท" colorFor={(id, i) => FILE_TYPE_HUES[id] ?? CHART_HUES[i % CHART_HUES.length]} />;
}
