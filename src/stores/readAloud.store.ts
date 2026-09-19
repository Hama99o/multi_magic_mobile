/**
 * READ AN ANSWER ALOUD — the mobile half of `docs/READ_ALOUD_PROPOSAL.md`.
 *
 * His words: *"like a real human voice… we should be able to stop it, restart
 * it and pause it — this kind of thing should happen on web also and on mobile
 * also."* The web player (`multi_magic/app/javascript/lib/ai/useSpeech.ts`,
 * 940b356) is the behavioural reference and every rule below is its rule:
 *
 * 1. **The server's voice first.** `GET /api/v1/ai/messages/:id/speech`
 *    answers a signed URL to audio generated once and cached by message id, so
 *    the phone and the web read the same words in the same voice. The URL is
 *    handed to `expo-audio` with the same two headers every request carries.
 * 2. **The device voice second, and it SAYS SO.** Over the cap (413), refused
 *    (422), the provider or the server unreachable (502, no response) — the
 *    answer is read by `expo-speech` and `voice` is `"device"`, so the UI can
 *    say which one is speaking. A worse voice somebody was told about is
 *    honest; a worse voice presented as the good one is what he complained
 *    about in the first place.
 * 3. **One answer speaking at a time.** Starting another stops the first; the
 *    same one again stops it. A second press while the first is still fetching
 *    must not have the first start when it arrives (`wanted`).
 * 4. **Pause, resume and restart are exact ONLY for the server voice** — it is
 *    a file. A device voice cannot pause at a sample, so pause is a stop there
 *    and the control is not offered.
 * 5. **The control is ABSENT, not broken**, when neither path exists.
 * 6. **A 429 is a wait, not a failure** — the chat's own rule. A 409 or 404 is
 *    "nothing to read here" and says so once, under that answer.
 *
 * ── Both native modules are loaded defensively ────────────────────────────
 * `expo-audio` and `expo-speech` are custom native modules. A static import
 * throws at MODULE SCOPE in any binary that does not carry them — the exact
 * bug `expo-speech-recognition` already caused, which took a whole route down
 * from two imports away. Both binaries in use tonight were built before these
 * two were added, so their absence is the normal case for a while, and its
 * honest rendering is rule 5.
 *
 * ── Why a store and not a hook ────────────────────────────────────────────
 * There is one player for the whole app, not one per row, and a FlatList row
 * must not re-render on every playback tick. Rows select the two booleans
 * they draw from (`speakingId === id`, `loadingId === id`); position is not
 * kept in state at all, because nothing draws it yet — `duration_ms` is null
 * from the server and a progress bar that guesses is worse than none.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SpeechUnavailable, speechApi } from "@/api/speech";
import { authHeaders } from "@/api/http";
import { DEFAULT_LANG, STT_LANG_KEY } from "@/hooks/useSpeechToText";
import { t } from "@/i18n";

// ── The two modules, as this file uses them ──────────────────────────────────

interface AudioStatusLike {
  playing?: boolean;
  didJustFinish?: boolean;
}
interface AudioPlayerLike {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void>;
  remove: () => void;
  addListener: (
    event: "playbackStatusUpdate",
    listener: (status: AudioStatusLike) => void,
  ) => { remove: () => void };
}
interface AudioModule {
  createAudioPlayer: (
    source: { uri: string; headers?: Record<string, string> },
    options?: { updateInterval?: number },
  ) => AudioPlayerLike;
  setAudioModeAsync: (mode: { playsInSilentMode?: boolean; interruptionMode?: string }) => Promise<void>;
}
interface DeviceSpeechModule {
  speak: (
    text: string,
    options?: {
      language?: string;
      onDone?: () => void;
      onStopped?: () => void;
      onError?: (error: Error) => void;
    },
  ) => void;
  stop: () => Promise<void>;
}

function tryRequire<T>(name: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(name) as T;
  } catch {
    return null;
  }
}

const audio = tryRequire<AudioModule>("expo-audio");
const device = tryRequire<DeviceSpeechModule>("expo-speech");

// ── State ────────────────────────────────────────────────────────────────────

/** Which voice is actually speaking, so the UI never has to guess. */
export type SpeakingVoice = "server" | "device" | null;

export interface ReadAloudMessage {
  id: number;
  body: string | null;
}

interface ReadAloudState {
  /** False only when NEITHER path exists — then the control is not drawn. */
  supported: boolean;
  speakingId: number | null;
  /** The first play of an answer waits on synthesis; a replay does not. */
  loadingId: number | null;
  voice: SpeakingVoice;
  paused: boolean;
  /** What was handed to the player last — for a log, never for a branch. */
  mimeType: string | null;
  /**
   * One sentence for the listener, under ONE answer: a wait (429), or
   * "nothing to read here" (409, 404), or the good voice being unavailable
   * with no device voice to stand in. Null otherwise.
   */
  notice: { messageId: number; text: string } | null;
  toggle: (message: ReadAloudMessage) => Promise<void>;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  stop: () => void;
}

