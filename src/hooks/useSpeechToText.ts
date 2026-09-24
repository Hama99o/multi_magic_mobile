/**
 * Dictation, on the DEVICE's recogniser.
 *
 * The web uses the browser's own engine — `AI_ASSISTANT.md` §10: *"no server,
 * no key, no per-minute cost."* There is no Web Speech API on a phone, so the
 * equivalent is the platform recogniser: the iOS Speech framework and Android's
 * `SpeechRecognizer`, via `expo-speech-recognition`. Same principle, same cost:
 * **nothing reaches our backend and nothing is metered.**
 *
 * Three behaviours carried from `multi_magic/app/javascript/lib/useSpeechToText.ts`
 * rather than reinvented:
 *
 * 1. **Interim words are shown while listening**, so the user can see it is
 *    hearing them — and are NOT part of the committed text until they are final.
 * 2. **Final text is APPENDED to whatever is already typed, never replacing it.**
 *    Someone who types half a question and dictates the rest must keep both.
 * 3. **The button is ABSENT when the device cannot do it**, rather than offered
 *    and broken. On a phone that means no recogniser is installed — a real state
 *    on a cheap Android, not a hypothetical.
 *
 * ── Never restore a `denied` permission from storage ──────────────────────
 * The web file says so and is right, and it is MORE right on a phone: the user
 * may have granted the microphone in Settings since, and a cached `denied`
 * would hide the button from someone who has just fixed the problem. So refusal
 * is remembered for this launch only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { t } from "@/i18n";

/**
 * LOADED DEFENSIVELY, AND THE REASON IS A BUG THIS ALREADY CAUSED.
 *
 * `expo-speech-recognition` is a custom native module. A static
 * `import { … } from "expo-speech-recognition"` throws
 * `Cannot find native module 'ExpoSpeechRecognition'` at MODULE SCOPE wherever
 * the binary does not carry it — and because the throw happens on import, it
 * does not disable dictation: it takes down every module in the chain. Measured
 * on a device: `chat.tsx` lost its default export entirely and the route failed
 * to render, with an error naming a file two imports away from the screen.
 *
 * That happens in Expo Go, which bundles no custom native modules, and it would
 * happen in any build where the plugin had not been applied. Either way the
 * honest behaviour is the one this hook already describes — `available: false`,
 * so the composer renders NO mic — and it could never run, because the import
 * failed first.
 *
 * So the module is required inside a try, and its absence is just another
 * unavailable recogniser.
 */
interface SpeechResultEvent {
  isFinal: boolean;
  results?: { transcript: string }[];
}
interface SpeechErrorEvent {
  error: string;
}
/** The three events this hook listens to, with the payload each carries. */
interface SpeechEventMap {
  result: SpeechResultEvent;
  end: null;
  error: SpeechErrorEvent;
}

interface SpeechModule {
  ExpoSpeechRecognitionModule: {
    start: (options: Record<string, unknown>) => void;
    stop: () => void;
    abort: () => void;
    requestPermissionsAsync: () => Promise<{ granted: boolean }>;
    getSpeechRecognitionServices: () => string[];
    /** Optional: older builds of the module do not have it. */
    getSupportedLocales?: (options: {
      androidRecognitionServicePackage?: string;
    }) => Promise<{ locales: string[]; installedLocales: string[] }>;
    /**
     * `SFSpeechRecognizer.isAvailable` on iOS; `SpeechRecognizer.isRecognitionAvailable`
     * on Android. Optional in the type because older builds of the module did
     * not have it, and an absent function must read as "assume yes", not crash.
     */
    isRecognitionAvailable?: () => boolean;
  };
  useSpeechRecognitionEvent: <K extends keyof SpeechEventMap>(
    event: K,
    handler: (e: SpeechEventMap[K]) => void,
  ) => void;
}

let speech: SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  speech = require("expo-speech-recognition") as SpeechModule;
} catch {
  speech = null;
}

const ExpoSpeechRecognitionModule = speech?.ExpoSpeechRecognitionModule ?? null;
/** A no-op subscription when there is no module, so the hook order is stable. */
const useSpeechRecognitionEvent: SpeechModule["useSpeechRecognitionEvent"] =
  speech?.useSpeechRecognitionEvent ?? (() => {});

/** Exported: the read-aloud store reads the same preference for the device
 *  voice's language — the language somebody speaks to it in is the best
 *  guess for the language it should speak back. */
export const STT_LANG_KEY = "mm-stt-lang";
const LANG_KEY = STT_LANG_KEY;

/** The web hook defaults to `fr-FR` (`useSpeechToText.ts:70`); the corpus is
 *  largely French even though the interface is English. Match it. */
