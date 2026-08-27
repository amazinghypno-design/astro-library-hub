import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speaking into the search box, using the browser's own Web Speech API.
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
      return "ใช้เสียงค้นหาไม่สำเร็จ ลองอีกครั้งหรือพิมพ์คำค้นหาแทน";
  }
}

export type VoiceSearchOptions = {
  /** Fires on every partial guess, so the field fills in as the reader speaks. */
  onInterim?: (text: string) => void;
  /** Fires once the recogniser has settled on the phrase — the cue to search. */
  onFinal: (text: string) => void;
  lang?: string;
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

export function useVoiceSearch({ onInterim, onFinal, lang = "th-TH" }: VoiceSearchOptions): VoiceSearch {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
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
    // One phrase per press, not an open mic: this is a search box, and a
    // recogniser left running keeps the microphone indicator lit long after
    // the reader has finished talking.
    recognition.continuous = false;
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
      setError(messageForError(e.error));
      setListening(false);
    };

    // Fires on a clean finish as well as after an error, so it is the one
    // place guaranteed to clear the listening state.
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setError("");
    try {
      recognition.start();
    } catch {
      // start() throws if the recogniser is already running — which, since the
      // button is the only caller, means the click landed before `onstart`.
      // Nothing to do: it is already listening.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
