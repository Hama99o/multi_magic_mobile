/**
 * The player, through the surface it uses on a phone.
 *
 * The web player's six rules (`useSpeech.ts`, 940b356) are the rows here: the
 * server voice first with the session's headers; the device voice second and
 * SAID; one answer at a time with the in-flight race closed; pause exact only
 * for the server voice; the control absent when neither path exists; a 429 a
 * wait. `expo-audio` and `expo-speech` are the setup-file fakes, so what is
 * asserted is the calls a real player would receive.
 */
import { createAudioPlayer } from "expo-audio";
import * as Device from "expo-speech";
import type { FakeAudioPlayer } from "@/__tests__/mocks/expoAudio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { __resetReadAloud, useReadAloud } from "../readAloud.store";
import { SpeechUnavailable, speechApi } from "@/api/speech";
import { __resetTokenCache, setToken } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

type Source = { uri: string; headers?: Record<string, string> };

const players = (): FakeAudioPlayer[] =>
  (createAudioPlayer as jest.Mock).mock.results.map((r) => r.value as FakeAudioPlayer);
const last = (): FakeAudioPlayer => players().at(-1)!;
const sourceOf = (player: FakeAudioPlayer): Source => player.source as Source;

const ANSWER = { id: 12, body: "You lent Ahmad 500 in March." };
const OTHER = { id: 13, body: "Husna owes you 200." };

const PAYLOAD = {
  url: "https://www.multimagics.com/rails/active_storage/blobs/redirect/abc/answer-12-charon.wav",
  voice: "Charon",
  mimeType: "audio/x-wav",
  byteSize: 720_044,
  durationMs: null,
  cached: false,
};

let forMessage: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  __resetReadAloud();
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
  await AsyncStorage.clear();
  await setToken("Bearer session");
  forMessage = jest.spyOn(speechApi, "forMessage").mockResolvedValue(PAYLOAD);
});

afterEach(() => jest.restoreAllMocks());

const state = () => useReadAloud.getState();

describe("the server's voice", () => {
  it("is supported when the audio module is present", () => {
    expect(state().supported).toBe(true);
  });

  it("waits, then plays the signed URL with the session's two headers", async () => {
    let resolve!: (v: typeof PAYLOAD) => void;
    forMessage.mockReturnValue(new Promise((r) => (resolve = r)));

    const pressed = state().toggle(ANSWER);
    // The first play of an answer waits on synthesis — and says so.
    expect(state().loadingId).toBe(12);
    expect(state().speakingId).toBeNull();

    resolve(PAYLOAD);
    await pressed;

    expect(forMessage).toHaveBeenCalledWith(12);
    expect(sourceOf(last()).uri).toBe(PAYLOAD.url);
    expect(sourceOf(last()).headers?.Authorization).toBe("Bearer session");
    expect(sourceOf(last()).headers?.["X-Device-Fingerprint"]).toBeTruthy();
    expect(last().play).toHaveBeenCalled();
    expect(state()).toMatchObject({ speakingId: 12, loadingId: null, voice: "server", paused: false, mimeType: "audio/x-wav" });
  });

  it("goes idle when the file ends", async () => {
    await state().toggle(ANSWER);

    last().__emit({ didJustFinish: true });

    expect(state().speakingId).toBeNull();
    expect(state().voice).toBeNull();
    expect(last().remove).toHaveBeenCalled();
  });

  it("pauses and resumes EXACTLY — it is a file", async () => {
    await state().toggle(ANSWER);

    state().pause();
    expect(last().pause).toHaveBeenCalled();
    expect(state().paused).toBe(true);
    expect(state().speakingId).toBe(12);

    state().resume();
    expect(last().play).toHaveBeenCalledTimes(2);
    expect(state().paused).toBe(false);
  });

  it("restarts from the beginning of the same answer", async () => {
    await state().toggle(ANSWER);
    state().pause();

    state().restart();

    expect(last().seekTo).toHaveBeenCalledWith(0);
    expect(last().play).toHaveBeenCalledTimes(2);
    expect(state().paused).toBe(false);
  });

  it("stops on the same answer pressed again, and releases the player", async () => {
    await state().toggle(ANSWER);

    await state().toggle(ANSWER);

    expect(last().remove).toHaveBeenCalled();
    expect(state().speakingId).toBeNull();
  });
});

