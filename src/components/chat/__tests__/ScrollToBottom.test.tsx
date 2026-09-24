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
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import { ScrollToBottom, useAwayFromBottom, useNewestAnchor } from "../ScrollToBottom";

/** A scroll event `fromBottom` pixels above the end of the content. */
const scrolled = (fromBottom: number) =>
  ({
    nativeEvent: {
      contentOffset: { y: 1000 - fromBottom },
      contentSize: { height: 1000 + 400 },
      layoutMeasurement: { height: 400 },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

/** The viewport, in every fixture below. */
const VIEWPORT = 400;

/** A scroll event spelled out, for the cases where the numbers are the point. */
const at = (offset: number, content: number) =>
  ({
    nativeEvent: {
      contentOffset: { y: offset },
      contentSize: { height: content },
      layoutMeasurement: { height: VIEWPORT },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

const laidOut = (height: number) =>
  ({ nativeEvent: { layout: { height } } }) as LayoutChangeEvent;

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

describe("what counts as away from the bottom", () => {
  it("stays hidden while the newest message is still on screen", () => {
    const { result } = renderHook(() => useAwayFromBottom(fakeList().ref));
    act(() => result.current.onScroll(scrolled(40)));
    expect(result.current.awayFromBottom).toBe(false);
  });

  it("appears once the reader has genuinely left the bottom", () => {
    const { result } = renderHook(() => useAwayFromBottom(fakeList().ref));
    act(() => result.current.onScroll(scrolled(400)));
    expect(result.current.awayFromBottom).toBe(true);
  });

  it("does not flicker just past the newest reply — the threshold is wider than a finger", () => {
    // A small threshold makes the button blink in and out while somebody reads
    // the last answer, and a control that flickers reads as a fault in the
    // screen rather than as an offer.
    const { result } = renderHook(() => useAwayFromBottom(fakeList().ref));
    act(() => result.current.onScroll(scrolled(120)));
    expect(result.current.awayFromBottom).toBe(false);
  });

  it("goes away again when the reader returns, so pressing it does not leave it behind", () => {
    const { result } = renderHook(() => useAwayFromBottom(fakeList().ref));
    act(() => result.current.onScroll(scrolled(600)));
    expect(result.current.awayFromBottom).toBe(true);
    act(() => result.current.onScroll(scrolled(0)));
    expect(result.current.awayFromBottom).toBe(false);
  });
});

/**
 * THE BUG HE REPORTED: *"when i open big conversation it did not scroll 1000
 * percent to bottom man and i should see arrow button to go to latest
 * message."*
 *
 * A long list reports its height in instalments, so the first `scrollToEnd`
 * aims at a bottom that is about to move. What broke was the GATE on chasing
 * it again: our own jump fires a scroll event, measured against a height that
 * has already grown, and the old code read that as "the reader scrolled up"
 * and stopped following — half way down, on the first batch.
 *
 * Every number below is the viewport (400) and a content height that grows,
 * which is the only shape in which the bug exists. A short conversation could
 * not show it and did not.
 */
describe("opening a big conversation", () => {
  it("keeps chasing the bottom as the list reports more of itself", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    // First batch: 1000 tall, so the end is offset 600.
    act(() => result.current.onContentSizeChange(0, 1000));
    expect(list.jumps).toHaveLength(1);

    // OUR OWN JUMP, measured late: the offset is the one we asked for and the
    // height has already grown to 3000, which reads as 2000px from the bottom.
    // This is the event that used to switch the follow off.
    act(() => result.current.onScroll(at(600, 3000)));

    // Second batch. The follow must still be on.
    act(() => result.current.onContentSizeChange(0, 3000));
    expect(list.jumps).toHaveLength(2);
    expect(list.jumps.at(-1)?.animated).toBe(false);
  });

  it("does not offer the button for a jump of its own", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onContentSizeChange(0, 1000));
    act(() => result.current.onScroll(at(600, 3000)));

    // 2000px from the bottom by the numbers, and still not the reader's doing.
    expect(result.current.awayFromBottom).toBe(false);
  });

  it("settles, and then the reader's own scroll is read normally again", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onContentSizeChange(0, 3000));
    // The chase arrives: offset 2600 of 3000, viewport 400.
    act(() => result.current.onScroll(at(2600, 3000)));
    expect(result.current.awayFromBottom).toBe(false);

    // Now they scroll up themselves.
    act(() => result.current.onScrollBeginDrag());
    act(() => result.current.onScroll(at(1000, 3000)));
    expect(result.current.awayFromBottom).toBe(true);
  });
});

describe("once the reader has taken over", () => {
  it("a message arriving does not drag them back to the bottom", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onScrollBeginDrag());
    act(() => result.current.onScroll(at(1000, 3000)));
    expect(result.current.awayFromBottom).toBe(true);

    list.clear();
    act(() => result.current.onContentSizeChange(0, 3400));
    expect(list.jumps).toHaveLength(0);
  });

  it("the keyboard does not drag them back either", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onScrollBeginDrag());
    act(() => result.current.onScroll(at(1000, 3000)));

    list.clear();
    act(() => result.current.onListLayout(laidOut(250)));
    expect(list.jumps).toHaveLength(0);
  });

  it("scrolling back down resumes following, so they are not stranded", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onScrollBeginDrag());
    act(() => result.current.onScroll(at(1000, 3000)));
    act(() => result.current.onScroll(at(2600, 3000)));
    expect(result.current.awayFromBottom).toBe(false);

    list.clear();
    act(() => result.current.onContentSizeChange(0, 3400));
    expect(list.jumps).toHaveLength(1);
  });

  // ── SENDING WHILE ALREADY AT THE BOTTOM ──────────────────────────────────
  //
  // Measured 2026-09-24 on `qa_phone4`: send called `toBottom` (animated) in
  // the same instant the new question's height arrived (unanimated follow),
  // and the two scrolls in flight shook the thread +81 / -81 / +81 px.
  it("does not animate when already at the bottom — the follow makes the one move", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));
    act(() => result.current.onScroll(at(2600, 3000)));
    list.clear();

    act(() => result.current.toBottom());
    expect(list.jumps.filter((j) => j.animated)).toHaveLength(0);

    act(() => result.current.onContentSizeChange(0, 3100));
    expect(list.jumps.every((j) => !j.animated)).toBe(true);
    expect(list.jumps.length).toBeGreaterThan(0);
  });

  it("the button returns them, animated, and following resumes", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onScrollBeginDrag());
    act(() => result.current.onScroll(at(1000, 3000)));

    act(() => result.current.toBottom());
    expect(list.jumps.at(-1)?.animated).toBe(true);
    expect(result.current.awayFromBottom).toBe(false);

    list.clear();
    act(() => result.current.onContentSizeChange(0, 3400));
    expect(list.jumps).toHaveLength(1);
  });
});

