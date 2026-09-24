/**
 * The opening (owner, 2026-09-24; references in OpeningAnimation.tsx).
 * What this proves: it covers, never blocks, says nothing, asks for the native
 * driver, ends and removes itself, and respects Reduce Motion. What it cannot:
 * how it LOOKS, or that it is smooth. That is a device recording.
 */
import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Animated } from "react-native";
import { OpeningAnimation, OPENING_MS } from "../OpeningAnimation";

afterEach(() => jest.restoreAllMocks());

it("covers the first screen without taking a touch or talking", () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  render(<OpeningAnimation ground="#F7F9F9" onDone={jest.fn()} />);
  const cover = screen.getByTestId("opening", { includeHiddenElements: true });
  expect(cover.props.pointerEvents).toBe("none");
  expect(cover.props.importantForAccessibility).toBe("no-hide-descendants");
});

it("is short, and ends by removing itself", async () => {
  expect(OPENING_MS).toBeLessThan(1_000);
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const onDone = jest.fn();
  render(<OpeningAnimation ground="#F7F9F9" onDone={onDone} />);
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 3_000 });
  expect(screen.queryByTestId("opening", { includeHiddenElements: true })).toBeNull();
});

it("asks for the native driver for every step", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const timing = jest.spyOn(Animated, "timing");
  render(<OpeningAnimation ground="#F7F9F9" onDone={jest.fn()} />);
  await waitFor(() => expect(timing).toHaveBeenCalled());
  expect(timing.mock.calls.every(([, c]) => (c as { useNativeDriver?: boolean }).useNativeDriver === true)).toBe(true);
});

it("under Reduce Motion: no burst, only a short fade", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const timing = jest.spyOn(Animated, "timing");
  const onDone = jest.fn();
  render(<OpeningAnimation ground="#F7F9F9" onDone={onDone} />);
  await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: 2_000 });
  expect(timing).toHaveBeenCalledTimes(1);
  expect((timing.mock.calls[0][1] as { duration: number }).duration).toBeLessThanOrEqual(150);
});
