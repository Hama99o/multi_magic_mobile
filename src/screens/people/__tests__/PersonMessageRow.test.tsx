/**
 * The message bubble — and one thing this file CANNOT tell you.
 *
 * ── WHAT IT CANNOT SEE ────────────────────────────────────────────────────
 * Reacting to a message was impossible on Android, and every assertion below
 * would have passed the whole time. The bubble rendered its body as
 * `<Text selectable>` inside the `Pressable` that carries `onLongPress`; on
 * Android a selectable Text opens the platform's text-selection ActionMode on
 * long press and CONSUMES the gesture, so the handler never ran and a person
 * long-pressing to react got Copy · Share · Select all.
 *
 * Jest has no platform. The handler was wired, the sheet existed, the
 * `accessibilityHint` correctly announced the gesture — every part was right
 * in the tree, and only the OS knew it had taken the gesture first. QA found
 * it on a device, two screens into `06-people-chat`.
 *
 * **So the gate for that defect is not here.** It is `no-restricted-syntax` in
 * `.eslintrc.js`: a `selectable` inside a long-pressable element is an error.
 * The proof that the gesture WORKS is `06-people-chat` on a device, and
 * nothing in this file should be read as standing in for it.
 *
 * What is below is the wiring — that a long press asks for the sheet at all,
 * and that the bubble does not quietly get its `selectable` back in a way a
 * reviewer would wave through. Worth having, and worth being clear that it is
 * the smaller half.
 */
import { render, screen } from "@testing-library/react-native";
import { PersonMessageRow } from "../PersonMessageRow";
import type { ChatMessage } from "@/api/ai";

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 2311,
    body: "see you at six",
    role: "user",
    sentByMe: true,
    createdAt: "2026-09-19T17:00:00Z",
    reactions: [],
    links: [],
    sources: [],
    ...over,
  } as ChatMessage;
}

describe("the long press that opens the reaction sheet", () => {
  // ── AND THE FIRST VERSION OF THIS TEST WAS VACUOUS ───────────────────────
  //
  // It was `fireEvent(getByTestId("msg-mine-2311"), "longPress")` and then
  // `expect(onLongPress).toHaveBeenCalled()`. I deleted `onLongPress` from the
  // Pressable entirely — the component wired to NOTHING — and it stayed green.
  //
  // RNTL's `fireEvent` walks UP from the host element looking for a handler,
  // and it walks through composite elements too. It reached `PersonMessageRow`
  // itself, found the `onLongPress` prop THE TEST HAD JUST PASSED IN, and
  // called that. The assertion proved the test's own argument existed.
  //
  // So it asserts the handler is on the BUBBLE, where Android will deliver the
  // gesture, and then runs it from there.
  // And `getByTestId(…).props.onLongPress` does not work either: `Pressable`
  // consumes `onLongPress` into the responder system and the host `View` it
  // renders does not carry it. So this reaches for the Pressable itself. The
  // `UNSAFE_` prefix is accurate — it is a structural assertion about the tree
  // rather than a behavioural one, and it is here because the behavioural form
  // cannot be written without the fallback above making it meaningless.
  it("puts the handler on the bubble itself", () => {
    const onLongPress = jest.fn();
    render(<PersonMessageRow message={message()} onLongPress={onLongPress} />);

    // By TYPE does not work: NativeWind's jsx runtime substitutes the RN
    // components, so the `Pressable` imported here is not the one in the tree
    // — `UNSAFE_getAllByType` finds no instances at all. Matching on the
    // testID is what pins it to the BUBBLE: `PersonMessageRow` itself carries
    // `onLongPress` and no testID, so it cannot satisfy this.
    const bubble = screen
      .UNSAFE_getAllByProps({ testID: "msg-mine-2311" })
      .find((node) => node.props.onLongPress !== undefined);

    expect(bubble?.props.onLongPress).toBe(onLongPress);
  });

  // ── THE REGRESSION GUARD, AND ITS LIMIT ──────────────────────────────────
  //
  // This asserts the prop is absent. It does NOT assert the gesture arrives —
  // no Jest test can, because the collision happens in Android's view layer.
  // If this is the only thing standing between the app and a repeat, the
  // eslint rule is doing the real work and this is a note in a test's clothing.
  it("does not make the body selectable, which would eat that long press", () => {
    render(<PersonMessageRow message={message({ body: "see you at six" })} onLongPress={jest.fn()} />);

    const body = screen.getByText("see you at six");

    expect(body.props.selectable).toBeFalsy();
  });

  it("announces the gesture only when there is one", () => {
    const { rerender } = render(<PersonMessageRow message={message()} onLongPress={jest.fn()} />);
    expect(screen.getByTestId("msg-mine-2311").props.accessibilityHint).toBeTruthy();

    // No handler, no hint — otherwise a screen reader is told about an action
    // that is not there, which is the same failure as an action that cannot
    // be performed, arrived at from the other side.
    rerender(<PersonMessageRow message={message()} />);
    expect(screen.getByTestId("msg-mine-2311").props.accessibilityHint).toBeUndefined();
  });
});
