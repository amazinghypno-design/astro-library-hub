/**
 * Replaces native window.confirm() for destructive actions — a custom modal
 * we fully control, so we can show a real busy/loading state instead of a
 * dialog that just closes with no visible feedback while the request is
 * in flight (which made "did my delete actually do anything?" hard to tell).
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "ยืนยันลบ",
  isBusy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-card-hover p-5 w-full max-w-sm">
        <h3 className="font-serif text-lg font-semibold text-navy-900 mb-2">{title}</h3>
        <p className="text-sm text-navy-700/70 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={isBusy} className="btn-outline text-sm px-4 py-2">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {isBusy ? "กำลังลบ..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
