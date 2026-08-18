import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { IconDocument, IconEbook, IconFolderOpen, IconPoster, IconSlide, IconSpreadsheet, IconStar, IconUpload, type IconProps } from "../components/icons";
import CategoryBarChart from "../components/CategoryBarChart";
import { FileTypeDonutChart } from "../components/CategoryDonutChart";
import FileCard from "../components/FileCard";
import { setPendingUploadFile } from "../lib/pendingUpload";

const TYPE_CARDS: { key: "ebook" | "document" | "spreadsheet" | "slide" | "poster"; label: string; description: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { key: "ebook", label: "E-book", description: "หนังสือ PDF/EPUB ที่เผยแพร่แล้ว", Icon: IconEbook },
  { key: "document", label: "เอกสาร", description: "เอกสาร Word/ข้อความที่เผยแพร่แล้ว", Icon: IconDocument },
  { key: "spreadsheet", label: "ตารางข้อมูล", description: "ไฟล์ Excel/CSV ที่เผยแพร่แล้ว", Icon: IconSpreadsheet },
  { key: "slide", label: "สไลด์", description: "PDF แนวนอนที่เผยแพร่แล้ว", Icon: IconSlide },
  { key: "poster", label: "โปสเตอร์", description: "โปสเตอร์ที่เผยแพร่แล้ว", Icon: IconPoster },
];

