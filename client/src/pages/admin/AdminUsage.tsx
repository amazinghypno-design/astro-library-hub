import AdminGate from "../../components/AdminGate";
import { trpc } from "../../lib/trpc";
import { explainAdminError } from "../../lib/explainAdminError";
import { IconDocument, IconEbook, IconPoster, IconProgram, IconSlide, IconSpreadsheet, IconFolderOpen } from "../../components/icons";

/**
 * How much of the free plan the library has eaten, and where it went.
 *
 * The live numbers come from the database — every file's size is already a
 * column, so the whole page is one cheap query and can refresh on a timer.
 * The bucket scan behind the button is the expensive half: it lists the object
 * store for real, which is the only way to see bytes no row accounts for, and
 * costs a paid operation each time.
 */

/** How often the live figures refresh. Half a minute: bytes do not move faster than an upload finishes. */
const REFRESH_MS = 30_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

const TYPE_LABELS: Record<string, { label: string; Icon: typeof IconEbook }> = {
  ebook: { label: "E-book", Icon: IconEbook },
  document: { label: "เอกสาร", Icon: IconDocument },
  spreadsheet: { label: "ตารางข้อมูล", Icon: IconSpreadsheet },
  program: { label: "โปรแกรม Excel", Icon: IconProgram },
  slide: { label: "สไลด์", Icon: IconSlide },
  poster: { label: "โปสเตอร์", Icon: IconPoster },
  other: { label: "อื่นๆ", Icon: IconFolderOpen },
};

/**
 * A bar that stays honest at both ends: a sliver of use is still visible, and
 * a plan nearly full says so in colour before anyone reads the number.
 */
