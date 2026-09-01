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
 *
 * Two things the raw API gets wrong for long-form Thai dictation, both fixed
 * here rather than by cleaning up the text afterwards:
 *
 * 1. It repeats itself. In continuous mode Safari (and Chrome on Android)
 *    hand back a `results` list that still holds every phrase already settled
 *    in this session, with `resultIndex` reset to 0 — so a naive reader
 *    re-delivers phrases it has already delivered and one spoken word gets
 *    typed twice. Every final result is therefore delivered exactly once,
 *    keyed by its index within the session, and a phrase repeated across a
 *    restart is recognised as the browser's echo and dropped. Repetition is
 *    never removed from the *text*: "จริงๆ" and "เร็วๆ" are real Thai words
 *    and a de-duplicator working on words would eat them.
 *
 * 2. It does not say where the reader paused. The recogniser settles a phrase
 *    whenever it feels like it — mid-sentence, mid-thought — and those breaks
 *    have nothing to do with where a space belongs. So the silence before each
 *    phrase is measured here and reported with it: a short gap is the middle
 *    of a sentence and joins up with no space at all (Thai runs its words
 *    together), while a deliberate pause of a few seconds is what the reader
 *    means by a space. Talk for a minute without stopping and a minute of
 *    unbroken text comes out.
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

/**
 * A pause at least this long is a space. The reader asked for "three to five
 * seconds", and this sits a little under three on purpose: the gap measured
 * here runs from the recogniser's last word to its next one, and the engine
 * needs a moment of silence to decide a phrase has ended, so a real three
 * second pause reads as slightly less. Anything shorter than this is somebody
 * drawing breath in the middle of a sentence, and gets no space.
 */
const PAUSE_FOR_SPACE_MS = 2600;

/**
 * How long after a restart the same phrase coming back again is the browser
 * echoing itself rather than the reader genuinely saying a word twice. Only
 * applied across a session boundary, which is the only place the echo happens.
 */
const RESTART_ECHO_MS = 4000;

/** A beat for the engine to release the microphone before asking for it back. */
const RESTART_DELAY_MS = 120;
/** Second attempt, for when the first lands while the old session is still closing. */
const RESTART_RETRY_MS = 500;
/** A session that ends this fast without hearing anything did not really start. */
const FLAP_MS = 400;
/** Give up restarting after this many failures in a row, rather than spinning. */
const MAX_FLAPS = 8;

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

/**
 * The recogniser leaves a space on the front of each phrase in some browsers
 * and not in others, and occasionally doubles one up in the middle. Runs of
 * whitespace collapse to one so that what the caller receives is only the
 * words — where the spaces go is the caller's decision, made from `pause`.
 */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** What the hook knows about a settled phrase besides the words themselves. */
export type SpokenPhrase = {
  /** Silence before this phrase, in milliseconds — 0 for the first one. */
  silenceMs: number;
  /**
   * Whether that silence was long enough to be a deliberate break. True means
   * the reader stopped and meant it: put a space in. False is mid-sentence.
   */
  pause: boolean;
};