export default function Home() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const dashboard = trpc.library.dashboard.useQuery();
  const recentFiles = trpc.library.files.useQuery({ page: 1, pageSize: 6 });

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(keyword)}`);
  }

  function onUploadButtonDrop(e: React.DragEvent) {
    e.preventDefault();
    setUploadDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setPendingUploadFile(file);
    navigate("/admin/library");
  }

  return (
    <div className="space-y-14 sm:space-y-16">
      <button
        type="button"
        onClick={() => navigate("/admin/library")}
        onDragOver={(e) => {
          e.preventDefault();
          setUploadDragOver(true);
        }}
        onDragLeave={() => setUploadDragOver(false)}
        onDrop={onUploadButtonDrop}
        className={`btn-gold w-full flex items-center justify-center gap-2.5 text-base py-4 rounded-2xl shadow-md transition-shadow ${
          uploadDragOver ? "ring-4 ring-navy-950/20" : ""
        }`}
      >
        <IconUpload width={22} height={22} /> {uploadDragOver ? "วางไฟล์ที่นี่เพื่ออัปโหลด" : "อัปโหลดไฟล์ใหม่ (ลากไฟล์มาวางได้)"}
      </button>

      <section className="relative overflow-hidden bg-navy-950 text-ivory rounded-3xl px-6 py-14 sm:px-14 sm:py-20 -mt-2 bg-radial-gold">
        <div aria-hidden className="absolute inset-0 bg-hero-stars opacity-80" />
        <div aria-hidden className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 text-gold-400/90 text-xs font-medium tracking-[0.2em] uppercase mb-4">
            <span aria-hidden>✦</span> คลังความรู้โหราศาสตร์
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl font-semibold text-ivory mb-4 leading-tight">
            ตำรา เอกสาร และข้อมูล
            <br />
            <span className="text-gold-400">โหราศาสตร์ไทย</span> ครบในที่เดียว
          </h1>
          <p className="text-ivory/70 mb-8 text-base sm:text-lg max-w-xl">
            ค้นหา อ่านบนเว็บ และดาวน์โหลดตำราและเอกสารได้ทันที ไม่ต้องรู้ล่วงหน้าว่าอยู่หมวดใด
          </p>
          <form onSubmit={onSearch} className="flex flex-col sm:flex-row gap-3">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ค้นหาชื่อเรื่อง ผู้เขียน หรือคำสำคัญ..."
              className="flex-1 rounded-xl px-4 py-3.5 text-navy-950 placeholder:text-navy-700/50 focus:outline-none focus:ring-2 focus:ring-gold-400 shadow-lg"
              aria-label="ค้นหาคลังเอกสาร"
            />
            <button type="submit" className="btn-gold text-base py-3.5 px-8">
              ค้นหา
            </button>
          </form>
        </div>
      </section>

      <section>
        <SectionHeading title="ภาพรวมคลัง" />
        {dashboard.isLoading && <SkeletonRow count={4} />}
        {dashboard.isError && <ErrorNote text="โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง" />}
        {dashboard.data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="ไฟล์ทั้งหมดที่เผยแพร่" count={dashboard.data.published} highlight Icon={IconStar} to="/library?all=1" />
            {TYPE_CARDS.map((card) => (
              <StatCard
                key={card.key}
                label={card.label}
                description={card.description}
                count={dashboard.data.typeCounts[card.key]}
                Icon={card.Icon}
                to={`/library?type=${card.key}`}
              />
            ))}
            <StatCard label="ยังไม่ได้จัดหมวด" count={dashboard.data.uncategorized} Icon={IconFolderOpen} to="/library?uncategorized=1" />
          </div>
        )}
      </section>

      {dashboard.data && dashboard.data.categoryCounts.some((c) => c.fileCount > 0) && (
        <section className="grid md:grid-cols-2 gap-4 items-stretch">
          <div className="flex flex-col">
            <SectionHeading title="หมวดหมู่ที่มีไฟล์เยอะที่สุด" />
            <CategoryBarChart categories={dashboard.data.categoryCounts} />
          </div>
          <div className="flex flex-col">
            <SectionHeading title="สัดส่วนไฟล์ตามประเภทเอกสาร" />
            <FileTypeDonutChart typeCounts={dashboard.data.typeCounts} />
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-5">
          <SectionHeading title="หมวดหมู่" noMargin />
          <Link to="/categories" className="text-sm text-navy-700 hover:text-gold-600 font-medium transition-colors">
            ดูทั้งหมด →
          </Link>
        </div>
        {dashboard.data && dashboard.data.categoryCounts.length === 0 && (
          <EmptyNote text="ยังไม่มีหมวดหมู่ในฐานข้อมูล" />
        )}
        {dashboard.data && dashboard.data.categoryCounts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {dashboard.data.categoryCounts.map((cat) => (
              <Link key={cat.categoryId} to={`/library?categoryId=${cat.categoryId}`} className="card-interactive px-4 py-3.5">
                <div className="font-medium text-navy-900">{cat.name}</div>
                <div className="text-sm text-navy-700/55 mt-0.5">{cat.fileCount} ไฟล์</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="ไฟล์ล่าสุด" />
        {recentFiles.data && recentFiles.data.files.length === 0 && <EmptyNote text="ยังไม่มีรายการในฐานข้อมูล" />}
        {recentFiles.data && recentFiles.data.files.length > 0 && (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {recentFiles.data.files.map((file) => (
              <FileCard key={file.id} file={file} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ title, noMargin }: { title: string; noMargin?: boolean }) {
  return (
    <h2 className={`font-serif text-xl sm:text-2xl font-semibold text-navy-900 ${noMargin ? "" : "mb-5"}`}>{title}</h2>
  );
}

function StatCard({
  label,
  count,
  description,
  highlight,
  Icon,
  to,
}: {
  label: string;
  count: number;
  description?: string;
  highlight?: boolean;
  Icon: (p: IconProps) => JSX.Element;
  to: string;
}) {
  return (
    <Link
      to={to}
      className={`card-interactive block p-4 sm:p-5 ${highlight ? "border-gold-500/50 bg-gradient-to-br from-white to-gold-400/5" : ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className={`text-2xl sm:text-3xl font-serif font-semibold ${highlight ? "text-gold-600" : "text-navy-950"}`}>{count}</div>
        <Icon width={20} height={20} className={highlight ? "text-gold-500" : "text-navy-900/30"} />
      </div>
      <div className="text-sm font-medium text-navy-900">{label}</div>
      {description && <div className="text-xs text-navy-700/55 mt-1">{description}</div>}
    </Link>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div className="card text-navy-700/60 py-10 text-center">{text}</div>;
}

function ErrorNote({ text }: { text: string }) {
  return <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{text}</div>;
}

function SkeletonRow({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 h-24 animate-pulse bg-navy-900/[0.03]" />
      ))}
    </div>
  );
}