/**
 * THE KEYBOARD, still: `avoidKeyboard` changes the list's height without
 * changing its offset, so the newest message ends up behind the keyboard
 * unless something re-scrolls. Kept as its own case because this is the defect
 * `docs/TESTING.md` §5 is about, and it now travels through a different path.
 */
it("re-scrolls when the keyboard shrinks the list", () => {
  const list = fakeList();
  const { result } = renderHook(() => useAwayFromBottom(list.ref));

  act(() => result.current.onListLayout(laidOut(250)));
  expect(list.jumps.at(-1)?.animated).toBe(false);
});

/**
 * HIS SECOND REPORT: *"when the send message is very big and it takes all
 * screen then it did not scroll to bottom, still have this problem but with
 * big message."*
 *
 * One message taller than the viewport breaks the landing in a way a short one
 * never could, because a scroll issued inside `onContentSizeChange` is handed
 * to the list before the new height is committed — so it goes to the OLD
 * bottom. One extra line short is invisible; one screen short is what he saw.
 *
 * The viewport is 400 here and the content 4000, which is the shape of the
 * complaint: a single answer ten times the height of the screen.
 */
describe("a message taller than the screen", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("is chased again on the next frame, when the new height has landed", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onContentSizeChange(0, 4000));
    // The one that may travel to the old bottom.
    expect(list.jumps).toHaveLength(1);

    act(() => jest.runOnlyPendingTimers());
    // And the one that cannot, because the frame has passed.
    expect(list.jumps).toHaveLength(2);
  });

  it("retries when it lands short, and stays pinned when it arrives", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onContentSizeChange(0, 4000));
    // Still at the top: the jump went to a bottom that had moved.
    act(() => result.current.onScroll(at(0, 4000)));
    expect(result.current.awayFromBottom).toBe(false); // ours, not his

    // The retry arrives.
    act(() => result.current.onScroll(at(3600, 4000)));
    expect(result.current.awayFromBottom).toBe(false);

    // And following is still on afterwards.
    list.clear();
    act(() => result.current.onContentSizeChange(0, 4400));
    expect(list.jumps.length).toBeGreaterThan(0);
  });

  /**
   * THE HOLE IN THE FIRST FIX, and it produced both of his complaints at once:
   * a chase that never arrived suppressed the button for ever, so the one case
   * where somebody is stranded was the one case offering no way back.
   */
  it("gives up after three attempts and offers the button", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onContentSizeChange(0, 4000));
    act(() => result.current.onScroll(at(0, 4000)));
    expect(result.current.awayFromBottom).toBe(false);
    act(() => result.current.onScroll(at(0, 4000)));
    expect(result.current.awayFromBottom).toBe(false);

    // Three attempts is enough to tell the difference between a frame behind
    // and genuinely stuck.
    act(() => result.current.onScroll(at(0, 4000)));
    expect(result.current.awayFromBottom).toBe(true);
  });

  it("and the button still works from there", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onContentSizeChange(0, 4000));
    act(() => result.current.onScroll(at(0, 4000)));
    act(() => result.current.onScroll(at(0, 4000)));
    act(() => result.current.onScroll(at(0, 4000)));
    expect(result.current.awayFromBottom).toBe(true);

    act(() => result.current.toBottom());
    expect(list.jumps.at(-1)?.animated).toBe(true);
    expect(result.current.awayFromBottom).toBe(false);
  });
});

