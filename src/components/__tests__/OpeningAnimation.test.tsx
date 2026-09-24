/**
 * The opening (owner, 2026-09-24; references in OpeningAnimation.tsx).
 * What this proves: it covers, never blocks, says nothing, asks for the native
 * driver, ends and removes itself, and respects Reduce Motion. What it cannot:
 * how it LOOKS, or that it is smooth. That is a device recording.
 */
import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { allNative, watchTimings } from "@/__tests__/animated";
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

it("every step that starts asks for the native driver", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const { started } = watchTimings();
  render(<OpeningAnimation ground="#F7F9F9" onDone={jest.fn()} />);
  await waitFor(() => expect(started.length).toBeGreaterThan(0));
  expect(allNative(started)).toBe(true);
});

it("starts on mount, without waiting to hear about Reduce Motion", async () => {
  // Measured 2026-09-24: awaiting this answer froze the tiles for 0.72 s.
  // STARTED, not built: a plant that moved only `.start()` behind the promise
  // passed a check on the sequence being built (TESTING.md §19).
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
  const { started } = watchTimings();
  render(<OpeningAnimation ground="#F7F9F9" onDone={jest.fn()} />);
  await waitFor(() => expect(started.length).toBeGreaterThan(0));
});

it("ends by fading the cover out gently, not cutting", () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const { built } = watchTimings();
  render(<OpeningAnimation ground="#F7F9F9" onDone={jest.fn()} />);
  const fade = built.find((c) => c.toValue === 0);
  const easing = fade?.easing as (t: number) => number;
  // The last 16 ms frame of the fade is a small step, not the largest one.
  const lastStep = easing(1) - easing(1 - 16 / 220);
  expect(lastStep).toBeLessThan(0.02);
});

it("under Reduce Motion: the burst stops, and a short fade ends it once", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const { started } = watchTimings();
  const onDone = jest.fn();
  render(<OpeningAnimation ground="#F7F9F9" onDone={onDone} />);
  await waitFor(() => expect(onDone).toHaveBeenCalled(), { timeout: 2_000 });
  const last = started[started.length - 1] as { toValue: number; duration: number };
  expect(last.toValue).toBe(0);
  expect(last.duration).toBeLessThanOrEqual(150);
  await new Promise((r) => setTimeout(r, 700));
  expect(onDone).toHaveBeenCalledTimes(1);
});
