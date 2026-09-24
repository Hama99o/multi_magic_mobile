/**
 * Android's keyboard lift (`KeyboardPadding.tsx`). What this proves: it lifts
 * by KAV's own overlap arithmetic, eases to it instead of jumping, is 0 where
 * the window already resized, and eases back down. What it cannot: that the
 * easing tracks the keyboard, or that the JS thread is free to run it. That is
 * a recording.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Animated, Keyboard, Text, type KeyboardEvent } from "react-native";
import { boundValue, watchTimings } from "@/__tests__/animated";
import { KeyboardPadding, RISE_MS, FALL_MS } from "../KeyboardPadding";

afterEach(() => jest.restoreAllMocks());

type Listener = (e: KeyboardEvent) => void;

function mount() {
  const listeners: Record<string, Listener> = {};
  jest.spyOn(Keyboard, "addListener").mockImplementation((name, fn) => {
    listeners[name] = fn as Listener;
    return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  const { started } = watchTimings();
  render(
    <KeyboardPadding>
      <Text>content</Text>
    </KeyboardPadding>,
  );
  // The wrapper: 40 dp down (under the status bar), 800 dp tall.
  fireEvent(screen.getByTestId("keyboard-padding").parent!.parent!, "layout", {
    nativeEvent: { layout: { x: 0, y: 40, width: 400, height: 800 } },
  });
  // Android sends duration 0 (`ReactRootView.java`); that is the point.
  const show = (screenY: number) =>
    act(() =>
      listeners.keyboardDidShow({
        duration: 0,
        easing: "keyboard",
        endCoordinates: { screenX: 0, screenY, width: 400, height: 840 - screenY },
      }),
    );
  const hide = () => act(() => listeners.keyboardDidHide({} as KeyboardEvent));
  // STARTED steps: a lift built and never started leaves the composer under
  // the keyboard (TESTING.md §19).
  const steps = () => started;
  return { show, hide, steps };
}

it("eases to KAV's overlap when the keyboard opens, instead of jumping", () => {
  const { show, steps } = mount();
  show(576); // 40 + 800 - 576 = 264 dp, the measured snap
  expect(steps()).toEqual([expect.objectContaining({ toValue: 264, duration: RISE_MS })]);
  expect(RISE_MS).toBeGreaterThan(0);
});

it("eases back down when the keyboard closes", () => {
  const { show, hide, steps } = mount();
  show(576);
  hide();
  expect(steps()[1]).toEqual(expect.objectContaining({ toValue: 0, duration: FALL_MS }));
});

it("does nothing where the window already resized for the keyboard", () => {
  const { show, steps } = mount();
  show(900); // the view's bottom (840) is above the keyboard's top
  expect(steps()).toEqual([]);
});

it("does not restart for a repeat of the same keyboard", () => {
  const { show, steps } = mount();
  show(576);
  show(576);
  expect(steps()).toHaveLength(1);
});

// THE OUTCOME: the spacer the layout actually uses ends at the overlap. The
// checks above read what started; this reads where it arrived.
it("the spacer ends at the keyboard's overlap, and back at 0", async () => {
  const { show, hide } = mount();
  const height = () => boundValue(screen.UNSAFE_getByType(Animated.View), "height");
  show(576);
  await waitFor(() => expect(height()).toBe(264), { timeout: 2_000 });
  hide();
  await waitFor(() => expect(height()).toBe(0), { timeout: 2_000 });
});
