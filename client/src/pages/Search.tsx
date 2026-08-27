import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { IconSearch } from "../components/icons";
import FileCollection from "../components/FileCollection";
import VoiceSearchButton from "../components/VoiceSearchButton";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [input, setInput] = useState(q);
  const [page, setPage] = useState(1);

  const query = trpc.library.files.useQuery({ keyword: q || undefined, page, pageSize: 20 });

  const resultSummary = useMemo(() => {
    if (!query.data) return null;
    return `พบ ${query.data.total} รายการ`;
  }, [query.data]);

  function runSearch(keyword: string) {
    setPage(1);
    setParams(keyword ? { q: keyword } : {});
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(input);
  }

  // A spoken phrase searches on its own: the reader has already said what they
  // want, and asking them to then reach for a button undoes the point of it.
  function onSpoken(text: string) {
    setInput(text);
    runSearch(text);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">ค้นหา</h1>
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ค้นหาชื่อเรื่อง ผู้เขียน หรือคำสำคัญ..."
            className="input-field pr-12"
          />
          <VoiceSearchButton onInterim={setInput} onFinal={onSpoken} className="right-1.5" />
        </div>
        <button type="submit" className="btn-primary inline-flex items-center gap-2 shrink-0">
          <IconSearch width={18} height={18} /> <span className="hidden sm:inline">ค้นหา</span>
        </button>
      </form>

      {query.isLoading && <div className="text-navy-700/60">กำลังค้นหา...</div>}
      {query.isError && <div className="text-red-700">ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง</div>}
      {query.data && (
        <>
          <div className="text-sm text-navy-700/60">{resultSummary}</div>
          {query.data.files.length === 0 && <div className="card text-navy-700/60 py-12 text-center">ไม่พบรายการที่ตรงกับคำค้นหา</div>}
          <FileCollection files={query.data.files} />
          {query.data.total > query.data.pageSize && (
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
        </>
      )}
    </div>
  );
}
