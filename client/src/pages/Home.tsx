import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { IconDocument, IconEbook, IconPoster, IconSlide, IconSpreadsheet, IconStar, IconUpload, type IconProps } from "../components/icons";
import CategoryBarChart from "../components/CategoryBarChart";
import { FileTypeDonutChart } from "../components/CategoryDonutChart";
import FileCollection from "../components/FileCollection";
import { BOOK_GRID_CLASS } from "../components/FileCard";
import { setPendingUploadFile } from "../lib/pendingUpload";
import { useStaleCache, useSlowLoadNotice } from "../lib/staleCache";

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
  const dashboardQuery = trpc.library.dashboard.useQuery();
  const recentFilesQuery = trpc.library.files.useQuery({ page: 1, pageSize: 6 });
  // Last visit's payload stands in until the network answers, so a returning
  // reader sees the real library straight away even while the free-tier API is
  // still waking up. See lib/staleCache.ts.
  const dashboard = useStaleCache("home:dashboard", dashboardQuery.data);
  const recentFiles = useStaleCache("home:recent-files", recentFilesQuery.data);
  // "paused" is React Query's offline state: the request never went out, so it
  // reports neither an error nor an in-flight fetch. Left unhandled the page
  // just sits there showing nothing at all, which is the exact failure this
  // whole change is meant to remove — so it counts as a failed load here.
  const isOffline = dashboardQuery.fetchStatus === "paused";
  const loadFailed = dashboardQuery.isError || isOffline;
  const servingCache = !dashboardQuery.data && !!dashboard;
  const showWakingNotice = useSlowLoadNotice(!dashboard && !recentFiles && !loadFailed);
  const refreshingFromCache = servingCache && dashboardQuery.isFetching;

  function retryLoad() {
    void dashboardQuery.refetch();
    void recentFilesQuery.refetch();
  }
  const cacheAfterFailure = servingCache && loadFailed;

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
      {showWakingNotice && <WakingNotice />}
      {refreshingFromCache && <RefreshingNotice />}
      {cacheAfterFailure && <StaleDataNotice onRetry={retryLoad} retrying={dashboardQuery.isFetching} />}
      <section className="relative overflow-hidden bg-navy-950 text-ivory rounded-3xl px-6 py-14 sm:px-14 sm:py-20 bg-radial-gold">
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
          {/* Upload sits under the search box rather than above the hero: it is
              the second thing a reader reaches for, and up there it pushed the
              search — the page's actual job — below the fold on a phone. It is
              outlined so the gold search button stays the loudest thing here,
              and it is still the drop target for a dragged file. */}
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => navigate("/admin/library")}
              onDragOver={(e) => {
                e.preventDefault();
                setUploadDragOver(true);
              }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={onUploadButtonDrop}
              className={`inline-flex items-center justify-center gap-2.5 rounded-xl border px-6 py-3 text-base font-medium transition-colors ${
                uploadDragOver
                  ? "border-gold-400 bg-gold-400/20 text-gold-400 ring-4 ring-gold-400/20"
                  : "border-gold-400/50 text-gold-400 hover:bg-gold-400/10 hover:border-gold-400"
              }`}
            >
              <IconUpload width={20} height={20} className="shrink-0" />
              {/* The drag hint is desktop-only advice — there is no dragging a
                  file on a phone, and spelling it out there only wrapped the
                  label onto a second line. */}
              <span className="whitespace-nowrap">
                {uploadDragOver ? (
                  "วางไฟล์ที่นี่เพื่ออัปโหลด"
                ) : (
                  <>
                    อัปโหลดไฟล์ใหม่<span className="hidden sm:inline"> (ลากไฟล์มาวางได้)</span>
                  </>
                )}
              </span>
            </button>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading title="ภาพรวมคลัง" />
        {/* Failure wins over the skeleton: showing both at once told the reader
            "still loading" and "gave up" in the same breath. */}
        {!dashboard && loadFailed && (
          <ErrorNote text="โหลดข้อมูลไม่สำเร็จ" onRetry={retryLoad} retrying={dashboardQuery.isFetching} />
        )}
        {!dashboard && !loadFailed && dashboardQuery.isLoading && <SkeletonRow count={4} />}
        {dashboard && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="ไฟล์ทั้งหมดที่เผยแพร่" count={dashboard.published} highlight Icon={IconStar} to="/library?all=1" />
            {TYPE_CARDS.map((card) => (
              <StatCard
                key={card.key}
                label={card.label}
                description={card.description}
                count={dashboard.typeCounts[card.key]}
                Icon={card.Icon}
                to={`/library?type=${card.key}`}
              />
            ))}
          </div>
        )}
      </section>

      {dashboard && dashboard.categoryCounts.some((c) => c.fileCount > 0) && (
        <section className="grid md:grid-cols-2 gap-4 items-stretch">
          <div className="flex flex-col">
            <SectionHeading title="หมวดหมู่ที่มีไฟล์เยอะที่สุด" />
            <CategoryBarChart categories={dashboard.categoryCounts} />
          </div>
          <div className="flex flex-col">
            <SectionHeading title="สัดส่วนไฟล์ตามประเภทเอกสาร" />
            <FileTypeDonutChart typeCounts={dashboard.typeCounts} />
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
        {dashboard && dashboard.categoryCounts.length === 0 && (
          <EmptyNote text="ยังไม่มีหมวดหมู่ในฐานข้อมูล" />
        )}
        {dashboard && dashboard.categoryCounts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {dashboard.categoryCounts.map((cat) => (
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
        {!recentFiles && !loadFailed && recentFilesQuery.isLoading && <SkeletonCards count={3} />}
        {recentFiles && recentFiles.files.length === 0 && <EmptyNote text="ยังไม่มีรายการในฐานข้อมูล" />}
        {recentFiles && recentFiles.files.length > 0 && (
          <FileCollection files={recentFiles.files} showToggle={false} />
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

function ErrorNote({ text, onRetry, retrying }: { text: string; onRetry?: () => void; retrying?: boolean }) {
  return (
    <div className="text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span>{text}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="text-sm font-medium underline underline-offset-2 hover:no-underline disabled:opacity-60"
        >
          {retrying ? "กำลังลองใหม่…" : "ลองใหม่อีกครั้ง"}
        </button>
      )}
    </div>
  );
}

/**
 * Shown only once a load has visibly dragged on. The API sleeps on its free
 * plan, and a silent 30-second wait behind blank skeletons reads as a broken
 * site — saying so outright is the difference between "slow" and "dead".
 */
function WakingNotice() {
  return (
    <div className="card flex items-center gap-3 px-4 py-3.5 border-gold-500/40 bg-gold-400/5">
      <span aria-hidden className="w-4 h-4 rounded-full border-2 border-gold-500/30 border-t-gold-600 animate-spin shrink-0" />
      <div className="text-sm text-navy-900">
        <span className="font-medium">กำลังปลุกเซิร์ฟเวอร์…</span>{" "}
        <span className="text-navy-700/70">
          เซิร์ฟเวอร์พักตัวเมื่อไม่มีคนใช้งาน การเข้าครั้งแรกอาจรอ ~30 วินาที หลังจากนี้จะเร็วตามปกติ
        </span>
      </div>
    </div>
  );
}

function RefreshingNotice() {
  return (
    <div className="flex items-center gap-2 text-xs text-navy-700/60">
      <span aria-hidden className="w-3 h-3 rounded-full border-2 border-navy-900/15 border-t-navy-900/50 animate-spin shrink-0" />
      กำลังอัปเดตข้อมูลล่าสุด… (ตัวเลขด้านล่างเป็นข้อมูลจากครั้งก่อน)
    </div>
  );
}

/**
 * The cache stops the page looking broken, but it must not quietly pass old
 * numbers off as current ones once the refresh has actually failed.
 */
function StaleDataNotice({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="card px-4 py-3.5 border-navy-900/10 bg-navy-900/[0.03] text-sm text-navy-900">
      <span className="font-medium">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</span>{" "}
      <span className="text-navy-700/70">ข้อมูลด้านล่างเป็นข้อมูลที่บันทึกไว้จากการเข้าครั้งก่อน</span>{" "}
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-60"
      >
        {retrying ? "กำลังลองใหม่…" : "ลองใหม่อีกครั้ง"}
      </button>
    </div>
  );
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <div className={BOOK_GRID_CLASS}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-[3/4] rounded-lg animate-pulse bg-navy-900/[0.06]" />
      ))}
    </div>
  );
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
