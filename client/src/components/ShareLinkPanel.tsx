import { useState } from "react";
import { trpc } from "../lib/trpc";

const EXPIRY_OPTIONS = [
  { label: "ไม่หมดอายุ", days: undefined },
  { label: "1 วัน", days: 1 },
  { label: "7 วัน", days: 7 },
  { label: "30 วัน", days: 30 },
];

function statusOf(link: { expiresAt: string | null; revokedAt: string | null }): "valid" | "expired" | "revoked" {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return "expired";
  return "valid";
}

const STATUS_LABEL: Record<string, string> = { valid: "ใช้งานได้", expired: "หมดอายุแล้ว", revoked: "ปิดแล้ว" };
const STATUS_COLOR: Record<string, string> = {
  valid: "text-emerald-700 bg-emerald-50",
  expired: "text-navy-700/60 bg-navy-900/5",
  revoked: "text-red-700 bg-red-50",
};

export default function ShareLinkPanel({ fileId }: { fileId: string }) {
  const utils = trpc.useUtils();
  const links = trpc.admin.listShareLinksForFile.useQuery({ fileId });
  const [expiryDays, setExpiryDays] = useState<number | undefined>(30);
  const [justCreatedUrl, setJustCreatedUrl] = useState<string | null>(null);

  const create = trpc.admin.createShareLink.useMutation({
    onSuccess: async (data) => {
      setJustCreatedUrl(data.url);
      await utils.admin.listShareLinksForFile.invalidate({ fileId });
    },
  });
  const revoke = trpc.admin.revokeShareLink.useMutation({
    onSuccess: async () => {
      await utils.admin.listShareLinksForFile.invalidate({ fileId });
    },
  });

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="font-serif text-lg font-semibold text-navy-900 mb-1">ลิงก์แชร์ส่วนตัว</h2>
      <p className="text-sm text-navy-700/60 mb-4">
        ใครก็ตามที่มีลิงก์นี้เปิดดูไฟล์นี้ได้โดยไม่ต้องล็อกอิน แม้ไฟล์จะเป็นแบบร่างอยู่ก็ตาม ปิดหรือกำหนดวันหมดอายุได้ทุกเมื่อ
      </p>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div>
          <label className="text-xs font-medium text-navy-700/60 block mb-1">อายุลิงก์</label>
          <select
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
            setJustCreatedUrl(null);
            create.mutate({ fileId, expiresInDays: expiryDays });
          }}
          disabled={create.isLoading}
          className="btn-primary text-sm px-4 py-2"
        >
          {create.isLoading ? "กำลังสร้าง..." : "สร้างลิงก์ใหม่"}
        </button>
      </div>

      {justCreatedUrl && (
        <div className="mb-4 flex items-center gap-2">
          <input readOnly value={justCreatedUrl} onFocus={(e) => e.target.select()} className="input-field text-sm flex-1" />
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(justCreatedUrl)}
            className="btn-outline text-sm px-3 py-2 shrink-0"
          >
            คัดลอก
          </button>
        </div>
      )}

      {links.data && links.data.length > 0 && (
        <ul className="space-y-2">
          {links.data.map((link) => {
            const status = statusOf(link);
            return (
              <li key={link.id} className="flex items-center justify-between gap-3 text-sm border-t border-navy-900/[0.06] pt-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_COLOR[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                  <span className="text-navy-700/60 truncate">
                    {link.expiresAt ? `หมดอายุ ${new Date(link.expiresAt).toLocaleDateString("th-TH")}` : "ไม่หมดอายุ"}
                  </span>
                </div>
                {status === "valid" && (
                  <button
                    type="button"
                    onClick={() => revoke.mutate({ id: link.id })}
                    className="text-red-700 hover:underline shrink-0"
                  >
                    ปิดลิงก์
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