export type VoiceSearchOptions = {
  /** Fires on every partial guess, so the field fills in as the reader speaks. */
  onInterim?: (text: string) => void;
  /**
   * Fires once the recogniser has settled on a phrase — per phrase in
   * continuous mode. `phrase.pause` says whether the reader stopped long
   * enough before it to mean a space; callers that only want the words can
   * ignore the second argument entirely.
   */
  onFinal: (text: string, phrase: SpokenPhrase) => void;
  lang?: string;
  /** Override the silence that counts as a space. Defaults to ~2.6s. */
  pauseForSpaceMs?: number;
  /**
   * Keep listening across pauses instead of stopping after one phrase.
   *
   * For dictation this is the whole point: somebody talking through a page of
   * notes stops to think, and a recogniser that ends there would have to be
   * re-pressed every sentence. Browsers end the session on silence anyway
   * (and Chrome caps a session at about a minute regardless), so the hook
   * restarts it as long as the microphone was not switched off — the only
   * things that clear that intent are `stop()` and an error meaning the
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

export function useVoiceSearch({
  onInterim,
  onFinal,
  lang = "th-TH",
  continuous = false,
  pauseForSpaceMs = PAUSE_FOR_SPACE_MS,
}: VoiceSearchOptions): VoiceSearch {
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
  const pauseMsRef = useRef(pauseForSpaceMs);
  onInterimRef.current = onInterim;
  onFinalRef.current = onFinal;
  pauseMsRef.current = pauseForSpaceMs;

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

    // --- what has already been delivered, so nothing is delivered twice ---
    // Indices are per session: they mean nothing after a restart, so they are
    // cleared in onstart rather than accumulating.
    const delivered = new Set<number>();
    let sessionStartedAt = 0;
    let flaps = 0;
    let heardAnythingThisSession = false;
    // Carried *across* sessions on purpose: the echo guard and the silence
    // measurement both have to see through a restart, because a restart is
    // exactly what happens in the middle of a long pause.
    let lastFinalText = "";
    let lastFinalAt = 0;
    let lastFinalSession = 0;
    let session = 0;
    // The clock the pause is measured against: the last moment the recogniser
    // reported hearing anything at all, interim guesses included.
    let lastHeardAt = 0;
    // A gap counts once, when a fresh utterance begins — not again for each
    // interim update inside it.
    let utteranceOpen = false;
    let pendingSilence = 0;
    let restartTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRestart = (delay: number) => {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        if (!wantListeningRef.current) return;
        try {
          recognition.start();
        } catch {
          // The previous session had not finished closing. One more try, then
          // let the flap counter deal with it.
          scheduleRestart(RESTART_RETRY_MS);
        }
      }, delay);
    };

    recognition.onstart = () => {
      session += 1;
      sessionStartedAt = Date.now();
      heardAnythingThisSession = false;
      delivered.clear();
      setListening(true);
      setError("");
    };

    recognition.onresult = (e) => {
      const now = Date.now();
      // Silence is measured in wall-clock time from the last thing heard, so
      // it stays honest across the restarts the browser does on its own
      // during a long pause.
      if (!utteranceOpen) pendingSilence = lastHeardAt ? now - lastHeardAt : 0;
      utteranceOpen = true;
      lastHeardAt = now;
      heardAnythingThisSession = true;
      flaps = 0;

      let interim = "";
      // Never trust resultIndex to be where the new results start: Safari
      // hands back 0 with the whole session's results behind it. Walk the
      // list and let `delivered` decide what is actually new.
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        const text = tidy(result[0]?.transcript ?? "");
        if (!result.isFinal) {
          if (i >= e.resultIndex) interim += (interim ? " " : "") + text;
          continue;
        }
        if (delivered.has(i)) continue;
        delivered.add(i);
        if (!text) continue;

        // A phrase that comes back identical immediately after a restart is
        // the browser repeating its own tail, not the reader saying a word
        // twice. Inside one session the same words really were spoken again.
        const isRestartEcho =
          session !== lastFinalSession && text === lastFinalText && now - lastFinalAt < RESTART_ECHO_MS;

        const silenceMs = pendingSilence;
        pendingSilence = 0;
        utteranceOpen = false;
        if (isRestartEcho) continue;

        lastFinalText = text;
        lastFinalAt = now;
        lastFinalSession = session;
        onFinalRef.current(text, { silenceMs, pause: silenceMs >= pauseMsRef.current });
      }

      if (interim) onInterimRef.current?.(interim);
    };

    recognition.onerror = (e) => {
      // Silence between sentences is not a failure while dictating, and
      // neither is the abort a restart race produces — both mean "carry on".
      // Everything else ends this attempt.
      if (continuous && (e.error === "no-speech" || e.error === "aborted")) return;
      if (e.error !== "no-speech") wantListeningRef.current = false;
      setError(messageForError(e.error));
      setListening(false);
    };

    // Fires on a clean finish as well as after an error, so it is the one
    // place guaranteed to clear the listening state — or, while dictating, to
    // pick the microphone back up after the browser ended the session on its
    // own during a pause.
    recognition.onend = () => {
      utteranceOpen = false;
      if (continuous && wantListeningRef.current) {
        // A session that ends immediately having heard nothing is the engine
        // refusing rather than the reader being quiet. A few of those in a
        // row means restarting will not help, and a tight retry loop with the
        // microphone would be worse than stopping.
        if (!heardAnythingThisSession && Date.now() - sessionStartedAt < FLAP_MS) flaps += 1;
        if (flaps < MAX_FLAPS) {
          scheduleRestart(RESTART_DELAY_MS);
          return;
        }
        wantListeningRef.current = false;
        setError("ไมโครโฟนหยุดทำงานเอง ลองกดไมค์อีกครั้ง");
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      clearTimeout(restartTimer);
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
