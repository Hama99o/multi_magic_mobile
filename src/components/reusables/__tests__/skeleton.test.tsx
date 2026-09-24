/**
 * The first load shows the SHAPE of what is coming, not a blank screen and a
 * "?" (owner, 2026-09-24; references in `skeleton.tsx`).
 *
 * What this proves: the placeholders render, say nothing to a screen reader,
 * hold still under Reduce Motion, and pulse on the native driver. What it
 * cannot prove: that it LOOKS right. That is a device screenshot.
 */
import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Animated } from "react-native";
import { BubblesSkeleton, RowsSkeleton, ThreadSkeleton } from "../skeleton";
import { Avatar } from "@/screens/people/Avatar";

afterEach(() => jest.restoreAllMocks());

it.each([
  ["thread-skeleton", ThreadSkeleton],
  ["bubbles-skeleton", BubblesSkeleton],
  ["rows-skeleton", RowsSkeleton],
])("%s renders and is hidden from the screen reader", async (id, Component) => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  render(<Component />);
  const node = await screen.findByTestId(id, { includeHiddenElements: true });
  expect(node.props.importantForAccessibility).toBe("no-hide-descendants");
  expect(node.props.accessibilityElementsHidden).toBe(true);
});

it("pulses on the native driver", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const timing = jest.spyOn(Animated, "timing");
  render(<ThreadSkeleton />);
  await waitFor(() => expect(timing).toHaveBeenCalled());
  expect(timing.mock.calls.every(([, c]) => (c as { useNativeDriver?: boolean }).useNativeDriver === true)).toBe(true);
});

it("holds still under Reduce Motion", async () => {
  const reduced = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  const timing = jest.spyOn(Animated, "timing");
  render(<ThreadSkeleton />);
  await waitFor(() => expect(reduced).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(timing).not.toHaveBeenCalled();
});

it("an avatar with no name yet is a quiet circle, not a question mark", () => {
  render(<Avatar name="" uri={null} userId={0} size={28} />);
  expect(screen.getByTestId("avatar-pending")).toBeTruthy();
  expect(screen.queryByText("?")).toBeNull();
});

it("an avatar with a name still shows its initial", () => {
  render(<Avatar name="qa mobile" uri={null} userId={7} size={28} />);
  expect(screen.getByText("Q")).toBeTruthy();
});
