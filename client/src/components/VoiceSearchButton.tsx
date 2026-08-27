import { useVoiceSearch } from "../lib/useVoiceSearch";
import { IconMic, IconMicOff } from "./icons";

type Props = {
  /** Live partial transcript — fill the field with it so the reader sees it being heard. */
  onInterim: (text: string) => void;
  /** The settled phrase. Set the field to it and run the search. */
  onFinal: (text: string) => void;
  /** Positioning inside the caller's relative wrapper. */
  className?: string;
};

/**
 * The microphone that sits inside a search field. Press, speak, and the
 * search runs on its own once the phrase settles — see lib/useVoiceSearch.ts
 * for why this is the browser's recogniser and not one of ours.
 *
 * It renders nothing at all in a browser without the API (Firefox) or on a
 * non-secure origin. That is deliberate: a mic button that cannot listen is
 * worse than no button, and typing into the field still works everywhere.
 */
export default function VoiceSearchButton({ onInterim, onFinal, className = "" }: Props) {
  const voice = useVoiceSearch({ onInterim, onFinal });
  if (!voice.supported) return null;

  const { listening, error } = voice;

  return (
    <>
      <button
        type="button"
        onClick={voice.toggle}
        aria-label={listening ? "หยุดฟัง" : "ค้นหาด้วยเสียง"}
        aria-pressed={listening}
        title={listening ? "หยุดฟัง" : "ค้นหาด้วยเสียง"}
        className={`absolute top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400 ${
          listening ? "bg-red-600 text-white" : "text-navy-700/50 hover:text-navy-900 hover:bg-navy-900/5"
        } ${className}`}
      >
        {/* The expanding ring is the only signal that the mic is live once the
            reader has looked away from the button to watch the field fill in. */}
        {listening && <span aria-hidden className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />}
        <span className="relative">
          {listening ? <IconMicOff width={18} height={18} /> : <IconMic width={18} height={18} />}
        </span>
      </button>

      {(listening || error) && (
        <div
          role="status"
          className={`absolute top-full left-0 mt-2 z-20 rounded-lg px-3 py-1.5 text-sm shadow-card ${
            error ? "bg-white text-red-700 border border-red-200" : "bg-navy-950 text-ivory"
          }`}
        >
          {error || "กำลังฟัง... พูดคำที่ต้องการค้นหาได้เลย"}
        </div>
      )}
    </>
  );
}
