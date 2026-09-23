import { useState } from "react";
import { trpc } from "../lib/trpc";

/**
 * A lending desk for one file: make a private link, see the ones already out
 * there, and close any of them.
 *
 * The options run from a week to forever because the two things people
 * actually want are opposite ends of that range — "look at this before
 * Friday" and "this is yours to keep". A year is the default: long enough
 * that a reader never comes back to a dead link mid-book, short enough that a
 * link handed to the wrong person does not outlive the reason it was made.
 */
const EXPIRY_OPTIONS: { label: string; days?: number }[] = [
  { label: "7 วัน", days: 7 },
  { label: "30 วัน", days: 30 },
  { label: "90 วัน", days: 90 },
  { label: "1 ปี", days: 365 },
  { label: "3 ปี", days: 365 * 3 },
  { label: "ตลอดชีพ (ไม่หมดอายุ)" },
];

const DEFAULT_EXPIRY_DAYS = 365;

interface ShareLink {
  id: string;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

type ShareLinkStatus = "valid" | "expired" | "revoked";

function statusOf(link: ShareLink): ShareLinkStatus {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return "expired";
  return "valid";
}

const STATUS_LABEL: Record<ShareLinkStatus, string> = { valid: "ใช้งานได้", expired: "หมดอายุแล้ว", revoked: "ปิดแล้ว" };
const STATUS_COLOR: Record<ShareLinkStatus, string> = {
  valid: "text-emerald-700 bg-emerald-50",
  expired: "text-navy-700/60 bg-navy-900/5",
  revoked: "text-red-700 bg-red-50",
};

/** The link as the reader will receive it — same origin as the page they are on. */
function urlFor(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

/**
 * "ตลอดชีพ", or the date plus how long is left — a date alone does not answer
 * the question people are actually asking, which is whether to send a new one.
 */
function expiryLabel(link: ShareLink): string {
  if (!link.expiresAt) return "ตลอดชีพ · ไม่มีวันหมดอายุ";
  const date = new Date(link.expiresAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
  const daysLeft = Math.ceil((new Date(link.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0) return `หมดอายุแล้วเมื่อ ${date}`;
  if (daysLeft <= 60) return `หมดอายุ ${date} · เหลืออีก ${daysLeft} วัน`;
  const monthsLeft = Math.round(daysLeft / 30);
  if (monthsLeft < 12) return `หมดอายุ ${date} · เหลืออีกราว ${monthsLeft} เดือน`;
  return `หมดอายุ ${date} · เหลืออีกราว ${Math.round(daysLeft / 365)} ปี`;
}

export default function ShareLinkPanel({ fileId }: { fileId: string }) {
  const utils = trpc.useUtils();
  const links = trpc.admin.listShareLinksForFile.useQuery({ fileId });
  const [expiryDays, setExpiryDays] = useState<number | undefined>(DEFAULT_EXPIRY_DAYS);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  // Which link's copy button just fired, so the confirmation lands on that row
  // and not on every row at once.
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const create = trpc.admin.createShareLink.useMutation({
    onSuccess: async (data) => {
      setJustCreatedId(data.id);
      await utils.admin.listShareLinksForFile.invalidate({ fileId });
    },
  });
  const revoke = trpc.admin.revokeShareLink.useMutation({
    onSuccess: async () => {
      await utils.admin.listShareLinksForFile.invalidate({ fileId });
    },
  });

  async function copy(link: ShareLink) {
    try {
      await navigator.clipboard.writeText(urlFor(link.token));
      setCopiedId(link.id);
      window.setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2000);
    } catch {
      // Clipboard denied: the link is on screen and selectable, which is the
      // fallback that always works.
    }
  }

  const all = (links.data ?? []) as ShareLink[];
  const justCreated = all.find((l) => l.id === justCreatedId) ?? null;

  return (
    <div id="share-link-panel" className="card p-5 sm:p-6 scroll-mt-4">
      <h2 className="font-serif text-lg font-semibold text-navy-900 mb-1">ลิงก์แชร์ส่วนตัว</h2>
      <p className="text-sm text-navy-700/60 mb-4">
        ใครก็ตามที่มีลิงก์นี้เปิดอ่านไฟล์นี้ได้โดยไม่ต้องล็อกอิน แม้ไฟล์จะเป็นแบบร่างอยู่ก็ตาม แต่ละลิงก์แยกกันคนละอัน
        ปิดทีละอันได้ และกำหนดอายุได้ตั้งแต่ 7 วันไปจนถึงตลอดชีพ
      </p>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div>
          <label htmlFor="share-expiry" className="text-xs font-medium text-navy-700/60 block mb-1">
            อายุลิงก์
          </label>
          <select
            id="share-expiry"
            value={expiryDays ?? ""}
            onChange={(e) => setExpiryDays(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-navy-900/15 px-2.5 py-1.5 text-sm bg-white"
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.days ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setJustCreatedId(null);
            create.mutate({ fileId, expiresInDays: expiryDays });
          }}
          disabled={create.isLoading}
          className="btn-primary text-sm px-4 py-2"
        >
          {create.isLoading ? "กำลังสร้าง..." : "สร้างลิงก์ใหม่"}
        </button>
      </div>

      {create.isError && (
        <p className="mb-4 text-sm text-red-700">สร้างลิงก์ไม่สำเร็จ ลองอีกครั้ง</p>
      )}

      {justCreated && (
        <div className="mb-4 rounded-xl border border-gold-500/40 bg-gold-400/5 p-3">
          <p className="text-xs font-medium text-navy-700/70 mb-1.5">ลิงก์ใหม่ — {expiryLabel(justCreated)}</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={urlFor(justCreated.token)}
              onFocus={(e) => e.target.select()}
              className="input-field text-sm flex-1"
            />
            <button type="button" onClick={() => copy(justCreated)} className="btn-outline text-sm px-3 py-2 shrink-0">
              {copiedId === justCreated.id ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </div>
        </div>
      )}

      {all.length > 0 ? (
        <ul className="space-y-2">
          {all.map((link) => {
            const status = statusOf(link);
            return (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm border-t border-navy-900/[0.06] pt-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_COLOR[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                  <span className="text-navy-700/60 truncate">{expiryLabel(link)}</span>
                </div>
                {status === "valid" && (
                  <div className="flex items-center gap-3 shrink-0">
                    {/* An old link is worth as much as a new one — being unable
                        to copy it again is what makes people mint duplicates. */}
                    <button type="button" onClick={() => copy(link)} className="text-gold-700 hover:underline">
                      {copiedId === link.id ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                    </button>
                    <button type="button" onClick={() => revoke.mutate({ id: link.id })} className="text-red-700 hover:underline">
                      ปิดลิงก์
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !links.isLoading && <p className="text-sm text-navy-700/50">ยังไม่มีลิงก์แชร์สำหรับไฟล์นี้</p>
      )}
    </div>
  );
}
