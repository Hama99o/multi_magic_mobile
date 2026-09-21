/**
 * The way back to the newest message.
 *
 * His request, and it names both threads: *"when we scroll up we dont have
 * scroll to down button in conversation it should exist both for ai and
 * message conversation."* One component serves both, so these tests are the
 * only place the behaviour is pinned — if it drifts, it drifts in both at once
 * and this is what says so.
 */
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { renderHook } from "@testing-library/react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import { ScrollToBottom, useAwayFromBottom } from "../ScrollToBottom";

/** A scroll event `fromBottom` pixels above the end of the content. */
const scrolled = (fromBottom: number) =>
  ({
    nativeEvent: {
      contentOffset: { y: 1000 - fromBottom },
      contentSize: { height: 1000 + 400 },
      layoutMeasurement: { height: 400 },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

describe("the button appears only when it means something", () => {
  it("renders nothing at the bottom, where it would be one more thing over the conversation", () => {
    render(<ScrollToBottom visible={false} onPress={jest.fn()} />);
    expect(screen.queryByTestId("scroll-to-bottom")).toBeNull();
  });

  it("is a named control rather than a bare glyph, because a screen reader reads the name", () => {
    render(<ScrollToBottom visible onPress={jest.fn()} />);
    const button = screen.getByTestId("scroll-to-bottom");
    // `docs/ACCESSIBILITY.md`: an accessibility string is a user-facing string
    // and comes from `t()`. An icon-only button with no label announces
    // nothing at all.
    expect(button.props.accessibilityLabel).toBe("Scroll to the newest message");
    expect(button.props.accessibilityRole).toBe("button");
  });

  it("calls back when pressed", () => {
    const onPress = jest.fn();
    render(<ScrollToBottom visible onPress={onPress} />);
    fireEvent.press(screen.getByTestId("scroll-to-bottom"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("what counts as away from the bottom", () => {
  it("stays hidden while the newest message is still on screen", () => {
    const { result } = renderHook(() => useAwayFromBottom());
    act(() => result.current.onScroll(scrolled(40)));
    expect(result.current.awayFromBottom).toBe(false);
  });

  it("appears once the reader has genuinely left the bottom", () => {
    const { result } = renderHook(() => useAwayFromBottom());
    act(() => result.current.onScroll(scrolled(400)));
    expect(result.current.awayFromBottom).toBe(true);
  });

  it("does not flicker just past the newest reply — the threshold is wider than a finger", () => {
    // A small threshold makes the button blink in and out while somebody reads
    // the last answer, and a control that flickers reads as a fault in the
    // screen rather than as an offer.
    const { result } = renderHook(() => useAwayFromBottom());
    act(() => result.current.onScroll(scrolled(120)));
    expect(result.current.awayFromBottom).toBe(false);
  });

  it("goes away again when the reader returns, so pressing it does not leave it behind", () => {
    const { result } = renderHook(() => useAwayFromBottom());
    act(() => result.current.onScroll(scrolled(600)));
    expect(result.current.awayFromBottom).toBe(true);
    act(() => result.current.onScroll(scrolled(0)));
    expect(result.current.awayFromBottom).toBe(false);
  });
});
