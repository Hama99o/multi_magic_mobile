/**
 * THE UNDO BUTTON, WHICH NOTHING HAD EVER RENDERED.
 *
 * `qa/UNWALKED.md` §1. This control calls `undoApi.undo` → `POST
 * /api/v1/ai/undos`, which in the API layer's own words takes back "what an
 * assistant reply wrote" — and the assistant writes notes, contacts, expenses
 * and events into the live MultiMagic database. So it deletes real records.
 *
 * Before this file, **every path to it was closed at once**: no test mounted
 * `AnswerActions`, no flow reached it, and the two fixtures that build a
 * message both set `undoable: false`, so `showUndo` was never true and the
 * branch did not render even inside the screen tests that mount the whole chat.
 * The chat screen rendered, its tests passed, and the destructive control was
 * simply never entered. That is why an orphan handle is worth reading:
 * `answer-undo` was defined, and nothing in the repo named it.
 *
 * What is NOT here: a flow. Exercising this for real would delete something of
 * his, and `qa/RIG_CONTRACT.md` §3 is why that is not a test.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { undoApi, type ChatMessage } from "@/api/ai";

import { AnswerActions } from "../AnswerActions";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

const answer = (over: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: 4120,
    role: "assistant",
    body: "I added a note about the lease.",
    sources: [],
    links: [],
    reactions: [],
    sentByMe: false,
    deleted: false,
    undoable: true,
    undoneAt: null,
    ...over,
  }) as ChatMessage;

afterEach(() => jest.restoreAllMocks());

describe("taking back what an answer wrote", () => {
  it("offers the control, named, when the reply is undoable", () => {
    render(<AnswerActions message={answer()} showUndo onUndone={() => {}} />);

    const undo = screen.getByTestId("answer-undo");
    expect(undo).toBeTruthy();
    // The name says what it undoes. "Undo" alone, read out of context by a
    // screen reader on a row of icon buttons, does not.
    expect(undo).toHaveAccessibleName("Undo what this created");
  });

  it("does NOT offer it when the reply is not the newest undoable one", () => {
    // `showUndo` is true for the newest undoable reply only — a stack of
    // reversals is a different feature. See `src/api/ai.ts`.
    render(<AnswerActions message={answer()} showUndo={false} onUndone={() => {}} />);
    expect(screen.queryByTestId("answer-undo")).toBeNull();
  });

  it("calls the endpoint ONCE and hands back the updated message", async () => {
    const updated = answer({ undoneAt: "2026-09-19T21:00:00Z" });
    const undo = jest.spyOn(undoApi, "undo").mockResolvedValue({ undoneCount: 1, message: updated });
    const onUndone = jest.fn();

    render(<AnswerActions message={answer()} showUndo onUndone={onUndone} />);
    fireEvent.press(screen.getByTestId("answer-undo"));

    await waitFor(() => expect(onUndone).toHaveBeenCalledWith(updated));
    // Once. A double-fire here is a second DELETE against his records.
    expect(undo).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledWith(4120);
  });

  it("says so when the server refuses, and keeps the answer on screen", async () => {
    jest.spyOn(undoApi, "undo").mockRejectedValue(new Error("nope"));

    render(<AnswerActions message={answer()} showUndo onUndone={() => {}} />);
    fireEvent.press(screen.getByTestId("answer-undo"));

    // `answer-undo-error` was unreachable by anything before this file.
    await waitFor(() => expect(screen.getByTestId("answer-undo-error")).toBeTruthy());
    expect(screen.getByTestId("answer-actions")).toBeTruthy();
  });

  it("shows it as already taken back rather than offering it twice", () => {
    render(
      <AnswerActions message={answer({ undoneAt: "2026-09-19T21:00:00Z" })} showUndo onUndone={() => {}} />,
    );
    expect(screen.getByTestId("answer-undone")).toBeTruthy();
    expect(screen.queryByTestId("answer-undo")).toBeNull();
  });
});
