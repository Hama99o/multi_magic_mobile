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
import { render, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, Text } from "react-native";
import { Arriving } from "../Arriving";
import { ThinkingDots } from "../ThinkingDots";

afterEach(() => jest.restoreAllMocks());

const asked = (spy: jest.SpyInstance) =>
  spy.mock.calls.map(([, config]) => (config as { useNativeDriver?: boolean }).useNativeDriver);

it("the arriving fade asks for the native driver", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const timing = jest.spyOn(Animated, "timing");
  render(
    <Arriving arriving>
      <Text>new</Text>
    </Arriving>,
  );
  await waitFor(() => expect(timing).toHaveBeenCalled());
  expect(asked(timing)).toEqual(asked(timing).map(() => true));
});

it("every step of the dots' loop asks for the native driver", () => {
  const timing = jest.spyOn(Animated, "timing");
  render(<ThinkingDots />);
  expect(timing).toHaveBeenCalled();
  expect(asked(timing).every((v) => v === true)).toBe(true);
});
