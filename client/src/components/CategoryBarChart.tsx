import { categoryHues, tint } from "../lib/chartPalette";

interface CategoryCount {
  categoryId: string;
  name: string;
  fileCount: number;
}

/**
 * Ranked bar chart — length encodes magnitude, colour marks which category the
 * bar belongs to (a fixed hue per category id, see lib/chartPalette), and every
 * bar is direct-labeled with its name and count, so no tooltip or legend is
 * needed at this scale.
 */
export default function CategoryBarChart({ categories }: { categories: CategoryCount[] }) {
  const withFiles = categories.filter((c) => c.fileCount > 0);
  const max = Math.max(...withFiles.map((c) => c.fileCount), 1);
  const hues = categoryHues(withFiles.map((c) => c.categoryId));

  if (withFiles.length === 0) {
    return <div className="card text-navy-700/60 py-10 text-center flex-1 flex items-center justify-center">ยังไม่มีไฟล์ในหมวดหมู่ใดเลย</div>;
  }

  return (
    <div className="card p-5 sm:p-6 flex-1 flex flex-col justify-center">
      <div role="img" aria-label="กราฟแท่งแสดงจำนวนไฟล์ในแต่ละหมวดหมู่ เรียงจากมากไปน้อย" className="space-y-3.5">
        {withFiles.map((cat, i) => (
          <div key={cat.categoryId} className="group">
            <div className="flex items-baseline justify-between text-sm mb-1">
              <span className="font-medium text-navy-900 truncate pr-2">{cat.name}</span>
              <span className="text-navy-700/60 tabular-nums shrink-0">{cat.fileCount} ไฟล์</span>
            </div>
            <div className="h-2.5 rounded-full bg-navy-900/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 group-hover:brightness-105"
                style={{
                  width: `${Math.max((cat.fileCount / max) * 100, 4)}%`,
                  backgroundColor: hues[i],
                  backgroundImage: `linear-gradient(90deg, ${hues[i]}, ${tint(hues[i])})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
