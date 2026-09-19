/**
 * Dictation's availability and failure paths, on the platform the app has
 * never run on.
 *
 * Jest runs as iOS. The hook used to answer `available: true` for iOS without
 * asking the framework — a mic that could only fail on a phone with Dictation
 * switched off, or offline on a phone without on-device models. Now it asks
 * `isRecognitionAvailable`, re-asks on foreground, and turns the codes a person
 * can act on into one sentence rather than stopping silently.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { problemSentence, useSpeechToText } from "../useSpeechToText";

const native = ExpoSpeechRecognitionModule as unknown as Record<string, jest.Mock>;

type Handler = (event: unknown) => void;
let handlers: Record<string, Handler>;
let foreground: ((status: string) => void)[];

beforeEach(() => {
  jest.clearAllMocks();
  handlers = {};
  foreground = [];
  (useSpeechRecognitionEvent as jest.Mock).mockImplementation((name: string, handler: Handler) => {
    handlers[name] = handler;
  });
  native.isRecognitionAvailable.mockReturnValue(true);
  native.getSpeechRecognitionServices.mockReturnValue(["com.google.android.googlequicksearchbox"]);
  native.requestPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, fn: (s: string) => void) => {
    foreground.push(fn);
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => jest.restoreAllMocks());

const settle = async (native_fn: jest.Mock) =>
  waitFor(() => expect(native_fn).toHaveBeenCalled());

describe("availability on iOS", () => {
  it("runs as iOS", () => {
    expect(Platform.OS).toBe("ios");
  });

  it("is ABSENT when SFSpeechRecognizer says it is unavailable", async () => {
    native.isRecognitionAvailable.mockReturnValue(false);

    const { result } = renderHook(() => useSpeechToText(jest.fn()));
    await settle(native.isRecognitionAvailable);

    expect(result.current.available).toBe(false);
    expect(result.current.status).toBe("unavailable");
  });

  it("is present when the framework says so — and never consults the Android service list", async () => {
    const { result } = renderHook(() => useSpeechToText(jest.fn()));
    await settle(native.isRecognitionAvailable);

    expect(result.current.available).toBe(true);
    expect(native.getSpeechRecognitionServices).not.toHaveBeenCalled();
  });

  // Availability is not a constant. Dictation switched back on in Settings, or
  // the phone leaving a tunnel, must not need a restart to show the mic.
  it("asks again when the app returns to the foreground", async () => {
    const { result } = renderHook(() => useSpeechToText(jest.fn()));
    await settle(native.isRecognitionAvailable);
    expect(result.current.available).toBe(true);

    native.isRecognitionAvailable.mockReturnValue(false);
    act(() => foreground.forEach((fn) => fn("active")));

    expect(result.current.available).toBe(false);
  });
});

describe("availability on Android", () => {
  it("is absent with no recogniser installed, whatever the framework says", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      native.getSpeechRecognitionServices.mockReturnValue([]);

      const { result } = renderHook(() => useSpeechToText(jest.fn()));
      await settle(native.getSpeechRecognitionServices);

      expect(result.current.available).toBe(false);
    } finally {
      os.restore();
    }
  });

  it("is present with a service installed and the framework willing", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      const { result } = renderHook(() => useSpeechToText(jest.fn()));
      await settle(native.getSpeechRecognitionServices);

      expect(result.current.available).toBe(true);
    } finally {
      os.restore();
    }
  });
});

describe("a refused permission", () => {
  it("degrades to the keyboard with a reason, and never starts the recogniser", async () => {
    native.requestPermissionsAsync.mockResolvedValue({ granted: false, status: "denied" });
    const { result } = renderHook(() => useSpeechToText(jest.fn()));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.refused).toBe(true);
    expect(result.current.listening).toBe(false);
    expect(native.start).not.toHaveBeenCalled();
  });

  // Remembered for this launch only — the person may grant it in Settings and
  // come straight back. A cached `denied` would hide the fix from them.
  it("is not written to storage", async () => {
    native.requestPermissionsAsync.mockResolvedValue({ granted: false, status: "denied" });
    const setItem = jest.spyOn(AsyncStorage, "setItem");
    const { result } = renderHook(() => useSpeechToText(jest.fn()));

    await act(async () => {
      await result.current.start();
    });

    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("a recogniser that is present but cannot work", () => {
  async function startListening() {
    const onFinal = jest.fn();
    const rendered = renderHook(() => useSpeechToText(onFinal));
    await act(async () => {
      await rendered.result.current.start();
    });
    expect(rendered.result.current.listening).toBe(true);
    return { ...rendered, onFinal };
  }

  it("says so on a network error, in one sentence, without hiding the mic", async () => {
    const { result } = await startListening();

    act(() => handlers.error({ error: "network", message: "" }));

    expect(result.current.listening).toBe(false);
    expect(result.current.problem).toMatch(/connection/);
    expect(result.current.refused).toBe(false);
    expect(result.current.available).toBe(true);
  });

  it("says nothing for no speech heard — the ordinary end of an attempt", async () => {
    const { result } = await startListening();

    act(() => handlers.error({ error: "no-speech", message: "" }));

    expect(result.current.problem).toBeNull();
  });

  it("clears the last problem when the person tries again", async () => {
    const { result } = await startListening();
    act(() => handlers.error({ error: "network", message: "" }));
    expect(result.current.problem).not.toBeNull();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.problem).toBeNull();
  });

  it("names the language when the phone cannot dictate in it", () => {
    expect(problemSentence("language-not-supported", "Français")).toMatch(/Français/);
    expect(problemSentence("audio-capture", "Français")).toMatch(/microphone/i);
    expect(problemSentence("aborted", "Français")).toBeNull();
  });
});

describe("the transcript", () => {
  it("shows interim words and commits only the final one", async () => {
    const onFinal = jest.fn();
    const { result } = renderHook(() => useSpeechToText(onFinal));
    await act(async () => {
      await result.current.start();
    });

    act(() => handlers.result({ isFinal: false, results: [{ transcript: "combien je" }] }));
    expect(result.current.interim).toBe("combien je");
    expect(onFinal).not.toHaveBeenCalled();

    act(() => handlers.result({ isFinal: true, results: [{ transcript: "combien je dois" }] }));
    expect(onFinal).toHaveBeenCalledWith("combien je dois");
    expect(result.current.interim).toBe("");
  });

  // Alan's ✕: a cancel must also suppress the final result already in flight,
  // or the words the person threw away land in the field a moment later.
  it("throws away a final result that arrives after a cancel", async () => {
    const onFinal = jest.fn();
    const { result } = renderHook(() => useSpeechToText(onFinal));
    await act(async () => {
      await result.current.start();
    });

    act(() => result.current.cancel());
    act(() => handlers.result({ isFinal: true, results: [{ transcript: "too late" }] }));

    expect(onFinal).not.toHaveBeenCalled();
    expect(native.abort).toHaveBeenCalled();
  });
});
