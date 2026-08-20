import { IconCollapse, IconRotateDevice } from "./icons";

/**
 * Asks the reader to turn the phone sideways when a landscape document is
 * opened fullscreen in portrait.
 *
 * It exists because screen.orientation.lock() cannot be relied on: it rotates
 * the device on Android, and is simply absent on iOS — so on an iPhone the
 * only thing that turns a slide the right way up is the person holding it.
 *
 * Deliberately not a trap. A prompt you cannot dismiss is worse than no
 * prompt: both a "read it upright anyway" and a "leave fullscreen" way out are
 * always offered, for anyone whose rotation lock is on or who simply prefers
 * portrait.
 */
export default function RotateDeviceOverlay({ onDismiss, onExitFullscreen }: { onDismiss: () => void; onExitFullscreen: () => void }) {
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="หมุนอุปกรณ์เป็นแนวนอน"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-navy-950/95 text-ivory px-8 text-center"
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      <IconRotateDevice width={64} height={64} className="text-gold-400 animate-[rotate-hint_2.4s_ease-in-out_infinite]" />
      <div className="space-y-2">
        <p className="font-serif text-xl font-semibold">หมุนหน้าจอเป็นแนวนอน</p>
        <p className="text-ivory/70 text-sm max-w-xs leading-relaxed">
          เอกสารนี้เป็นแนวนอน เมื่อหมุนเครื่องแล้วจะเห็นทั้งหน้ากระดาษเต็มจอ อ่านตัวอักษรได้ชัดกว่ามาก
        </p>
        <p className="text-ivory/40 text-xs">ถ้าหมุนแล้วหน้าจอไม่เปลี่ยน ให้ปิดระบบล็อกการหมุนหน้าจอของเครื่องก่อน</p>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={onDismiss}
          className="px-5 py-2.5 rounded-xl bg-ivory/10 hover:bg-ivory/20 text-ivory font-medium text-sm transition-colors"
        >
          อ่านแบบแนวตั้งต่อไป
        </button>
        <button
          type="button"
          onClick={onExitFullscreen}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-ivory/60 hover:text-ivory text-sm transition-colors"
        >
          <IconCollapse width={16} height={16} /> ออกจากเต็มจอ
        </button>
      </div>
    </div>
  );
}
