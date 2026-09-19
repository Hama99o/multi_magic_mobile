/**
 * NEITHER NATIVE MODULE IS IN THE BINARY — its own file, because the case is
 * a `require` that THROWS and only a file-level `jest.mock` can make one do
 * that reliably.
 *
 * This is not hypothetical. `expo-speech-recognition` did exactly this in
 * Expo Go: a static import threw `Cannot find native module` at module scope
 * and took a whole route down from two imports away. Both binaries in use
 * tonight were built before `expo-audio` and `expo-speech` were added, so
 * their absence is the normal case for a while — and the honest rendering of
 * it is no control at all, never a control that does nothing.
 */
jest.mock("expo-audio", () => {
  throw new Error("Cannot find native module 'ExpoAudio'");
});
jest.mock("expo-speech", () => {
  throw new Error("Cannot find native module 'ExpoSpeech'");
});

/* eslint-disable import/first */
import { useReadAloud } from "../readAloud.store";

describe("with no audio module and no device voice", () => {
  it("loads anyway — the throw must not take the chat down with it", () => {
    expect(useReadAloud.getState()).toBeTruthy();
  });

  it("is NOT supported, so the control is absent rather than broken", () => {
    expect(useReadAloud.getState().supported).toBe(false);
  });

  it("says so under the answer rather than pretending to read it", async () => {
    await useReadAloud.getState().toggle({ id: 12, body: "You lent Ahmad 500." });

    expect(useReadAloud.getState().speakingId).toBeNull();
    expect(useReadAloud.getState().notice?.messageId).toBe(12);
  });
});