describe("one answer at a time", () => {
  it("starting another stops the first", async () => {
    await state().toggle(ANSWER);
    const first = last();

    await state().toggle(OTHER);

    expect(first.remove).toHaveBeenCalled();
    expect(players()).toHaveLength(2);
    expect(state().speakingId).toBe(13);
  });

  // The race the web player exists to close: a press elsewhere while the first
  // fetch is in flight must drop the first result, or two answers talk over
  // each other.
  it("drops a fetch the reader has moved on from", async () => {
    let resolveFirst!: (v: typeof PAYLOAD) => void;
    forMessage.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)));
    forMessage.mockResolvedValueOnce({ ...PAYLOAD, url: "https://example.test/13.wav" });

    const first = state().toggle(ANSWER);
    await state().toggle(OTHER);
    resolveFirst(PAYLOAD);
    await first;

    expect(players()).toHaveLength(1);
    expect(sourceOf(last()).uri).toBe("https://example.test/13.wav");
    expect(state().speakingId).toBe(13);
  });
});

describe("the device voice", () => {
  it.each([
    { kind: "too_long" as const, status: 413 },
    { kind: "refused" as const, status: 422 },
    { kind: "unreachable" as const, status: 502 },
  ])("stands in on $kind ($status) and SAYS which voice is speaking", async ({ kind }) => {
    forMessage.mockRejectedValue(new SpeechUnavailable(kind, "nope"));

    await state().toggle(ANSWER);

    expect(Device.speak).toHaveBeenCalledWith(ANSWER.body, expect.objectContaining({ language: "fr-FR" }));
    expect(state()).toMatchObject({ speakingId: 12, voice: "device", loadingId: null });
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  it("speaks in the language the person dictates in", async () => {
    await AsyncStorage.setItem("mm-stt-lang", "en-US");
    forMessage.mockRejectedValue(new SpeechUnavailable("too_long", "nope"));

    await state().toggle(ANSWER);

    expect(Device.speak).toHaveBeenCalledWith(ANSWER.body, expect.objectContaining({ language: "en-US" }));
  });

  it("treats pause as a STOP, because it cannot resume from a sample", async () => {
    forMessage.mockRejectedValue(new SpeechUnavailable("refused", "nope"));
    await state().toggle(ANSWER);

    state().pause();

    expect(Device.stop).toHaveBeenCalled();
    expect(state().speakingId).toBeNull();
    expect(state().paused).toBe(false);
  });

  it("goes idle when the phone finishes speaking", async () => {
    forMessage.mockRejectedValue(new SpeechUnavailable("too_long", "nope"));
    await state().toggle(ANSWER);
    const options = (Device.speak as jest.Mock).mock.calls[0][1] as { onDone: () => void };

    options.onDone();

    expect(state().speakingId).toBeNull();
    expect(state().voice).toBeNull();
  });
});

describe("nothing to read, and a wait", () => {
  it("says a 429 is a wait, under that answer, and plays nothing", async () => {
    forMessage.mockRejectedValue(new SpeechUnavailable("rate_limited", "Too many requests."));

    await state().toggle(ANSWER);

    expect(state().notice).toEqual({ messageId: 12, text: expect.stringMatching(/busy|minute/) });
    expect(state().speakingId).toBeNull();
    expect(Device.speak).not.toHaveBeenCalled();
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  it("says a 409 has no text, and does not send the phone's voice to read nothing", async () => {
    forMessage.mockRejectedValue(new SpeechUnavailable("no_text", "This message has no text to read."));

    await state().toggle(ANSWER);

    expect(state().notice?.text).toMatch(/no text/);
    expect(Device.speak).not.toHaveBeenCalled();
  });

  it("clears the notice when the next answer is pressed", async () => {
    forMessage.mockRejectedValueOnce(new SpeechUnavailable("rate_limited", "x"));
    await state().toggle(ANSWER);
    expect(state().notice).not.toBeNull();

    await state().toggle(OTHER);

    expect(state().notice).toBeNull();
    expect(state().speakingId).toBe(13);
  });

  it("does nothing for an empty body", async () => {
    await state().toggle({ id: 9, body: "   " });

    expect(forMessage).not.toHaveBeenCalled();
    expect(state().loadingId).toBeNull();
  });

  // A 401 has already gone through the interceptor; anything else is ours.
  it("goes idle quietly on an error that is not about speech", async () => {
    forMessage.mockRejectedValue(new Error("boom"));

    await state().toggle(ANSWER);

    expect(state()).toMatchObject({ speakingId: null, loadingId: null, notice: null });
  });
});