/**
 * *"it did not go to bottom when i come to session."*
 *
 * Two things were fighting the opening scroll, and this is the second: a list
 * opens at offset 0, which IS the top, so `onStartReached` fired on mount and
 * an older page was prepended ABOVE while we were trying to land at the
 * bottom. The target moved every time it arrived — and nobody had asked for
 * that history; they had only not left the top yet.
 *
 * `settled` is what the screens hold that fetch on, so what matters is WHEN it
 * turns true: not before the first landing resolves, and by every route that
 * can resolve one.
 */
describe("holding the older page until the landing is done", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("is not settled on mount, so nothing is fetched above us", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));
    expect(result.current.settled).toBe(false);

    // Still not, while the opening chase is in flight.
    act(() => result.current.onContentSizeChange(0, 4000));
    expect(result.current.settled).toBe(false);
  });

  it("settles when the chase arrives", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onContentSizeChange(0, 4000));
    act(() => result.current.onScroll(at(3600, 4000)));
    expect(result.current.settled).toBe(true);
  });

  /**
   * THE CASE HIS THIRD REPORT IS ABOUT. A jump that moves the list nowhere
   * fires no scroll event, so nothing counted the chase out and the button
   * stayed hidden until he dragged. The clock resolves it instead.
   */
  it("settles on the clock when the list never moves, and offers the button", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    // The opening sequence, in its real order: the list lays out, reports its
    // height, and the jump we make achieves nothing — so NOT ONE scroll event
    // follows. That is the whole bug: every attempt was counted in `onScroll`.
    act(() => result.current.onListLayout(laidOut(VIEWPORT)));
    act(() => result.current.onContentSizeChange(0, 4000));
    expect(result.current.awayFromBottom).toBe(false);
    expect(result.current.settled).toBe(false);

    act(() => jest.advanceTimersByTime(400));
    expect(result.current.settled).toBe(true);
    // 3600px from the bottom, and now it says so.
    expect(result.current.awayFromBottom).toBe(true);
  });

  it("settles when a finger takes over", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onContentSizeChange(0, 4000));
    act(() => result.current.onScrollBeginDrag());
    expect(result.current.settled).toBe(true);
  });

  /**
   * A failed chase is not the reader choosing to be there. An answer this tall
   * is very likely still laying out, so the next growth gets a fresh set of
   * attempts rather than an app that has quietly stopped following.
   */
  it("keeps following after a chase that never arrived", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onContentSizeChange(0, 4000));
    act(() => result.current.onScroll(at(0, 4000)));
    act(() => result.current.onScroll(at(0, 4000)));
    act(() => result.current.onScroll(at(0, 4000)));
    expect(result.current.awayFromBottom).toBe(true);

    list.clear();
    act(() => result.current.onContentSizeChange(0, 6000));
    expect(list.jumps.length).toBeGreaterThan(0);
  });
});

/**
 * *"when i click on arrow it go top and stop on big message each time, but for
 * small message it works."*
 *
 * Landing on the TOP is not a near miss, and `VirtualizedList.js` says why in
 * its own source:
 *
 *     const frame = this._listMetrics.getCellMetricsApprox(veryLast, …);
 *     const offset = Math.max(0, frame.offset + frame.length
 *                                + this._footerLength - visibleLength);
 *
 * **Approx.** An unrendered last cell has no measured height, so it is
 * estimated from the average row — and when one message is ten screens tall
 * while the rest are two lines, that is an order out, not a rounding. The
 * `Math.max(0, …)` then turns the underestimate into offset 0: the top. Small
 * messages estimate correctly, which is exactly the split he described.
 *
 * `contentSize.height` from the native scroll event is not an estimate, so the
 * hook does the arithmetic itself. These pin that it does.
 */
describe("going to the bottom by measurement rather than by approximation", () => {
  it("uses the measured content height once there is one", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onListLayout(laidOut(VIEWPORT)));
    act(() => result.current.onContentSizeChange(0, 4000));

    // 4000 of content in a 400 viewport: the bottom is 3600, and nothing about
    // that number came from the list's opinion of its own rows.
    expect(list.jumps.at(-1)?.offset).toBe(3600);
  });

  it("the button lands on the bottom, which is where it used to land on the top", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    // The reader is at the very top of a conversation with one huge message.
    act(() => result.current.onScroll(at(0, 4000)));
    expect(result.current.awayFromBottom).toBe(true);

    act(() => result.current.toBottom());
    expect(list.jumps.at(-1)).toEqual({ animated: true, offset: 3600 });
  });

  it("falls back to scrollToEnd only before anything has been measured", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    // No layout yet: we have a height but nothing to subtract from it, and
    // guessing would be the very mistake above.
    act(() => result.current.onContentSizeChange(0, 4000));
    expect(list.scrollToEnd).toHaveBeenCalled();
    expect(list.scrollToOffset).not.toHaveBeenCalled();
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
