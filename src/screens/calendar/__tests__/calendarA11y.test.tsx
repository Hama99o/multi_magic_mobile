/**
 * The calendar's accessibility, beyond what `a11y.test.tsx` checks statically:
 * the roles a screen reader announces, the timing of the Undo, and the
 * right-to-left layout. Measures no pixel; TalkBack on a device is slot 2.
 */
import { AccessibilityInfo, I18nManager } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import { MonthGrid } from "../MonthGrid";
import { EventForm } from "../EventForm";
import { newDraft } from "../draft";
import { useCalendarUndo } from "@/stores/calendarUndo.store";
import { useCalendarView } from "@/stores/calendarView.store";
import Calendar from "../../../../app/calendar";

jest.mock("expo-router", () => require("@/__tests__/screenMocks").expoRouter);
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the form's choices are announced as what they are", () => {
  it("a KIND is one of four: radio; a REMINDER is any of five: checkbox", () => {
    render(<EventForm mode="create" draft={newDraft("2026-11-12")} onChange={jest.fn()} onCancel={jest.fn()} onSave={jest.fn()} saving={false} saveError={null} />);
    const kind = screen.getByTestId("event-form-kind-event");
    expect(kind.props.accessibilityRole).toBe("radio");
    expect(kind.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId("event-form-remind-60").props.accessibilityRole).toBe("checkbox");
  });
});

describe("the Undo, for somebody using a screen reader", () => {
  let mock: MockAdapter;
  beforeEach(() => {
    jest.useFakeTimers();
    mock = new MockAdapter(http);
    __resetTokenCache();
    mock.onGet(/./).reply(200, { occurrences: [] });
    useCalendarView.setState({ view: "agenda", hydrated: true });
  });
  afterEach(() => {
    jest.useRealTimers();
    mock.restore();
    jest.restoreAllMocks();
  });

  const renderList = () =>
    render(
      <QueryClientProvider client={testQueryClient()}>
        <Calendar />
      </QueryClientProvider>,
    );

  it("is SAID, on every platform (a live region is Android-only)", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
    useCalendarUndo.setState({ trashed: { id: 41, title: "Dentist", at: Date.now() } });
    renderList();
    await waitFor(() => expect(announce).toHaveBeenCalledWith(expect.stringContaining("Dentist")));
  });

  it("stays 30 s instead of 8 when a screen reader is on (WCAG 2.2.1)", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
    useCalendarUndo.setState({ trashed: { id: 41, title: "Dentist", at: Date.now() } });
    renderList();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(10_000));
    expect(screen.getByTestId("calendar-undo")).toBeTruthy();
    act(() => jest.advanceTimersByTime(21_000));
    expect(screen.queryByTestId("calendar-undo")).toBeNull();
  });

  it("without one, it goes after 8 s", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
    useCalendarUndo.setState({ trashed: { id: 41, title: "Dentist", at: Date.now() } });
    renderList();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(8_100));
    expect(screen.queryByTestId("calendar-undo")).toBeNull();
  });
});

describe("right to left", () => {
  const original = I18nManager.isRTL;
  afterEach(() => {
    Object.defineProperty(I18nManager, "isRTL", { value: original, configurable: true });
  });

  function grid() {
    const onMonthChange = jest.fn();
    render(<MonthGrid month="2026-11-01" selected={null} today="2026-11-11" onSelect={jest.fn()} onMonthChange={onMonthChange} />);
    return onMonthChange;
  }

  it("previous still means the previous month, and its arrow points to the line's START", () => {
    Object.defineProperty(I18nManager, "isRTL", { value: true, configurable: true });
    const onMonthChange = grid();
    const prev = screen.getByTestId("month-prev");
    // The glyph is the right-pointing chevron in RTL: the start of the line is on the right.
    expect(prev.findByProps({ testID: "month-prev-glyph-right" })).toBeTruthy();
    fireEvent.press(prev);
    expect(onMonthChange).toHaveBeenCalledWith("2026-10-01");
  });

  it("left to right, the same button points left", () => {
    Object.defineProperty(I18nManager, "isRTL", { value: false, configurable: true });
    grid();
    expect(screen.getByTestId("month-prev").findByProps({ testID: "month-prev-glyph-left" })).toBeTruthy();
  });
});
