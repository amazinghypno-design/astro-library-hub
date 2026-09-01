import { useState } from "react";
import { useVoiceSearch } from "../lib/useVoiceSearch";
import { IconMic, IconMicOff } from "./icons";

/**
 * Dictation for the editor: press once, talk for as long as you like, and
 * every phrase the recogniser settles on is typed in at the caret.
 *
 * Same browser recogniser as the search box (lib/useVoiceSearch.ts — no audio
 * leaves the machine, nothing is transcribed on our server), but held open
 * across pauses, because dictating a page means stopping to think and a mic
 * that quits after each sentence would have to be pressed again every time.
 *
 * The second argument handed to `onText` is the only thing this component
 * knows about punctuation: true when the reader stopped long enough to mean a
 * space. Talking straight through produces one unbroken run of Thai, which is
 * how Thai is written; the editor decides what that means at the caret.
 *
 * Renders nothing where the API is missing (Firefox) or the origin is not
 * secure — a mic that cannot listen is worse than no mic, and every one of
 * these buttons sits next to a keyboard that still works.
 */
export default function DictationButton({ onText }: { onText: (text: string, pause: boolean) => void }) {
  const [heard, setHeard] = useState("");

  const voice = useVoiceSearch({
    continuous: true,
    onInterim: setHeard,
    onFinal: (text, phrase) => {
      setHeard("");
      onText(text, phrase.pause);
    },
  });

  if (!voice.supported) return null;

  const { listening, error } = voice;

  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={voice.toggle}
        title={listening ? "หยุดพิมพ์ตามเสียง" : "พิมพ์ตามเสียง (พูดแล้วข้อความจะขึ้นตรงเคอร์เซอร์ หยุดพูดสัก 3 วิ = เว้นวรรค)"}
        aria-label={listening ? "หยุดพิมพ์ตามเสียง" : "พิมพ์ตามเสียง"}
        aria-pressed={listening}
        className={`inline-flex items-center justify-center h-8 min-w-[2rem] px-1.5 rounded-lg transition-colors ${
          listening ? "bg-red-600 text-white" : "text-navy-800 hover:bg-navy-900/[0.07]"
        }`}
      >
        {listening && <span aria-hidden className="absolute inset-0 rounded-lg bg-red-500/30 animate-ping" />}
        <span className="relative">
          {listening ? <IconMicOff width={18} height={18} /> : <IconMic width={18} height={18} />}
        </span>
      </button>

      {(listening || error) && (
        <div
          role="status"
          // `w-max` matters: the bubble is positioned against a 32px button, and
          // without it the shrink-to-fit width collapses to one word per line.
          className={`absolute top-full left-0 mt-1.5 z-20 w-max max-w-[18rem] rounded-lg px-3 py-1.5 text-sm shadow-card ${
            error ? "bg-white text-red-700 border border-red-200" : "bg-navy-950 text-ivory"
          }`}
        >
          {/* While the phrase is still being guessed it shows here rather than
              in the page: half-heard words landing in the document and then
              being rewritten is unreadable, so only settled text is typed in. */}
          {error || (heard ? `กำลังฟัง: ${heard}` : "กำลังฟัง… พูดต่อเนื่องได้เลย หยุดสัก 3 วิ = เว้นวรรค")}
        </div>
      )}
    </div>
  );
}
