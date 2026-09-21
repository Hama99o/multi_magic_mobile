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

/** A stand-in for the `FlatList`, so the chases are countable. */
const fakeList = () => {
  const scrollToEnd = jest.fn();
  return { ref: { current: { scrollToEnd } }, scrollToEnd };
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
    expect(list.scrollToEnd).toHaveBeenCalledTimes(1);

    // OUR OWN JUMP, measured late: the offset is the one we asked for and the
    // height has already grown to 3000, which reads as 2000px from the bottom.
    // This is the event that used to switch the follow off.
    act(() => result.current.onScroll(at(600, 3000)));

    // Second batch. The follow must still be on.
    act(() => result.current.onContentSizeChange(0, 3000));
    expect(list.scrollToEnd).toHaveBeenCalledTimes(2);
    expect(list.scrollToEnd).toHaveBeenLastCalledWith({ animated: false });
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

    list.scrollToEnd.mockClear();
    act(() => result.current.onContentSizeChange(0, 3400));
    expect(list.scrollToEnd).not.toHaveBeenCalled();
  });

  it("the keyboard does not drag them back either", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onScrollBeginDrag());
    act(() => result.current.onScroll(at(1000, 3000)));

    list.scrollToEnd.mockClear();
    act(() => result.current.onListLayout(laidOut(250)));
    expect(list.scrollToEnd).not.toHaveBeenCalled();
  });

  it("scrolling back down resumes following, so they are not stranded", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onScrollBeginDrag());
    act(() => result.current.onScroll(at(1000, 3000)));
    act(() => result.current.onScroll(at(2600, 3000)));
    expect(result.current.awayFromBottom).toBe(false);

    list.scrollToEnd.mockClear();
    act(() => result.current.onContentSizeChange(0, 3400));
    expect(list.scrollToEnd).toHaveBeenCalledTimes(1);
  });

  it("the button returns them, animated, and following resumes", () => {
    const list = fakeList();
    const { result } = renderHook(() => useAwayFromBottom(list.ref));

    act(() => result.current.onScrollBeginDrag());
    act(() => result.current.onScroll(at(1000, 3000)));

    act(() => result.current.toBottom());
    expect(list.scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
    expect(result.current.awayFromBottom).toBe(false);

    list.scrollToEnd.mockClear();
    act(() => result.current.onContentSizeChange(0, 3400));
    expect(list.scrollToEnd).toHaveBeenCalledTimes(1);
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
  expect(list.scrollToEnd).toHaveBeenCalledWith({ animated: false });
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
    expect(list.scrollToEnd).toHaveBeenCalledTimes(1);

    act(() => jest.runOnlyPendingTimers());
    // And the one that cannot, because the frame has passed.
    expect(list.scrollToEnd).toHaveBeenCalledTimes(2);
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
    list.scrollToEnd.mockClear();
    act(() => result.current.onContentSizeChange(0, 4400));
    expect(list.scrollToEnd).toHaveBeenCalled();
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
    expect(list.scrollToEnd).toHaveBeenLastCalledWith({ animated: true });
    expect(result.current.awayFromBottom).toBe(false);
  });
});
