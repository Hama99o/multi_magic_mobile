/**
 * THE FADE AND THE DOTS RUN ON THE NATIVE THREAD.
 *
 * Measured 2026-09-24 on `qa_phone4`: the JS thread stalls 0.3-1 s right after
 * a send, which is exactly when the thinking dots and a new message's fade are
 * on screen, and a JS-driven animation freezes for the length of the stall (a
 * 180 ms fade took up to 1086 ms). So both ask for the native driver.
 *
 * What this proves: every animation these two start ASKS for the driver. What
 * it cannot prove: that it looks smooth. Under Jest the driver is refused
 * (`src/__tests__/setup.ts`), so nothing here runs natively, and smoothness
 * is a device observation.
 */
import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, Text } from "react-native";
import { allNative, boundValue, watchTimings } from "@/__tests__/animated";
import { Arriving } from "../Arriving";
import { ThinkingDots } from "../ThinkingDots";

afterEach(() => jest.restoreAllMocks());

// STARTED, not built: with `.start()` removed, a new message sat at opacity 0
// for ever and the earlier form of this test stayed green (TESTING.md §19).
it("the arriving fade starts, on the native driver", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const { started } = watchTimings();
  render(
    <Arriving arriving>
      <Text>new</Text>
    </Arriving>,
  );
  await waitFor(() => expect(started.length).toBeGreaterThan(0));
  expect(allNative(started)).toBe(true);
});

// THE OUTCOME, not the call: the message is on screen at the end. A fade
// started on the wrong value (or toward the wrong one) passes every check on
// what started, and leaves the message invisible just the same.
it("an arriving message ends fully visible", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const { built } = watchTimings();
  render(
    <Arriving arriving>
      <Text>new</Text>
    </Arriving>,
  );
  const view = screen.UNSAFE_getByType(Animated.View);
  // The view STARTS at 1 and drops to 0 only once Reduce Motion has answered,
  // so asking before that passes for anything. The first version of this
  // test did exactly that, and a fade on the wrong value stayed green.
  await waitFor(() => expect(built.length).toBeGreaterThan(0));
  await waitFor(() => expect(boundValue(view, "opacity")).toBe(1), { timeout: 2_000 });
});

it("the dots' loop starts, every step on the native driver", async () => {
  const { started } = watchTimings();
  render(<ThinkingDots />);
  await waitFor(() => expect(started.length).toBeGreaterThan(0));
  expect(allNative(started)).toBe(true);
});
