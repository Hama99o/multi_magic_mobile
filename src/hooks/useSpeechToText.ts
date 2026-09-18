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
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

const LANG_KEY = "mm-stt-lang";

/** The web hook defaults to `fr-FR` (`useSpeechToText.ts:70`); the corpus is
 *  largely French even though the interface is English. Match it. */
export const DEFAULT_LANG = "fr-FR";
export const LANGUAGES = [
  { code: "fr-FR", label: "Français" },
  { code: "en-US", label: "English" },
] as const;

export type SttStatus = "idle" | "listening" | "unavailable";

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
}

export function useSpeechToText(onFinal: (text: string) => void): UseSpeechToText {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [refused, setRefused] = useState(false);
  const [lang, setLangState] = useState<string>(DEFAULT_LANG);

  // Kept in a ref so the event subscriptions never need rebuilding when the
  // composer re-renders, which it does on every keystroke.
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

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
    void (async () => {
      // No native module at all — Expo Go, or a build without the plugin.
      if (!ExpoSpeechRecognitionModule) {
        setAvailable(false);
        return;
      }
      try {
        // Android can genuinely have no recogniser installed. iOS always has
        // the Speech framework, so an empty list there is not a refusal.
        if (Platform.OS === "android") {
          const services = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
          setAvailable(Array.isArray(services) && services.length > 0);
        } else {
          setAvailable(true);
        }
      } catch {
        // A module that cannot answer is a module we do not offer.
        setAvailable(false);
      }
    })();
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
    // heard, network, busy) and must not hide the button.
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setRefused(true);
    }
  });

  const setLang = useCallback((next: string) => {
    setLangState(next);
    void AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
  }, []);

  const start = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) return;
    cancelledRef.current = false;
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
  };
}
