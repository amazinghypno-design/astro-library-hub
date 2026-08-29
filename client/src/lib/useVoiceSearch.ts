import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speaking instead of typing, using the browser's own Web Speech API — the
 * search box (one phrase per press) and dictation into a note (`continuous`,
 * which keeps the microphone open until it is switched off).
 *
 * There is no server side to this and no audio ever reaches our instance: the
 * browser captures the microphone and hands back text. That is the whole
 * reason it is worth having — a free-tier box with half a CPU has no business
 * running speech recognition, and adding a paid transcription API for a
 * search box would cost money per query for something a phone already does.
 *
 * The trade is that support is uneven. Chrome, Edge and Safari have it;
 * Firefox does not ship it at all. Nothing here degrades the typed search —
 * when the API is missing the button simply never appears (`supported` is
 * false) and the field behaves exactly as it did before.
 *
 * Thai by default (`th-TH`): all but a handful of titles in this library are
 * Thai, and the recogniser's language is what decides whether "โหราศาสตร์"
 * comes back as a word or as nonsense.
 */

// TypeScript's lib.dom ships SpeechRecognitionResultList but not the
// recogniser itself or its events, so the missing pieces are declared here —
// locally, not globally, so a future TS release that adds them cannot clash.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  // The microphone is a powerful feature: browsers only expose it on https
  // (or localhost). On a plain-http page the constructor may still exist and
  // then fail at start(), so the check happens up front instead.
  if (!window.isSecureContext) return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Thai wording for the error codes the spec defines. */
function messageForError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "เบราว์เซอร์ยังไม่ได้รับอนุญาตให้ใช้ไมโครโฟน — อนุญาตในการตั้งค่าเว็บไซต์แล้วลองใหม่";
    case "no-speech":
      return "ไม่ได้ยินเสียงพูด ลองกดไมค์แล้วพูดอีกครั้ง";
    case "audio-capture":
      return "ไม่พบไมโครโฟนบนอุปกรณ์นี้";
    case "network":
      return "เชื่อมต่อบริการแปลงเสียงไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
    case "aborted":
      return "";
    default:
      return "ใช้เสียงไม่สำเร็จ ลองอีกครั้งหรือพิมพ์แทน";
  }
}

export type VoiceSearchOptions = {
  /** Fires on every partial guess, so the field fills in as the reader speaks. */
  onInterim?: (text: string) => void;
  /** Fires once the recogniser has settled on a phrase. In continuous mode this fires per phrase. */
  onFinal: (text: string) => void;
  lang?: string;
  /**
   * Keep listening across pauses instead of stopping after one phrase.
   *
   * For dictation this is the whole point: somebody talking through a page of
   * notes stops to think, and a recogniser that ends there would have to be
   * re-pressed every sentence. Browsers end the session on silence anyway, so
   * the hook restarts it as long as the microphone was not switched off — the
   * only thing that clears that intent is `stop()` or an error that means the
   * microphone is not available at all.
   */
  continuous?: boolean;
};

export type VoiceSearch = {
  supported: boolean;
  listening: boolean;
  /** Thai, reader-facing, empty when there is nothing to say. */
  error: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
};

export function useVoiceSearch({ onInterim, onFinal, lang = "th-TH", continuous = false }: VoiceSearchOptions): VoiceSearch {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Whether the microphone is *meant* to be on, which is not the same as
  // whether the recogniser is currently running — see `continuous` above.
  const wantListeningRef = useRef(false);
  // The handlers are read through refs so that a page re-rendering (which it
  // does on every keystroke of the interim transcript) never has to tear down
  // and rebuild a recogniser that is mid-sentence.
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  onInterimRef.current = onInterim;
  onFinalRef.current = onFinal;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = lang;
    // One phrase per press for the search box — a recogniser left running
    // there keeps the microphone indicator lit long after the reader has
    // finished talking. Dictation asks for the opposite and says so.
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setError("");
    };

    recognition.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) final += text;
        else interim += text;
      }
      if (final.trim()) {
        onFinalRef.current(final.trim());
      } else if (interim) {
        onInterimRef.current?.(interim);
      }
    };

    recognition.onerror = (e) => {
      // Silence between sentences is not a failure while dictating; every
      // other code means this attempt is over.
      if (continuous && e.error === "no-speech") return;
      if (e.error !== "no-speech") wantListeningRef.current = false;
      setError(messageForError(e.error));
      setListening(false);
    };

    // Fires on a clean finish as well as after an error, so it is the one
    // place guaranteed to clear the listening state — or, while dictating, to
    // pick the microphone back up after the browser ended the session on its
    // own during a pause.
    recognition.onend = () => {
      if (continuous && wantListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Already restarting; fall through and report the honest state.
        }
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang, continuous]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setError("");
    wantListeningRef.current = true;
    try {
      recognition.start();
    } catch {
      // start() throws if the recogniser is already running — which, since the
      // button is the only caller, means the click landed before `onstart`.
      // Nothing to do: it is already listening.
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