export const DEFAULT_LANG = "fr-FR";
export const LANGUAGES = [
  { code: "fr-FR", label: "Français" },
  { code: "en-US", label: "English" },
  /**
   * His request: *"if there is pashto possible add that also."* It is his own
   * language and `Ai::RagChat` already answers in it — "Someone writing
   * Pashto… wants it back the same way" — so the assistant can hold the
   * conversation; only the microphone could not.
   *
   * **Whether a phone can hear it is the phone's answer, not ours.** Android
   * ships whichever locales its recogniser has, and `ps-AF` is not among the
   * common ones — so this is offered and then CHECKED against
   * `getSupportedLocales()` rather than promised. `useDictationLocales` below
   * is how the chooser knows to say so instead of failing silently when the
   * mic is pressed.
   */
  { code: "ps-AF", label: "پښتو" },
] as const;

/**
 * Just the stored preference, for a settings screen.
 *
 * `useSpeechToText` takes a callback and wires up a recogniser, which is far
 * more than a chooser needs — and mounting it in a sheet would subscribe to
 * speech events nobody is listening for. Same key, so the choice made here is
 * the one the mic uses and the one the device voice reads back
 * (`readAloud.store.ts`).
 */
export function useDictationLang(): { lang: string; setLang: (code: string) => void } {
  const [lang, setLangState] = useState<string>(DEFAULT_LANG);

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(LANG_KEY)
      .then((stored) => {
        if (alive && stored) setLangState(stored);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setLang = useCallback((next: string) => {
    setLangState(next);
    void AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
  }, []);

  return { lang, setLang };
}

/**
 * WHICH OF THESE CAN THIS PHONE ACTUALLY HEAR?
 *
 * `null` means **we could not find out**, and that distinction is the whole
 * point of this hook. `getSupportedLocales` returns an empty array on Android
 * 12 and below rather than an error, and it throws `package_not_found` when
 * there is no recogniser service to ask. Reading either as "this phone
 * supports no languages" would grey out every option on a phone where
 * dictation works perfectly.
 *
 * So: a list means the device answered and the chooser can mark what is
 * missing. `null` means nobody knows, and the chooser offers everything rather
 * than guessing — a language that then fails says so through the existing
 * `problem` line, which is the honest order of events.
 */
export function useDictationLocales(): { locales: string[] | null } {
  const [locales, setLocales] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    const ask = ExpoSpeechRecognitionModule?.getSupportedLocales;
    if (!ask) return;
    void ask({})
      .then((result) => {
        if (!alive) return;
        // An EMPTY list is not an answer — see the header. Android 12 and
        // below return exactly that, and so does a service that has nothing
        // to say about itself.
        setLocales(result.locales.length > 0 ? result.locales : null);
      })
      .catch(() => {
        // `package_not_found`, or a recogniser that refused the question.
        if (alive) setLocales(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { locales };
}

/**
 * Is a language one this phone offers? Compared on the LANGUAGE SUBTAG rather
 * than the whole code: a device that lists `fr_CA` can hear `fr-FR` spoken at
 * it, and Android reports locales with an underscore while we store a hyphen.
 * Unknown support means yes — see `useDictationLocales`.
 */
export function isLocaleSupported(code: string, locales: string[] | null): boolean {
  if (locales === null) return true;
  const want = code.toLowerCase().split(/[-_]/)[0];
  return locales.some((l) => l.toLowerCase().split(/[-_]/)[0] === want);
}

export type SttStatus = "idle" | "listening" | "unavailable";

/**
 * Is there a recogniser that could work RIGHT NOW?
 *
 * Android can genuinely have none installed — a cheap phone without Google's
 * app — and the services list is the specific question for that. iOS always
 * HAS the Speech framework; what it may not have is a working recogniser:
 * Siri & Dictation switched off under Screen Time, or — on a phone without
 * on-device models — no network for Apple's server. `isRecognitionAvailable`
 * is the one question that covers both platforms' "present but cannot work".
 *
 * Before this function iOS was `true` unconditionally, which offered a mic
 * that could only fail — the exact shape the header says not to ship.
 */
function recogniserPresent(): boolean {
  if (!ExpoSpeechRecognitionModule) return false;
  try {
    if (Platform.OS === "android") {
      const services = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
      if (!Array.isArray(services) || services.length === 0) return false;
    }
    const available = ExpoSpeechRecognitionModule.isRecognitionAvailable?.();
    return available === undefined ? true : available;
  } catch {
    // A module that cannot answer is a module we do not offer.
    return false;
  }
}

/**
 * The recogniser's error codes, as a sentence or as silence.
 *
 * `not-allowed` / `service-not-allowed` are a REFUSAL and handled apart. Of
 * the rest, only the ones the person can act on get a sentence: no connection
 * (a server-based engine, which is both platforms' default), a microphone held
 * by another app, a language the phone cannot do. `no-speech` and `aborted`
 * are the ordinary end of an attempt and say nothing.
 */
export function problemSentence(code: string, langLabel: string): string | null {
  switch (code) {
    case "network":
      return t("dictation.network");
    case "audio-capture":
      return t("dictation.audioCapture");
    case "language-not-supported":
      return t("dictation.languageNotSupported", { language: langLabel });
    default:
      return null;
  }
}

export interface UseSpeechToText {
  /** False means render NO mic at all — not a disabled one. */
  available: boolean;
  status: SttStatus;
  listening: boolean;
  /** Words heard but not yet final. Shown beside the field, not committed. */
  interim: string;
  lang: string;
  setLang: (lang: string) => void;
  start: () => Promise<void>;
  stop: () => void;
  /** Throw away what was heard — Alan's `✕`. */
  cancel: () => void;
  /** Set once when a permission is refused, so the UI can explain. */
  refused: boolean;
  /**
   * A recogniser that exists but could not work on the last attempt — one
   * sentence the person can act on, or null. Cleared when they try again.
   */
  problem: string | null;
}

export function useSpeechToText(onFinal: (text: string) => void): UseSpeechToText {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [refused, setRefused] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [lang, setLangState] = useState<string>(DEFAULT_LANG);

  // Kept in a ref so the event subscriptions never need rebuilding when the
  // composer re-renders, which it does on every keystroke.
  const onFinalRef = useRef(onFinal);
  // Written in an EFFECT, not during render: the React Compiler (SDK 57)
  // rejects a ref assignment in a render body, and it is right that this is
  // the safer shape — every read below happens inside a callback or a socket
  // frame, never during a render, so "after commit" is soon enough and
  // "during render" was never needed.
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  /** A cancel must suppress the final result that is already on its way. */
  const cancelledRef = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANG_KEY);
        if (stored) setLangState(stored);
      } catch {
        // The default is fine.
      }
    })();
  }, []);

  useEffect(() => {
    // No native module at all — Expo Go, or a build without the plugin — is
    // just the first way `recogniserPresent` says no.
    setAvailable(recogniserPresent());

    // Re-asked when the app comes back to the foreground. Availability is not
    // a constant: somebody switches Dictation back on in Settings, or walks out
    // of the tunnel, and comes straight back to the composer. A mic that only
    // ever appears after a restart is the cached-`denied` mistake in another
    // costume.
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active") setAvailable(recogniserPresent());
    });
    return () => sub.remove();
  }, []);

  useSpeechRecognitionEvent("result", (event) => {
    if (cancelledRef.current) return;
    const transcript = event.results?.[0]?.transcript ?? "";
    if (!transcript) return;

    if (event.isFinal) {
      setInterim("");
      // APPENDED by the caller, never replacing — see the header.
      onFinalRef.current(transcript);
    } else {
      setInterim(transcript);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    setInterim("");
    cancelledRef.current = false;
  });

  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    setInterim("");
    // "not-allowed" is a refusal; the rest are ordinary failures (no speech
    // heard, network, busy) and must not hide the button. The ones a person
    // can act on get one sentence; the rest stay quiet.
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setRefused(true);
      return;
    }
    const label = LANGUAGES.find((l) => l.code === lang)?.label ?? lang;
    setProblem(problemSentence(event.error, label));
  });

  const setLang = useCallback((next: string) => {
    setLangState(next);
    void AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
  }, []);

  const start = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) return;
    cancelledRef.current = false;
    // A new attempt starts clean: the last problem may be gone.
    setProblem(null);
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        // Remembered for THIS LAUNCH ONLY. Never written to storage: the user
        // may grant it in Settings and come straight back.
        setRefused(true);
        return;
      }
      setRefused(false);
      setInterim("");
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        /**
         * `requiresOnDeviceRecognition` is NOT set, and that is a decision
         * rather than an omission.
         *
         * It was set true on 2026-09-21 so that
         * NSSpeechRecognitionUsageDescription's "on this device" was true.
         * The flag maps to Apple's
         * `SFSpeechAudioBufferRecognitionRequest.requiresOnDeviceRecognition`
         * (`ExpoSpeechRecognizer.swift:589`), and on-device locales are a
         * SUBSET of the server-backed ones, each needing its pack installed.
         * So it can only ever shrink the set of languages that work -- which
         * collides with offering Pashto at all.
         *
         * His call, 2026-09-24: the language choice wins. The permission
         * string in `app.json` was reworded in the same commit to say that
         * Apple may process the audio, so the promise still matches the code.
         * Making the sentence vaguer to close the gap is what
         * `docs/STORE_READINESS.md` section 4 forbids; this changes both
         * sides together instead.
         */
      });
    } catch {
      setListening(false);
      setRefused(true);
    }
  }, [lang]);

  const stop = useCallback(() => {
    if (!ExpoSpeechRecognitionModule) return;
    // `stop` lets the recogniser deliver its final result; `abort` discards it.
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setInterim("");
    setListening(false);
    if (!ExpoSpeechRecognitionModule) return;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Already stopped.
    }
  }, []);

  return {
    available,
    status: !available ? "unavailable" : listening ? "listening" : "idle",
    listening,
    interim,
    lang,
    setLang,
    start,
    stop,
    cancel,
    refused,
    problem,
  };
}
