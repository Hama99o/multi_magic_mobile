/**
 * WHAT A SCREEN READER IS TOLD WHEN SOMETHING CHANGES.
 *
 * `docs/ACCESSIBILITY.md` D1: this app had ONE live region — a field error —
 * and its entire product is an answer that arrives asynchronously over
 * ActionCable. A person using a screen reader posted a question and got
 * silence, with no way to know the reply had landed except to swipe the screen
 * looking for it.
 *
 * `ThinkingDots` is the sharpest case and the reason these tests exist. Its own
 * header says the 45-second copy change is there so that "a socket that died
 * silently must not look like a model that is thinking" — and a label that
 * changes inside a view nothing is watching is not a change anybody is told
 * about. The safeguard existed and did not reach the people who cannot see the
 * dots stop.
 *
 * These assert the SPOKEN half only. Whether TalkBack or VoiceOver actually
 * voices them in the order a person wants is a device question.
 */
import { render, screen, act } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { ThinkingDots } from "../ThinkingDots";
import { MessageRow } from "../MessageRow";
import type { ChatMessage } from "@/api/ai";

const message = (over: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: 1,
    role: "assistant",
    body: "Your rent is 1,284.50 EUR.",
    sources: [],
    links: [],
    sentByMe: false,
    deleted: false,
    ...over,
  }) as ChatMessage;

describe("the wait is announced, not only drawn", () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("ThinkingDots is a polite live region", () => {
    render(<ThinkingDots />);
    expect(screen.getByTestId("thinking").props.accessibilityLiveRegion).toBe("polite");
  });

  it("says so when the wait turns slow, which is the whole point of the copy change", () => {
    render(<ThinkingDots />);
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(45_000);
    });

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      expect.stringContaining("taking a while"),
    );
  });
});

describe("who is speaking, for someone who cannot see the shape", () => {
  /**
   * MessageRow's header: "authorship is legible by SHAPE before anybody reads a
   * word" — a bubble on the right, an unbubbled serif for the answer. That is a
   * good decision and a sighted one. The fix adds the spoken half; it changes
   * nothing anybody looks at.
   */
  it("names the person for their own question", () => {
    render(
      <MessageRow
        message={message({ role: "user", sentByMe: true, body: "What is my rent?" })}
        onOpenSource={() => {}}
      />,
    );
    expect(screen.getByLabelText(/What is my rent\?/)).toBeTruthy();
    expect(screen.getByLabelText(/^You asked/)).toBeTruthy();
  });

  it("names the assistant for an answer", () => {
    render(<MessageRow message={message()} onOpenSource={() => {}} />);
    expect(screen.getByLabelText(/^Assistant/)).toBeTruthy();
  });

  it("does NOT collapse the answer, so a link inside it stays reachable", () => {
    // docs/ACCESSIBILITY.md N1: an accessibility element groups its children on
    // iOS. Attributing the answer by wrapping it would have made every link in
    // an answer unreachable — the bug this audit reported, introduced by its
    // own fix. So the name goes on the first text block, never on the container.
    render(
      <MessageRow
        message={message({ body: "It is in [the lease](https://example.com/lease.pdf)." })}
        onOpenSource={() => {}}
        onOpenLink={() => {}}
      />,
    );
    expect(screen.getByRole("link")).toBeTruthy();
  });
});