function QuotaBar({ used, quota }: { used: number; quota: number }) {
  const ratio = quota > 0 ? used / quota : 0;
  const percent = Math.min(100, ratio * 100);
  const tone = ratio >= 0.9 ? "bg-red-500" : ratio >= 0.7 ? "bg-gold-500" : "bg-gold-400";
  return (
    <div className="space-y-1.5">
      <div className="h-2.5 rounded-full bg-navy-900/[0.08] overflow-hidden">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${Math.max(percent, 0.6)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-navy-700/60 tabular-nums">
        <span>ใช้ไป {(ratio * 100).toFixed(ratio < 0.1 ? 2 : 1)}%</span>
        <span>เหลือ {formatBytes(Math.max(0, quota - used))}</span>
      </div>
    </div>
  );
}

function AdminUsageInner() {
  const summary = trpc.usage.summary.useQuery(undefined, {
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });
  const scan = trpc.usage.bucketScan.useMutation();

  if (summary.isLoading) return <div className="py-12 text-center text-navy-700/60">กำลังคำนวณ...</div>;
  if (summary.isError || !summary.data) {
    return <div className="py-12 text-center text-red-700">{explainAdminError(summary.error ?? { message: "" })}</div>;
  }

  const data = summary.data;
  const scanned = scan.data;
  // The rows only know about the originals. Whatever the bucket holds beyond
  // that is renditions plus anything orphaned — worth naming rather than
  // quietly folding into one total.
  const unaccounted = scanned ? scanned.totalBytes - data.storage.accountedBytes : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">การใช้พื้นที่</h1>
          <p className="text-navy-700/60 text-sm mt-1">
            อัปเดตเองทุก 30 วินาที · ล่าสุด{" "}
            <span className="tabular-nums">{new Date(data.measuredAt).toLocaleTimeString("th-TH")}</span>
            {summary.isFetching && <span className="text-gold-600 ml-2">กำลังอัปเดต...</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => summary.refetch()}
          disabled={summary.isFetching}
          className="btn-outline text-sm px-4 py-1.5 disabled:opacity-40"
        >
          อัปเดตเดี๋ยวนี้
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-lg font-semibold text-navy-900">ที่เก็บไฟล์</h2>
            <span className="text-xs text-navy-700/50">Cloudflare R2</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-3xl font-semibold text-navy-900 tabular-nums">
              {formatBytes(data.storage.accountedBytes)}
            </span>
            <span className="text-navy-700/50 text-sm tabular-nums">/ {formatBytes(data.storage.quotaBytes)}</span>
          </div>
          <QuotaBar used={data.storage.accountedBytes} quota={data.storage.quotaBytes} />
          <p className="text-xs text-navy-700/55">
            รวมขนาดไฟล์ต้นฉบับ {data.files.count} ไฟล์ · ยังไม่รวมไฟล์ย่อสำหรับอ่านในเว็บอีก {data.files.withRendition} ไฟล์
          </p>
        </section>

        <section className="card p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-lg font-semibold text-navy-900">ฐานข้อมูล</h2>
            <span className="text-xs text-navy-700/50">Supabase Postgres</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-3xl font-semibold text-navy-900 tabular-nums">
              {formatBytes(data.database.totalBytes)}
            </span>
            <span className="text-navy-700/50 text-sm tabular-nums">/ {formatBytes(data.database.quotaBytes)}</span>
          </div>
          <QuotaBar used={data.database.totalBytes} quota={data.database.quotaBytes} />
          <p className="text-xs text-navy-700/55">
            ในนั้นเป็นข้อความที่ดึงจากไฟล์ {formatBytes(data.database.extractedTextBytes)} จาก {data.files.withText} ไฟล์ — นี่คือส่วนที่ OCR
            ทำให้โตขึ้น
          </p>
        </section>
      </div>

      <section className="card p-5 space-y-4">
        <h2 className="font-serif text-lg font-semibold text-navy-900">แยกตามประเภทไฟล์</h2>
        <div className="space-y-2.5">
          {data.byType.map((row) => {
            const meta = TYPE_LABELS[row.documentType] ?? TYPE_LABELS.other;
            const share = data.storage.accountedBytes > 0 ? (row.bytes / data.storage.accountedBytes) * 100 : 0;
            return (
              <div key={row.documentType} className="flex items-center gap-3">
                <meta.Icon width={16} height={16} className="text-gold-600 shrink-0" />
                <span className="w-28 shrink-0 text-sm text-navy-800">{meta.label}</span>
                <div className="flex-1 h-2 rounded-full bg-navy-900/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-gold-400/70" style={{ width: `${Math.max(share, 0.5)}%` }} />
                </div>
                <span className="w-20 text-right text-sm text-navy-700/70 tabular-nums">{formatBytes(row.bytes)}</span>
                <span className="w-14 text-right text-xs text-navy-700/45 tabular-nums">{row.fileCount} ไฟล์</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-serif text-lg font-semibold text-navy-900">ไฟล์ที่กินพื้นที่มากที่สุด</h2>
        <div className="divide-y divide-navy-900/[0.06]">
          {data.largest.map((file) => (
            <div key={file.id} className="flex items-center gap-3 py-2">
              <span className="flex-1 min-w-0 truncate text-sm text-navy-800">{file.title}</span>
              <span className="text-sm text-navy-700/70 tabular-nums shrink-0">{formatBytes(file.bytes)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-navy-900">ตรวจที่เก็บของจริง</h2>
            <p className="text-navy-700/60 text-sm mt-1 max-w-xl">
              ตัวเลขด้านบนมาจากฐานข้อมูล ซึ่งรู้จักเฉพาะไฟล์ที่มีรายการอยู่ การตรวจนี้ไปนับของในที่เก็บจริงทุกชิ้น
              จึงเห็นไฟล์ที่ไม่มีอะไรชี้ถึงแล้วด้วย — มีค่าใช้จ่ายต่อครั้ง เลยไม่ได้ตรวจอัตโนมัติ
            </p>
          </div>
          <button
            type="button"
            onClick={() => scan.mutate({})}
            disabled={scan.isLoading}
            className="btn-gold text-sm px-4 py-2 disabled:opacity-50 shrink-0"
          >
            {scan.isLoading ? "กำลังตรวจ..." : "ตรวจเดี๋ยวนี้"}
          </button>
        </div>

        {scan.isError && <div className="text-sm text-red-700">{explainAdminError(scan.error)}</div>}

        {scanned && (
          <div className="space-y-4 pt-1">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-navy-900/[0.08] p-3.5">
                <div className="text-xs text-navy-700/55">ของในที่เก็บจริง</div>
                <div className="font-serif text-xl font-semibold text-navy-900 tabular-nums mt-0.5">
                  {formatBytes(scanned.totalBytes)}
                </div>
                <div className="text-xs text-navy-700/45 tabular-nums">{scanned.objectCount} ชิ้น</div>
              </div>
              <div className="rounded-xl border border-navy-900/[0.08] p-3.5">
                <div className="text-xs text-navy-700/55">ส่วนที่เกินจากรายการไฟล์</div>
                <div className="font-serif text-xl font-semibold text-navy-900 tabular-nums mt-0.5">
                  {unaccounted != null ? formatBytes(Math.max(0, unaccounted)) : "—"}
                </div>
                <div className="text-xs text-navy-700/45">ไฟล์ย่อสำหรับอ่าน + ของที่ตกค้าง</div>
              </div>
              <div
                className={`rounded-xl border p-3.5 ${
                  scanned.orphanCount > 0 ? "border-red-300 bg-red-50/60" : "border-navy-900/[0.08]"
                }`}
              >
                <div className="text-xs text-navy-700/55">ของตกค้าง ไม่มีอะไรชี้ถึง</div>
                <div
                  className={`font-serif text-xl font-semibold tabular-nums mt-0.5 ${
                    scanned.orphanCount > 0 ? "text-red-700" : "text-navy-900"
                  }`}
                >
                  {formatBytes(scanned.orphanBytes)}
                </div>
                <div className="text-xs text-navy-700/45 tabular-nums">{scanned.orphanCount} ชิ้น</div>
              </div>
            </div>

            {scanned.orphanCount > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 space-y-2">
                <p className="text-sm text-navy-800">
                  ของพวกนี้ไม่มีรายการไฟล์ไหนชี้ถึงแล้ว เว็บมองไม่เห็น เปิดไม่ได้ แต่ยังเสียค่าเก็บอยู่ทุกเดือน
                  ลบทิ้งได้จากเครื่องผู้ดูแลด้วยคำสั่ง
                </p>
                <code className="block text-xs bg-white/70 rounded-lg px-3 py-2 text-navy-800 overflow-x-auto">
                  cd server &amp;&amp; npx tsx scripts/findOrphanedObjects.ts --delete
                </code>
                <div className="divide-y divide-red-200/70 pt-1">
                  {scanned.orphans.map((orphan) => (
                    <div key={orphan.key} className="flex items-center gap-3 py-1.5">
                      <span className="flex-1 min-w-0 truncate text-xs font-mono text-navy-700/70">{orphan.key}</span>
                      <span className="text-sm text-navy-800 tabular-nums shrink-0">{formatBytes(orphan.bytes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-navy-700/45 tabular-nums">
              ตรวจเมื่อ {new Date(scanned.scannedAt).toLocaleTimeString("th-TH")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export default function AdminUsage() {
  return (
    <AdminGate>
      <AdminUsageInner />
    </AdminGate>
  );
}
