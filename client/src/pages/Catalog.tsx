import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import FileCollection from "../components/FileCollection";
import { IconCategory, IconDocument, IconEbook, IconPoster, IconProgram, IconSlide, IconSpreadsheet, type IconProps } from "../components/icons";

type FileType = "ebook" | "document" | "spreadsheet" | "program" | "slide" | "poster";

const TYPE_CHIPS: { key: FileType | "all"; label: string; Icon?: (p: IconProps) => JSX.Element }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "ebook", label: "E-book", Icon: IconEbook },
  { key: "document", label: "เอกสาร", Icon: IconDocument },
  { key: "spreadsheet", label: "ตารางข้อมูล", Icon: IconSpreadsheet },
  { key: "program", label: "โปรแกรม Excel", Icon: IconProgram },
  { key: "slide", label: "สไลด์", Icon: IconSlide },
  { key: "poster", label: "โปสเตอร์", Icon: IconPoster },
];

export default function Catalog({ forcedType }: { forcedType?: FileType } = {}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const categoryId = params.get("categoryId") ?? undefined;
  const typeParam = forcedType ?? (params.get("type") as FileType | null) ?? undefined;
  const uncategorized = params.get("uncategorized") === "1";
  const showAll = params.get("all") === "1";
  const [page, setPage] = useState(1);

  const categories = trpc.library.categories.useQuery();
  const category = categories.data?.find((c) => c.id === categoryId);

  // Any of these means "flat list across categories", not folder browsing.
  const isFlatBrowse = !categoryId && (!!typeParam || uncategorized || showAll);

  const query = trpc.library.files.useQuery(
    { categoryId, uncategorized, type: typeParam, page, pageSize: 20 },
    { enabled: !!categoryId || isFlatBrowse },
  );

  function setType(type: FileType | "all") {
    const next = new URLSearchParams(params);
    if (type === "all") next.delete("type");
    else next.set("type", type);
    navigate(`/library?${next.toString()}`);
    setPage(1);
  }

  const flatBrowseTitle = uncategorized
    ? "ยังไม่ได้จัดหมวด"
    : typeParam
      ? TYPE_CHIPS.find((c) => c.key === typeParam)?.label
      : "ไฟล์ทั้งหมดที่เผยแพร่";

  // Reached via a stat tile / dedicated route (e.g. /ebooks) instead of a
  // category -> skip folder browsing, show every matching file across all categories.
  if (isFlatBrowse) {
    return (
      <div className="space-y-6">
        {!forcedType && (
          <div className="text-sm text-navy-700/50">
            <Link to="/library" className="hover:text-gold-700 hover:underline">
              คลังทั้งหมด
            </Link>{" "}
            / {flatBrowseTitle}
          </div>
        )}
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">{flatBrowseTitle}</h1>
        {query.isLoading && <div className="text-navy-700/60">กำลังโหลด...</div>}
        {query.data && query.data.files.length === 0 && (
          <div className="card text-navy-700/60 py-12 text-center">ยังไม่มีไฟล์ในกลุ่มนี้</div>
        )}
        {query.data && query.data.files.length > 0 && (
          <FileCollection files={query.data.files} />
        )}
        {query.data && query.data.total > query.data.pageSize && (
          <div className="flex justify-center gap-2 pt-4">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-outline disabled:opacity-40">
              ก่อนหน้า
            </button>
            <button
              disabled={page * query.data.pageSize >= query.data.total}
              onClick={() => setPage((p) => p + 1)}
              className="btn-outline disabled:opacity-40"
            >
              ถัดไป
            </button>
          </div>
        )}
      </div>
    );
  }

  // No category chosen yet -> browse folders instead of a flat file list.
  if (!categoryId) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">คลังทั้งหมด</h1>
        <p className="text-navy-700/60 text-sm">เลือกหมวดหมู่เพื่อดูไฟล์ในหมวดนั้น</p>
        {categories.isLoading && <div className="text-navy-700/60">กำลังโหลด...</div>}
        {categories.data && categories.data.length === 0 && (
          <div className="card text-navy-700/60 py-12 text-center">ยังไม่มีหมวดหมู่ในฐานข้อมูล</div>
        )}
        {categories.data && categories.data.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {categories.data.map((cat) => (
              <Link key={cat.id} to={`/library?categoryId=${cat.id}`} className="card-interactive p-4 flex items-start gap-3">
                <IconCategory width={20} height={20} className="text-gold-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-navy-900">{cat.name}</div>
                  {cat.description && <div className="text-sm text-navy-700/55 mt-0.5">{cat.description}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-navy-700/50">
        <Link to="/library" className="hover:text-gold-700 hover:underline">
          คลังทั้งหมด
        </Link>{" "}
        / {category?.name ?? "…"}
      </div>
      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">{category ? category.name : "หมวดหมู่"}</h1>

      <div className="flex flex-wrap gap-2">
        {TYPE_CHIPS.map((chip) => {
          const active = (typeParam ?? "all") === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setType(chip.key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active ? "bg-navy-950 text-gold-400 border-navy-950" : "border-navy-900/15 text-navy-700 hover:border-gold-500"
              }`}
            >
              {chip.Icon && <chip.Icon width={14} height={14} />}
              {chip.label}
            </button>
          );
        })}
      </div>

      {query.isLoading && <div className="text-navy-700/60">กำลังโหลด...</div>}
      {query.isError && <div className="text-red-700">โหลดรายการไม่สำเร็จ</div>}
      {query.data && query.data.files.length === 0 && (
        <div className="card text-navy-700/60 py-12 text-center">ยังไม่มีไฟล์ประเภทนี้ในหมวดนี้</div>
      )}
      {query.data && query.data.files.length > 0 && (
        <FileCollection files={query.data.files} />
      )}
      {query.data && query.data.total > query.data.pageSize && (
        <div className="flex justify-center gap-2 pt-4">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-outline disabled:opacity-40">
            ก่อนหน้า
          </button>
          <button
            disabled={page * query.data.pageSize >= query.data.total}
            onClick={() => setPage((p) => p + 1)}
            className="btn-outline disabled:opacity-40"
          >
            ถัดไป
          </button>
        </div>
      )}
    </div>
  );
}
