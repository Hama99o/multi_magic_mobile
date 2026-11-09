/**
 * One small "Offline" line, on every screen, the moment the app knows
 * (docs/QA_FULL.md top-10 #8). Nothing at all while MultiMagic answers.
 *
 * It sits ABOVE the screens, not over them. Measured 2026-11-07 on qa_phone:
 * as an overlay it covered the Home title and AI button and the Pages search
 * pill, so it now takes the status-bar inset itself and the screens below
 * get a top inset of zero (they read it through `useSafeAreaInsets`).
 */
import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { useReachability } from "@/stores/reachability.store";

/* eslint-disable import/first */
import { OfflineBanner } from "../OfflineBanner";

const mounts = jest.fn();

function Screen() {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    mounts();
  }, []);
  return <Text testID="screen-top">{String(insets.top)}</Text>;
}

beforeEach(() => mounts.mockClear());

/** A phone with a 24 dp status bar: the mock's own default is 0, which would
 *  make "the screen's top inset is 0" true whatever the banner did. */
const PHONE = { top: 24, bottom: 16, left: 0, right: 0 };
function Phone({ children }: { children: React.ReactNode }) {
  return <SafeAreaInsetsContext.Provider value={PHONE}>{children}</SafeAreaInsetsContext.Provider>;
}

it("says nothing while MultiMagic answers, and leaves the screen its inset", () => {
  act(() => useReachability.setState({ reachable: true, unreachableSince: null }));
  render(<Phone><OfflineBanner><Screen /></OfflineBanner></Phone>);
  expect(screen.queryByTestId("offline-banner")).toBeNull();
  expect(screen.getByTestId("screen-top").props.children).toBe("24");
});

it("says Offline, and what still works, when it cannot reach MultiMagic", () => {
  act(() => useReachability.setState({ reachable: false, unreachableSince: Date.now() }));
  render(<Phone><OfflineBanner><Screen /></OfflineBanner></Phone>);
  expect(screen.getByTestId("offline-banner")).toBeTruthy();
  expect(screen.getByText("Offline · it’ll all send when you’re back")).toBeTruthy();
});

it("pushes the screen down instead of covering its header", () => {
  act(() => useReachability.setState({ reachable: false, unreachableSince: Date.now() }));
  render(<Phone><OfflineBanner><Screen /></OfflineBanner></Phone>);
  // The band has cleared the status bar; the screen must not clear it again.
  expect(screen.getByTestId("screen-top").props.children).toBe("0");
});

it("never remounts the screens when the connection comes and goes", () => {
  act(() => useReachability.setState({ reachable: true, unreachableSince: null }));
  render(<Phone><OfflineBanner><Screen /></OfflineBanner></Phone>);
  act(() => useReachability.setState({ reachable: false, unreachableSince: Date.now() }));
  act(() => useReachability.setState({ reachable: true, unreachableSince: null }));
  expect(mounts).toHaveBeenCalledTimes(1);
});
