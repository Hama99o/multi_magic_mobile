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
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { feedbackApi, undoApi, type ChatMessage } from "@/api/ai";

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

/**
 * BOTH, AND THE ORDER MATTERS — the third time this class bit tonight.
 *
 * `jest.mock("expo-clipboard", …)` creates ONE `jest.fn()` per module registry,
 * and `restoreAllMocks` restores a spy to exactly that function — **with its
 * call history intact**. So a later test asserting "nothing was copied" saw
 * three calls from the three tests before it and failed for a reason that had
 * nothing to do with the code. It passed alone, which is the shape that reads
 * as load-flake.
 *
 * `clearAllMocks` at the START is the only ordering that cannot be got wrong:
 * `queryClient.ts` makes the same argument about `gcTime`, and
 * `announce.test.tsx` hit the same thing an hour ago. Restore undoes the
 * REPLACEMENT; it does not erase what was recorded.
 */
beforeEach(() => jest.clearAllMocks());
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


describe("copying an answer out", () => {
  /**
   * `answer-copied` was named by no flow and no test. The confirmation is the
   * only thing that tells somebody the press worked — `setStringAsync` is
   * silent, and an answer about somebody's money is the case where they will
   * go and paste it somewhere that matters.
   */
  it("puts the answer on the clipboard, exactly as written", async () => {
    const set = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    render(<AnswerActions message={answer()} showUndo={false} onUndone={() => {}} />);

    fireEvent.press(screen.getByLabelText("Copy answer"));

    await waitFor(() => expect(set).toHaveBeenCalledWith("I added a note about the lease."));
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("says so, because setStringAsync is silent", async () => {
    jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    render(<AnswerActions message={answer()} showUndo={false} onUndone={() => {}} />);
    expect(screen.queryByTestId("answer-copied")).toBeNull();

    fireEvent.press(screen.getByLabelText("Copy answer"));

    await waitFor(() => expect(screen.getByTestId("answer-copied")).toBeTruthy());
  });

  it("takes the confirmation back down again", async () => {
    jest.useFakeTimers();
    jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    render(<AnswerActions message={answer()} showUndo={false} onUndone={() => {}} />);

    fireEvent.press(screen.getByLabelText("Copy answer"));
    await waitFor(() => expect(screen.getByTestId("answer-copied")).toBeTruthy());

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.queryByTestId("answer-copied")).toBeNull();
    jest.useRealTimers();
  });

  it("copies NOTHING when the answer has no text", async () => {
    // A deleted or empty reply. Writing "" to the clipboard would silently wipe
    // whatever the person had already put there.
    const set = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    render(<AnswerActions message={answer({ body: "" })} showUndo={false} onUndone={() => {}} />);

    fireEvent.press(screen.getByLabelText("Copy answer"));

    await waitFor(() => expect(screen.queryByTestId("answer-copied")).toBeNull());
    expect(set).not.toHaveBeenCalled();
  });
});

/**
 * THE RATING THAT REVERTS, WHICH IS INVISIBLE WHEN IT WORKS.
 *
 * Found by `multi-magic-mobile-41` walking every mutating call in `src/api/`
 * backwards, asking of each one whether anything on this device would look
 * different if the request never happened. `ai/feedbacks` looked exactly like
 * the parity bug — `await`, response unread, no test, no flow — and is not:
 * `rate()` sets the thumb optimistically and `setRating(null)` in the `catch`
 * un-selects it in front of the person who pressed it. A decision, with a
 * comment saying a failed rating is not worth interrupting anybody over.
 *
 * **But nothing held it.** Optimistic-then-revert has no symptom while it
 * works, so a regression is silent: the thumb simply stays lit on a request
 * that failed, and the person believes their rating was recorded. That is the
 * same family as the parity bug — a wrong state with nothing on screen to
 * contradict it — which is why it is worth a test even though the feature is
 * small.
 */
// ── A TOGGLE, ONE THUMB AT A TIME, AND IT REMEMBERS ───────────────────────
//
// The owner, 2026-09-24: "when we click it should work toggle style, you
// can't click both." And a rating that vanished on remount looked like the
// press had done nothing.
describe("the thumbs", () => {
  const lit = (id: string) => screen.getByTestId(id).props.accessibilityState.selected;

  it("start from the rating the server holds, not from nothing", () => {
    render(<AnswerActions message={answer({ rating: "negative" })} onUndone={jest.fn()} showUndo={false} />);
    expect(lit("answer-down")).toBe(true);
    expect(lit("answer-up")).toBe(false);
  });

  it("pressing the other thumb REPLACES the rating — never both", async () => {
    const rate = jest.spyOn(feedbackApi, "rate").mockResolvedValue(undefined as never);
    render(<AnswerActions message={answer({ rating: "positive" })} onUndone={jest.fn()} showUndo={false} />);

    fireEvent.press(screen.getByTestId("answer-down"));

    await waitFor(() => expect(lit("answer-down")).toBe(true));
    expect(lit("answer-up")).toBe(false);
    expect(rate).toHaveBeenCalledWith(4120, "negative");
  });

  it("pressing the LIT thumb clears it, so a mis-tap is not permanent", async () => {
    const clear = jest.spyOn(feedbackApi, "clear").mockResolvedValue(undefined as never);
    const onRated = jest.fn();
    render(
      <AnswerActions message={answer({ rating: "positive" })} onUndone={jest.fn()} onRated={onRated} showUndo={false} />,
    );

    fireEvent.press(screen.getByTestId("answer-up"));

    await waitFor(() => expect(lit("answer-up")).toBe(false));
    expect(clear).toHaveBeenCalledWith(4120);
    // Merged back, so the next mount starts unrated too.
    expect(onRated).toHaveBeenCalledWith(expect.objectContaining({ id: 4120, rating: null }));
  });

  it("a failed CLEAR puts the thumb back as it was, not to unrated", async () => {
    jest.spyOn(feedbackApi, "clear").mockRejectedValue(new Error("network"));
    render(<AnswerActions message={answer({ rating: "positive" })} onUndone={jest.fn()} showUndo={false} />);

    fireEvent.press(screen.getByTestId("answer-up"));

    await waitFor(() => expect(lit("answer-up")).toBe(true));
  });

  it("hands the new rating back so it survives a remount", async () => {
    jest.spyOn(feedbackApi, "rate").mockResolvedValue(undefined as never);
    const onRated = jest.fn();
    render(<AnswerActions message={answer()} onUndone={jest.fn()} onRated={onRated} showUndo={false} />);

    fireEvent.press(screen.getByTestId("answer-up"));

    await waitFor(() => expect(onRated).toHaveBeenCalledWith(expect.objectContaining({ rating: "positive" })));
  });
});

// ── "WHAT WAS WRONG?" AFTER A THUMBS-DOWN ────────────────────────────────
// multi_magic 357dd7a: the reason reaches the model ("Why: …"). The thumb
// saves at once; the reason is optional, asked only on a thumbs-DOWN.
describe("the reason for a thumbs-down", () => {
  const renderIt = (over: Partial<ChatMessage> = {}) =>
    render(<AnswerActions message={answer(over)} onUndone={jest.fn()} showUndo={false} />);

  it("is asked after a thumbs-DOWN, with the thumb already saved", async () => {
    const rate = jest.spyOn(feedbackApi, "rate").mockResolvedValue(undefined as never);
    renderIt();
    fireEvent.press(screen.getByTestId("answer-down"));
    expect(await screen.findByTestId("feedback-reason")).toBeTruthy();
    // Saved WITHOUT waiting for a reason.
    await waitFor(() => expect(rate).toHaveBeenCalledWith(4120, "negative"));
  });

  it("is never asked on a thumbs-up", async () => {
    jest.spyOn(feedbackApi, "rate").mockResolvedValue(undefined as never);
    renderIt();
    fireEvent.press(screen.getByTestId("answer-up"));
    await waitFor(() => expect(screen.getByTestId("answer-up").props.accessibilityState.selected).toBe(true));
    expect(screen.queryByTestId("feedback-reason")).toBeNull();
  });

  it("is not asked when the press CLEARS a thumbs-down", async () => {
    jest.spyOn(feedbackApi, "clear").mockResolvedValue(undefined as never);
    renderIt({ rating: "negative" });
    fireEvent.press(screen.getByTestId("answer-down"));
    await waitFor(() => expect(screen.getByTestId("answer-down").props.accessibilityState.selected).toBe(false));
    expect(screen.queryByTestId("feedback-reason")).toBeNull();
  });

  it("sends the words as the comment, then says so and closes", async () => {
    const rate = jest.spyOn(feedbackApi, "rate").mockResolvedValue(undefined as never);
    renderIt();
    fireEvent.press(screen.getByTestId("answer-down"));
    fireEvent.changeText(await screen.findByTestId("feedback-reason-input"), "wrong Aisha");
    fireEvent.press(screen.getByTestId("feedback-reason-send"));
    await waitFor(() => expect(rate).toHaveBeenCalledWith(4120, "negative", "wrong Aisha"));
    await waitFor(() => expect(screen.queryByTestId("feedback-reason")).toBeNull());
    expect(screen.getByTestId("answer-reason-sent")).toBeTruthy();
  });

  it("Skip closes it and sends nothing more; the thumb stays down", async () => {
    const rate = jest.spyOn(feedbackApi, "rate").mockResolvedValue(undefined as never);
    renderIt();
    fireEvent.press(screen.getByTestId("answer-down"));
    fireEvent.press(await screen.findByTestId("feedback-reason-skip"));
    await waitFor(() => expect(screen.queryByTestId("feedback-reason")).toBeNull());
    expect(rate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("answer-down").props.accessibilityState.selected).toBe(true);
  });

  it("a failed send keeps the dialog open, with the words still in it", async () => {
    jest.spyOn(feedbackApi, "rate")
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error("network"));
    renderIt();
    fireEvent.press(screen.getByTestId("answer-down"));
    fireEvent.changeText(await screen.findByTestId("feedback-reason-input"), "wrong Aisha");
    fireEvent.press(screen.getByTestId("feedback-reason-send"));
    await waitFor(() => expect(screen.getByTestId("feedback-reason-send").props.accessibilityState?.busy).toBeFalsy());
    expect(screen.getByTestId("feedback-reason")).toBeTruthy();
    expect(screen.getByTestId("feedback-reason-input").props.value).toBe("wrong Aisha");
  });
});

describe("a rating that the server refuses", () => {
  it("lights the thumb immediately, because waiting for a round trip to show a press is worse", async () => {
    jest.spyOn(feedbackApi, "rate").mockResolvedValue(undefined as never);
    render(<AnswerActions message={answer()} onUndone={jest.fn()} showUndo={false} />);

    fireEvent.press(screen.getByTestId("answer-up"));

    await waitFor(() =>
      expect(screen.getByTestId("answer-up").props.accessibilityState.selected).toBe(true),
    );
  });

  it("UN-LIGHTS it when the request fails, rather than leaving a rating nobody recorded", async () => {
    // The assertion this file exists for. Without `setRating(null)` in the
    // catch the thumb stays lit on a failed request — no error, no toast, and
    // a person who believes they rated an answer that carries no rating.
    jest.spyOn(feedbackApi, "rate").mockRejectedValue(new Error("network"));
    render(<AnswerActions message={answer()} onUndone={jest.fn()} showUndo={false} />);

    fireEvent.press(screen.getByTestId("answer-up"));

    await waitFor(() =>
      expect(screen.getByTestId("answer-up").props.accessibilityState.selected).toBe(false),
    );
  });
});
