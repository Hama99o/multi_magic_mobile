/**
 * "Is this still true?" — the control and the line.
 *
 * His constraint is the design one: *"it should not be very big which can
 * break design but it should be stylish."* So what is asserted is as much
 * about what is NOT there — no banner, no full-screen spinner, no label — as
 * about what is.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { RefreshButton, UpdatedLine } from "../Freshness";
import { METRICS } from "@/theme/tokens";

describe("the control", () => {
  it("is a touch-floor target with no label text — a glyph, not a button", () => {
    render(<RefreshButton refreshing={false} onPress={jest.fn()} testID="x-refresh" />);

    const control = screen.getByTestId("x-refresh");
    expect(control.props.style).toMatchObject({ width: METRICS.touch, height: METRICS.touch });
    // Findable by a screen reader, invisible in the layout.
    expect(control.props.accessibilityLabel).toBe("Refresh");
    expect(screen.queryByText("Refresh")).toBeNull();
  });

  it("shows the busy state INSIDE itself, never over the content", () => {
    render(<RefreshButton refreshing onPress={jest.fn()} testID="x-refresh" />);

    expect(screen.getByTestId("x-refresh-busy")).toBeTruthy();
    expect(screen.getByTestId("x-refresh").props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it("cannot be pressed twice while it is working", () => {
    const onPress = jest.fn();
    render(<RefreshButton refreshing onPress={onPress} testID="x-refresh" />);

    fireEvent.press(screen.getByTestId("x-refresh"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("can be pressed when it is not", () => {
    const onPress = jest.fn();
    render(<RefreshButton refreshing={false} onPress={onPress} testID="x-refresh" />);

    fireEvent.press(screen.getByTestId("x-refresh"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("the line", () => {
  it("says nothing before the first answer has landed", () => {
    render(<UpdatedLine at={0} refreshing={false} />);

    expect(screen.queryByTestId("updated-line")).toBeNull();
  });

  it("says when this was last true", () => {
    render(<UpdatedLine at={Date.now()} refreshing={false} />);

    expect(screen.getByTestId("updated-line")).toHaveTextContent("Updated just now");
  });

  it("ages, rather than claiming a freshness it no longer has", () => {
    jest.useFakeTimers();
    const landed = Date.now();
    render(<UpdatedLine at={landed} refreshing={false} />);
    expect(screen.getByTestId("updated-line")).toHaveTextContent("Updated just now");

    act(() => {
      jest.setSystemTime(landed + 5 * 60_000);
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.getByTestId("updated-line")).toHaveTextContent("Updated 5 min ago");
    jest.useRealTimers();
  });

  it("says it is working, rather than an age that is about to change", () => {
    render(<UpdatedLine at={Date.now()} refreshing />);

    expect(screen.getByTestId("updated-line")).toHaveTextContent("Updating…");
  });

  it("leaves no timer behind", () => {
    jest.useFakeTimers();
    const { unmount } = render(<UpdatedLine at={Date.now()} refreshing={false} />);
    expect(jest.getTimerCount()).toBe(1);

    unmount();

    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});
