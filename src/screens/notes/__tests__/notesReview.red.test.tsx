/**
 * REVIEW (feat/notes-parity @ 887b603): two bugs, each proven red here and
 * left unfixed on purpose. Invented rows only (example.test).
 *
 * N1 — dictation in the note editor (`app/notes/edit.tsx`, `useSpeechToText`).
 *   `useSpeechRecognitionEvent` subscribes to the recogniser MODULE-WIDE: the
 *   native module emits one stream, and every mounted hook instance hears it.
 *   The note editor and the assistant Composer under it each mount one, and
 *   the hook's `result` handler does not ask whether ITS instance started
 *   listening, so a final result is appended to both fields. And nothing stops
 *   the recogniser on unmount, with `continuous: true`, so leaving the editor
 *   mid-dictation leaves the microphone running.
 *
 * N2 — the share sheet's "remind" bell (`ShareSheet.tsx`) is guarded only by
 *   `disabled={remind.isPending}`. Two taps in one frame both land before
 *   `isPending` re-renders, so two POST send_reminder go out and a real person
 *   gets two emails. 887b603 fixed this exact shape on the + key with a ref.
 */
import { useEffect, useRef } from "react";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

import { testQueryClient } from "@/__tests__/queryClient";
import { notesApi, type NoteCollaborator } from "@/api/notes";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { NoteShareSheet } from "../ShareSheet";

const native = ExpoSpeechRecognitionModule as unknown as Record<string, jest.Mock>;

type Handler = (event: unknown) => void;
/**
 * The library's real shape (`useSpeechRecognitionEvent.ts`): an effect that
 * adds a listener to the ONE native emitter and removes it on unmount. So
 * every mounted instance is a listener, and an emit reaches all of them.
 */
let listeners: Map<string, Set<{ current: Handler }>>;
const emit = (name: string, event: unknown) => listeners.get(name)?.forEach((h) => h.current(event));

beforeEach(() => {
  jest.clearAllMocks();
  listeners = new Map();
  (useSpeechRecognitionEvent as jest.Mock).mockImplementation((name: string, handler: Handler) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const ref = useRef(handler);
    ref.current = handler;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      set.add(ref);
      return () => {
        set.delete(ref);
      };
    }, [name]);
  });
  native.isRecognitionAvailable.mockReturnValue(true);
  native.requestPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
});

describe("N1: dictation belongs to the instance that started it", () => {
  it("a final result reaches only the instance that started listening (editor vs Composer)", async () => {
    const editorFinal = jest.fn();
    const composerFinal = jest.fn();
    const editor = renderHook(() => useSpeechToText(editorFinal));
    renderHook(() => useSpeechToText(composerFinal));

    await act(async () => {
      await editor.result.current.start();
    });
    expect(native.start).toHaveBeenCalledTimes(1);

    act(() => emit("result", { isFinal: true, results: [{ transcript: "acheter du pain" }] }));

    expect(editorFinal).toHaveBeenCalledWith("acheter du pain");
    // The Composer never pressed its mic: the words must not land in it.
    expect(composerFinal).not.toHaveBeenCalled();
  });

  it("unmounting while listening stops the recogniser (continuous: true never ends by itself)", async () => {
    const editor = renderHook(() => useSpeechToText(jest.fn()));
    await act(async () => {
      await editor.result.current.start();
    });
    expect(editor.result.current.listening).toBe(true);

    editor.unmount();

    const stopped = native.abort.mock.calls.length + native.stop.mock.calls.length;
    expect(stopped).toBeGreaterThan(0);
  });
});

// 88's follow-up (added by ff): when B takes the recogniser while A is
// dictating, A must LEAVE its listening state, or it shows a live mic that no
// longer hears anything.
describe("N1c: a second instance taking the recogniser", () => {
  it("puts the first one back to idle, and only the second hears results", async () => {
    const aFinal = jest.fn();
    const bFinal = jest.fn();
    const a = renderHook(() => useSpeechToText(aFinal));
    const b = renderHook(() => useSpeechToText(bFinal));
    await act(async () => {
      await a.result.current.start();
    });
    expect(a.result.current.listening).toBe(true);
    await act(async () => {
      await b.result.current.start();
    });
    expect(b.result.current.listening).toBe(true);
    expect(a.result.current.listening).toBe(false);

    act(() => emit("result", { isFinal: true, results: [{ transcript: "pour B" }] }));
    expect(bFinal).toHaveBeenCalledWith("pour B");
    expect(aFinal).not.toHaveBeenCalled();
  });
});

describe("N2: the remind bell sends one reminder per intent", () => {
  const ANA: NoteCollaborator = { id: 21, name: "Ana Example", email: "ana@example.test", avatar: null, role: "contributor" };

  it("a double tap on the bell sends ONE send_reminder, not two emails", async () => {
    const pending: (() => void)[] = [];
    const send = jest
      .spyOn(notesApi, "sendReminder")
      .mockImplementation(() => new Promise<void>((resolve) => void pending.push(resolve)));

    render(
      <QueryClientProvider client={testQueryClient()}>
        <NoteShareSheet visible note={{ id: 5, sharedUsers: [ANA] }} onClose={jest.fn()} />
      </QueryClientProvider>,
    );

    const bell = screen.getByTestId("note-share-user-21-remind");
    await act(async () => {
      fireEvent.press(bell);
      fireEvent.press(bell);
    });
    await act(async () => pending.forEach((resolve) => resolve()));
    await waitFor(() => expect(screen.getByTestId("note-share-reminded")).toBeTruthy());

    expect(send).toHaveBeenCalledTimes(1);
    send.mockRestore();
  });
});
