import { useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import FileCard from "../components/FileCard";

export default function AuthorWorks() {
  const { name } = useParams<{ name: string }>();
  const authorName = decodeURIComponent(name ?? "");
  const query = trpc.library.files.useQuery({ author: authorName, page: 1, pageSize: 50 }, { enabled: !!authorName });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-navy-700/50 mb-1">ผลงานทั้งหมดโดย</div>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">{authorName}</h1>
      </div>

      {query.isLoading && <div className="text-navy-700/60">กำลังโหลด...</div>}
      {query.isError && <div className="text-red-700">โหลดรายการไม่สำเร็จ</div>}
      {query.data && query.data.files.length === 0 && (
        <div className="card text-navy-700/60 py-12 text-center">ไม่พบผลงานที่เผยแพร่แล้วของผู้เขียนคนนี้</div>
      )}
      {query.data && query.data.files.length > 0 && (
        <>
          <div className="text-sm text-navy-700/60">พบ {query.data.total} ผลงาน</div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {query.data.files.map((file) => (
              <FileCard key={file.id} file={file} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
