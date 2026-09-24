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

import { ScrollToBottom, useNewestAnchor } from "../ScrollToBottom";

/**
 * A stand-in for the `FlatList`, so the jumps are countable — and so it is
 * visible WHICH WAY each one was made.
 *
 * Both routes are recorded in one ordered log because the hook chooses between
 * them by what it has measured: `scrollToOffset` once a real content height and
 * viewport are known, `scrollToEnd` only before that. A test that watched just
 * one of them would go quiet exactly when the choice changed.
 */
const fakeList = () => {
  const jumps: { animated: boolean; offset?: number }[] = [];
  const scrollToEnd = jest.fn((o?: { animated?: boolean }) => {
    jumps.push({ animated: !!o?.animated });
  });
  const scrollToOffset = jest.fn((p: { offset: number; animated?: boolean }) => {
    jumps.push({ animated: !!p.animated, offset: p.offset });
  });
  return {
    ref: { current: { scrollToEnd, scrollToOffset } },
    scrollToEnd,
    scrollToOffset,
    jumps,
    clear: () => {
      jumps.length = 0;
      scrollToEnd.mockClear();
      scrollToOffset.mockClear();
    },
  };
};

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

/**
 * THE INVERTED LIST'S ANCHOR. Offset 0 is the newest message, so the only
 * scroll this hook may ever issue is the button's — the resize, send and
 * reply cases that the chase above handled issue none, and that is the point.
 */
describe("useNewestAnchor", () => {
  const offset = (y: number) =>
    ({ nativeEvent: { contentOffset: { y }, contentSize: { height: 3000 }, layoutMeasurement: { height: 400 } } }) as unknown as NativeSyntheticEvent<NativeScrollEvent>;

  it("is away only past the threshold, measured from offset 0", () => {
    const list = fakeList();
    const { result } = renderHook(() => useNewestAnchor(list.ref as never));
    act(() => result.current.onScroll(offset(100)));
    expect(result.current.awayFromBottom).toBe(false);
    act(() => result.current.onScroll(offset(600)));
    expect(result.current.awayFromBottom).toBe(true);
  });

  it("scrolls nowhere when already at the newest — the list holds it", () => {
    const list = fakeList();
    const { result } = renderHook(() => useNewestAnchor(list.ref as never));
    act(() => result.current.onScroll(offset(0)));
    act(() => result.current.toBottom());
    expect(list.jumps).toHaveLength(0);
  });

  it("the button makes ONE animated scroll to offset 0, and hides", () => {
    const list = fakeList();
    const { result } = renderHook(() => useNewestAnchor(list.ref as never));
    act(() => result.current.onScroll(offset(1200)));
    act(() => result.current.toBottom());
    expect(list.jumps).toEqual([{ animated: true, offset: 0 }]);
    expect(result.current.awayFromBottom).toBe(false);
  });

  it("keeps history still under a reader, and shows what arrives at the newest", () => {
    const list = fakeList();
    const { result } = renderHook(() => useNewestAnchor(list.ref as never));
    expect(result.current.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: expect.any(Number),
    });
  });
});