const IDLE = {
  speakingId: null,
  loadingId: null,
  voice: null as SpeakingVoice,
  paused: false,
};

// ── The one player ───────────────────────────────────────────────────────────

let player: AudioPlayerLike | null = null;
let subscription: { remove: () => void } | null = null;
/**
 * Which message the newest request was for. A press elsewhere while a fetch
 * is in flight must drop that fetch's result rather than start a voice the
 * reader has moved on from — the race that makes two answers talk over each
 * other, and which the web player exists to prevent.
 */
let wanted: number | null = null;
let audioModeSet = false;

function releasePlayer(): void {
  subscription?.remove();
  subscription = null;
  if (player) {
    try {
      player.remove();
    } catch {
      // Already released.
    }
  }
  player = null;
}

/** The language for the device voice: the one somebody dictates in. */
async function deviceLanguage(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(STT_LANG_KEY)) ?? DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function noticeFor(error: SpeechUnavailable): string {
  switch (error.kind) {
    case "rate_limited":
      // A wait, in the chat's own terms — never "failed".
      return t("answer.voiceBusy");
    case "no_text":
      return t("answer.noText");
    case "not_found":
      return t("answer.cannotRead");
    default:
      return t("answer.voiceUnavailable");
  }
}

export const useReadAloud = create<ReadAloudState>((set, get) => {
  const finish = (id: number) => {
    if (wanted !== id) return;
    wanted = null;
    releasePlayer();
    set({ ...IDLE });
  };

  const stop = () => {
    wanted = null;
    releasePlayer();
    if (device) void device.stop().catch(() => {});
    set({ ...IDLE });
  };

  /** The phone's own voice. The fallback, never the first choice. */
  const speakOnDevice = async (id: number, body: string) => {
    if (!device) {
      set({ ...IDLE, notice: { messageId: id, text: t("answer.voiceUnavailable") } });
      return;
    }
    const language = await deviceLanguage();
    if (wanted !== id) return;
    set({ loadingId: null, speakingId: id, voice: "device", paused: false });
    device.speak(body, {
      language,
      onDone: () => finish(id),
      onStopped: () => finish(id),
      onError: () => finish(id),
    });
  };

  const speak = async (message: ReadAloudMessage) => {
    const body = message.body?.trim() ?? "";
    stop();
    if (!body) return;
    wanted = message.id;
    set({ loadingId: message.id, notice: null });

    if (!audio) {
      await speakOnDevice(message.id, body);
      return;
    }

    try {
      const payload = await speechApi.forMessage(message.id);
      if (wanted !== message.id) return;

      if (!audioModeSet) {
        // The ringer switch: somebody who pressed play wants to hear it. Other
        // apps' audio is ducked rather than stopped — this is a paragraph, not
        // a film.
        await audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "duckOthers" }).catch(() => {});
        audioModeSet = true;
      }
      const headers = await authHeaders();
      if (wanted !== message.id) return;

      player = audio.createAudioPlayer({ uri: payload.url, headers }, { updateInterval: 500 });
      subscription = player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) finish(message.id);
      });
      set({ loadingId: null, speakingId: message.id, voice: "server", paused: false, mimeType: payload.mimeType });
      player.play();
    } catch (error) {
      if (wanted !== message.id) return;
      if (error instanceof SpeechUnavailable) {
        if (error.fallsBackToDevice) {
          await speakOnDevice(message.id, body);
          return;
        }
        set({ ...IDLE, notice: { messageId: message.id, text: noticeFor(error) } });
        return;
      }
      // A 401 has already gone through the interceptor and the sign-in screen
      // is on its way; anything else is ours, and the honest state is idle.
      wanted = null;
      set({ ...IDLE });
    }
  };

  return {
    supported: audio !== null || device !== null,
    ...IDLE,
    mimeType: null,
    notice: null,

    toggle: async (message) => {
      const { speakingId, loadingId } = get();
      // Same message: stop. A different one: the new one wins and `speak`
      // stops the first — one answer speaking at a time.
      if (speakingId === message.id || loadingId === message.id) {
        stop();
        return;
      }
      await speak(message);
    },

    /** Exact for the server voice; a STOP for the device voice, which cannot
     *  resume from a sample — and the UI does not offer it there. */
    pause: () => {
      if (player && get().voice === "server") {
        player.pause();
        set({ paused: true });
        return;
      }
      stop();
    },

    resume: () => {
      if (!player) return;
      player.play();
      set({ paused: false });
    },

    /** Back to the start of the same answer — free, because the audio is
     *  already here and the server caches by message id. */
    restart: () => {
      if (!player) return;
      void player.seekTo(0);
      player.play();
      set({ paused: false });
    },

    stop,
  };
});

/** Test seam: back to launch state, player released. */
export function __resetReadAloud(): void {
  wanted = null;
  releasePlayer();
  audioModeSet = false;
  useReadAloud.setState({ ...IDLE, mimeType: null, notice: null });
}
