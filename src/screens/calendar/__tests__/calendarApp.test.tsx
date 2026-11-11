/**
 * The calendar app, screen by screen, at the HTTP layer: the real API
 * functions and parsers run, and every request is asserted by its body.
 *
 * What this cannot see: a pixel, a wheel's scroll physics, the native modal,
 * and whether a French string fits 360 dp — those are the device sweep's
 * (`docs/QA_REPORT_2026-11-11.md`).
 */
import MockAdapter from "axios-mock-adapter";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useCalendarUndo } from "@/stores/calendarUndo.store";
import { useCalendarView } from "@/stores/calendarView.store";
import { addDays, dayKey, gridWindow, startOfMonth, weekStartsOn } from "../dates";
import { router as mockedRouter } from "expo-router";
import Calendar from "../../../../app/calendar";
import EditEvent from "../../../../app/calendar/edit";
import EventDetail from "../../../../app/calendar/event";

const mockParams: { current: Record<string, string> } = { current: {} };
const mockBeforeRemove: { handler: ((e: { preventDefault: () => void; data: { action: unknown } }) => void) | null } = { handler: null };
const mockNavigation = {
  addListener: jest.fn((name: string, handler: typeof mockBeforeRemove.handler) => {
    if (name === "beforeRemove") mockBeforeRemove.handler = handler;
    return () => {
      mockBeforeRemove.handler = null;
    };
  }),
  dispatch: jest.fn(),
};
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => mockNavigation,
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);

const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock };

/** The wheel's rows are for fingers and hidden from screen readers on
 *  purpose (`Wheel.tsx`); a finger's test has to say it can see them. */
const HIDDEN_ROWS = { includeHiddenElements: true };

let mock: MockAdapter;
const today = dayKey(new Date());

function renderScreen(element: ReactElement) {
  const client = testQueryClient();
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

const serverEvent = (over: Record<string, unknown> = {}) => ({
  id: 41,
  title: "Dentist",
  description: "Bring the card",
  location: "12 rue de la Paix",
  kind: "appointment",
  all_day: false,
  starts_on: null,
  ends_on: null,
  starts_at: new Date(2026, 10, 12, 14, 30).toISOString(),
  ends_at: new Date(2026, 10, 12, 15, 30).toISOString(),
  recurrence: "none",
  recurrence_until: null,
  color: "green",
  owner: { id: 3, name: "Sam" },
  current_user_permission: "owner",
  current_user_response: null,
  reminders: [{ id: 9, lead_minutes: 60, dismissed_occurrence_on: null }],
  shares: [],
  guest_count: 0,
  ...over,
});

const occurrenceOf = (event: ReturnType<typeof serverEvent>, on: string) => ({
  id: `${event.id}:${on}`,
  on,
  starts_at: event.starts_at,
  ends_at: event.ends_at,
  all_day: event.all_day,
  event,
});

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  mockParams.current = {};
  router.push.mockClear();
  router.back.mockClear();
  mockNavigation.dispatch.mockClear();
  useCalendarUndo.setState({ trashed: null });
  useCalendarView.setState({ view: "agenda", hydrated: true });
  mock.onGet(/\/ai\/conversation$/).reply(200, { conversation: { id: 1 } });
  mock.onGet(/\/ai\/sessions/).reply(200, { sessions: [] });
});
afterEach(() => mock.restore());

// ── THE MAIN SCREEN ──────────────────────────────────────────────────────
describe("the calendar's main screen", () => {
  it("a tap on an event opens IT, with the occurrence's own day", async () => {
    const event = serverEvent();
    mock.onGet("/api/v1/calendar_app/events/upcoming").reply(200, { occurrences: [occurrenceOf(event, today)] });
    renderScreen(<Calendar />);
    fireEvent.press(await screen.findByTestId(`calendar-event-41:${today}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/calendar/event", params: { id: "41", on: today } });
  });

  it("Show more widens the agenda by thirty days", async () => {
    mock.onGet("/api/v1/calendar_app/events/upcoming").reply(200, { occurrences: [] });
    renderScreen(<Calendar />);
    fireEvent.press(await screen.findByTestId("calendar-show-more"));
    await waitFor(() => expect(mock.history.get.some((r) => r.url?.endsWith("/upcoming") && r.params?.days === 37)).toBe(true));
  });

  it("the + opens a new event on today from the agenda", async () => {
    mock.onGet("/api/v1/calendar_app/events/upcoming").reply(200, { occurrences: [] });
    renderScreen(<Calendar />);
    fireEvent.press(await screen.findByTestId("calendar-new"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/calendar/edit", params: { day: today } });
  });

  describe("the month", () => {
    const window = () => gridWindow(startOfMonth(today), weekStartsOn("en"));

    it("asks for exactly the drawn days, marks a day with a dot, lists the picked day", async () => {
      const event = serverEvent({ id: 7, title: "Lunch" });
      const tomorrow = addDays(today, 1);
      mock.onGet("/api/v1/calendar_app/events/occurrences").reply(200, { occurrences: [occurrenceOf(event, tomorrow)] });
      renderScreen(<Calendar />);
      fireEvent.press(screen.getByTestId("calendar-view-toggle"));

      await screen.findByTestId("calendar-nothing-on-day");
      const request = mock.history.get.find((r) => r.url?.endsWith("/occurrences"));
      expect(request?.params).toEqual(window());

      // The day cell says it holds one event, out loud.
      const cell = screen.getByTestId(`calendar-month-day-${tomorrow}`);
      expect(cell.props.accessibilityLabel).toMatch(/1 event$/);

      fireEvent.press(cell);
      expect(await screen.findByText("Lunch")).toBeTruthy();
      expect(screen.queryByTestId("calendar-nothing-on-day")).toBeNull();
    });

    it("next month asks for the next grid", async () => {
      mock.onGet("/api/v1/calendar_app/events/occurrences").reply(200, { occurrences: [] });
      useCalendarView.setState({ view: "month", hydrated: true });
      renderScreen(<Calendar />);
      await screen.findByTestId("calendar-nothing-on-day");
      fireEvent.press(screen.getByTestId("calendar-month-next"));
      const next = gridWindow(addDays(startOfMonth(today), 40).slice(0, 8) + "01", weekStartsOn("en"));
      await waitFor(() => expect(mock.history.get.some((r) => r.params?.from === next.from && r.params?.to === next.to)).toBe(true));
      // And a way straight back.
      expect(screen.getByTestId("calendar-month-today")).toBeTruthy();
    });

    it("the choice of view is remembered", () => {
      mock.onGet(/./).reply(200, { occurrences: [] });
      renderScreen(<Calendar />);
      fireEvent.press(screen.getByTestId("calendar-view-toggle"));
      expect(useCalendarView.getState().view).toBe("month");
    });
  });

  it("SIMULATED assistant write: its reply on MessageChannel re-reads the list, nothing tapped", async () => {
    // SIMULATED, said plainly (supervisor, 2026-11-11): no model was called.
    // The frame is `MessageSerializer`'s shape with a `calendar_event` link,
    // which is what `create_calendar_events` puts on the assistant's reply,
    // delivered through the very handler the screen subscribed with.
    const { subscribeToChannel } = jest.requireMock("@/lib/cable") as { subscribeToChannel: jest.Mock };
    let served: unknown[] = [];
    mock.onGet("/api/v1/calendar_app/events/upcoming").reply(() => [200, { occurrences: served }]);
    renderScreen(<Calendar />);
    await screen.findByTestId("calendar-nothing-today");

    // The assistant has written the event on the server.
    served = [occurrenceOf(serverEvent({ id: 90, title: "QA echo check" }), today)];
    const handler = subscribeToChannel.mock.calls.filter(([name]) => name === "MessageChannel").pop()?.[1] as { onData: (frame: unknown) => void };
    act(() =>
      handler.onData({
        message: {
          id: 31, conversation_id: 4, user_id: null, role: "assistant", body: "Added it to your calendar.",
          created_at: new Date().toISOString(), deleted: false, sent_by_me: false, edited_at: null, read_at: null,
          reactions: [], links: [{ key: "calendar_event", label: "QA echo check", path: "/calendar?event=90" }],
          sources: [], undoable: true, undone_at: null,
        },
      }),
    );
    expect(await screen.findByText("QA echo check")).toBeTruthy();
  });

  it("a delete made on the detail page comes back with an Undo that restores it", async () => {
    mock.onGet("/api/v1/calendar_app/events/upcoming").reply(200, { occurrences: [] });
    mock.onPut("/api/v1/calendar_app/events/41/restore").reply(200, { event: serverEvent() });
    useCalendarUndo.setState({ trashed: { id: 41, title: "Dentist", at: Date.now() } });
    renderScreen(<Calendar />);
    expect(screen.getByText("“Dentist” moved to the trash.")).toBeTruthy();
    // The + gives way to the Undo, so the two never overlap.
    expect(screen.queryByTestId("calendar-new")).toBeNull();
    fireEvent.press(screen.getByTestId("calendar-undo-button"));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("calendar-undo")).toBeNull());
  });
});

// ── THE FORM ─────────────────────────────────────────────────────────────
describe("a new event", () => {
  beforeEach(() => {
    mockParams.current = { day: "2026-11-12" };
  });

  it("a birthday is saved all-day and yearly, with the day's DATE and no instant", async () => {
    mock.onPost("/api/v1/calendar_app/events").reply(201, { event: serverEvent({ id: 50 }) });
    mock.onGet(/./).reply(200, {});
    renderScreen(<EditEvent />);
    fireEvent.changeText(screen.getByTestId("event-form-title"), "Sara");
    fireEvent.press(screen.getByTestId("event-form-kind-birthday"));
    fireEvent.press(screen.getByTestId("event-form-save"));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.event).toMatchObject({ title: "Sara", kind: "birthday", all_day: true, starts_on: "2026-11-12", starts_at: null, recurrence: "yearly" });
    expect(body.reminders).toEqual([60]);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it("without a title it says so and sends nothing", async () => {
    renderScreen(<EditEvent />);
    fireEvent.press(screen.getByTestId("event-form-save"));
    expect(await screen.findByTestId("event-form-title-error")).toBeTruthy();
    expect(mock.history.post).toHaveLength(0);
  });

  it("two fast taps on Save make ONE event", async () => {
    let answer: (value: [number, unknown]) => void = () => undefined;
    mock.onPost("/api/v1/calendar_app/events").reply(() => new Promise((resolve) => (answer = resolve)));
    renderScreen(<EditEvent />);
    fireEvent.changeText(screen.getByTestId("event-form-title"), "Dentist");
    const save = screen.getByTestId("event-form-save");
    // In ONE act, so all three land before React re-renders the disabled
    // button — two touches in one frame, which is what a device does. Three
    // separate presses were planted against (the ref removed) and stayed
    // green: RNTL re-rendered between them and the disabled state did the
    // work, so the test never reached the guard it was named for.
    act(() => {
      fireEvent.press(save);
      fireEvent.press(save);
      fireEvent.press(save);
    });
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    await act(async () => answer([201, { event: serverEvent() }]));
    expect(mock.history.post).toHaveLength(1);
  });

  it("offline, it keeps the draft and says it was not saved", async () => {
    mock.onPost("/api/v1/calendar_app/events").networkError();
    renderScreen(<EditEvent />);
    fireEvent.changeText(screen.getByTestId("event-form-title"), "Dentist");
    fireEvent.press(screen.getByTestId("event-form-save"));
    expect(await screen.findByTestId("event-form-error")).toBeTruthy();
    expect(screen.getByTestId("event-form-title").props.value).toBe("Dentist");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("the time wheel sets the start, and the end follows it (24 h in French)", async () => {
    await i18n.changeLanguage("fr");
    renderScreen(<EditEvent />);
    fireEvent.press(screen.getByTestId("when-start-time"));
    fireEvent.press(screen.getByTestId("when-start-wheel-hour-14", HIDDEN_ROWS));
    expect(screen.getByTestId("when-start-time")).toHaveTextContent("14:00");
    expect(screen.getByTestId("when-end-time")).toHaveTextContent("15:00");
    // French has no AM/PM column.
    expect(screen.queryByTestId("when-start-wheel-period")).toBeNull();
  });

  it("in English the wheel has an AM/PM column, and PM means the afternoon", async () => {
    renderScreen(<EditEvent />);
    fireEvent.press(screen.getByTestId("when-start-time"));
    fireEvent.press(screen.getByTestId("when-start-wheel-hour-3", HIDDEN_ROWS));
    fireEvent.press(screen.getByTestId("when-start-wheel-period-pm", HIDDEN_ROWS));
    expect(screen.getByTestId("when-start-time")).toHaveTextContent(/^3:00\sPM$/);
  });

  it("the wheel is ONE adjustable element a screen reader can swipe", async () => {
    renderScreen(<EditEvent />);
    fireEvent.press(screen.getByTestId("when-start-time"));
    const hours = screen.getByTestId("when-start-wheel-hour-adjust");
    expect(hours.props.accessibilityRole).toBe("adjustable");
    fireEvent(hours, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(screen.getByTestId("when-start-time")).toHaveTextContent(/^10:00\sAM$/);
  });

  it("the date opens as a month and a tap picks the day and closes it", async () => {
    renderScreen(<EditEvent />);
    fireEvent.press(screen.getByTestId("when-start-date"));
    fireEvent.press(screen.getByTestId("when-start-month-day-2026-11-20"));
    expect(screen.queryByTestId("when-start-month")).toBeNull();
    expect(screen.getByTestId("when-start-date")).toHaveTextContent(/20/);
  });

  it("an end day before the start cannot be picked", async () => {
    renderScreen(<EditEvent />);
    fireEvent.press(screen.getByTestId("when-end-date"));
    expect(screen.getByTestId("when-end-month-day-2026-11-11").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("repeat is a sheet of choices, and 'until' appears once it repeats", async () => {
    renderScreen(<EditEvent />);
    expect(screen.queryByTestId("when-until-date")).toBeNull();
    fireEvent.press(screen.getByTestId("event-form-repeat"));
    fireEvent.press(screen.getByTestId("event-form-repeat-sheet-weekly"));
    expect(screen.getByTestId("when-until-date")).toHaveTextContent("Forever");
  });

  it("leaving with changes asks first; leaving untouched does not", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    renderScreen(<EditEvent />);
    const leave = () => {
      const e = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
      act(() => mockBeforeRemove.handler?.(e));
      return e;
    };
    expect(leave().preventDefault).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId("event-form-title"), "Half typed");
    expect(leave().preventDefault).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("Discard your changes?", expect.any(String), expect.any(Array));
    alert.mockRestore();
  });
});

describe("editing an event", () => {
  beforeEach(() => {
    mockParams.current = { id: "41" };
  });

  it("a REPEATING event's form says the change applies to every occurrence", async () => {
    mock.onGet("/api/v1/calendar_app/events/41").reply(200, { event: serverEvent({ recurrence: "weekly" }) });
    renderScreen(<EditEvent />);
    expect(await screen.findByTestId("event-form-series-note")).toBeTruthy();
  });

  it("a one-off event's form does not", async () => {
    mock.onGet("/api/v1/calendar_app/events/41").reply(200, { event: serverEvent() });
    renderScreen(<EditEvent />);
    await screen.findByTestId("event-form-title");
    expect(screen.queryByTestId("event-form-series-note")).toBeNull();
  });

  it("fills the form from the event and PUTs the change, with an EMPTY reminder list when all are removed", async () => {
    mock.onGet("/api/v1/calendar_app/events/41").reply(200, { event: serverEvent() });
    mock.onPut("/api/v1/calendar_app/events/41").reply(200, { event: serverEvent({ title: "Dentist (moved)", reminders: [] }) });
    renderScreen(<EditEvent />);
    const title = await screen.findByTestId("event-form-title");
    expect(title.props.value).toBe("Dentist");
    fireEvent.changeText(title, "Dentist (moved)");
    fireEvent.press(screen.getByTestId("event-form-remind-60"));
    fireEvent.press(screen.getByTestId("event-form-save"));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.event.title).toBe("Dentist (moved)");
    expect(body.reminders).toEqual([]);
    expect(body.event.color).toBe("green");
  });
});

// ── THE DETAIL PAGE ──────────────────────────────────────────────────────
describe("one event", () => {
  it("the owner sees it all, can edit, and a delete asks, trashes, and hands the Undo to the list", async () => {
    mockParams.current = { id: "41", on: "2026-11-12" };
    mock.onGet("/api/v1/calendar_app/events/41").reply(200, { event: serverEvent() });
    mock.onGet("/api/v1/calendar_app/events/41/event_shares").reply(200, { shares: [] });
    mock.onDelete("/api/v1/calendar_app/events/41").reply(200, {});
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    renderScreen(<EventDetail />);
    expect(await screen.findByTestId("event-title")).toHaveTextContent("Dentist");
    expect(screen.getByTestId("event-location")).toHaveTextContent(/12 rue de la Paix/);
    expect(screen.getByTestId("event-notes")).toHaveTextContent(/Bring the card/);
    expect(screen.getByTestId("event-reminders")).toHaveTextContent(/1 hour before/);
    expect(screen.getByTestId("event-edit")).toBeTruthy();
    expect(screen.queryByTestId("event-rsvp")).toBeNull();

    fireEvent.press(screen.getByTestId("event-delete"));
    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
    expect(useCalendarUndo.getState().trashed).toMatchObject({ id: 41, title: "Dentist" });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    alert.mockRestore();
  });

  it("deleting a REPEATING event says every occurrence goes (the web has no 'this one only')", async () => {
    mockParams.current = { id: "41", on: "2026-11-12" };
    mock.onGet("/api/v1/calendar_app/events/41").reply(200, { event: serverEvent({ recurrence: "weekly" }) });
    mock.onGet(/event_shares/).reply(200, { shares: [] });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    renderScreen(<EventDetail />);
    fireEvent.press(await screen.findByTestId("event-delete"));
    expect(alert).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/every occurrence/i), expect.any(Array));
    alert.mockRestore();
  });

  it("a birthday reads this year's age off the tapped occurrence", async () => {
    mockParams.current = { id: "12", on: "2026-04-03" };
    mock.onGet("/api/v1/calendar_app/events/12").reply(200, {
      event: serverEvent({ id: 12, title: "Sara", kind: "birthday", all_day: true, starts_on: "1990-04-03", starts_at: null, ends_at: null, recurrence: "yearly" }),
    });
    mock.onGet(/event_shares/).reply(200, { shares: [] });
    renderScreen(<EventDetail />);
    expect(await screen.findByTestId("event-kind")).toHaveTextContent("Birthday · turns 36");
    expect(screen.getByTestId("event-repeat")).toHaveTextContent(/Every year/);
  });

  it("a VIEWER gets no Edit and no Delete, can answer, and can leave", async () => {
    mockParams.current = { id: "41" };
    mock.onGet("/api/v1/calendar_app/events/41").reply(200, {
      event: serverEvent({
        current_user_permission: "viewer",
        current_user_response: "pending",
        shares: [{ id: 77, permission: "viewer", response: "pending", shared_with_id: 8, shared_with_name: "Me" }],
      }),
    });
    mock.onGet("/api/v1/users/connected_user").reply(200, { user: { id: 8, email: "me@example.test", lang: "en" } });
    mock.onPut("/api/v1/calendar_app/events/41/event_shares/respond").reply(200, { share: { id: 77, permission: "viewer", response: "accepted", shared_with_id: 8 } });
    mock.onDelete("/api/v1/calendar_app/events/41/event_shares/77").reply(200, {});
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    renderScreen(<EventDetail />);
    await screen.findByTestId("event-title");
    expect(screen.queryByTestId("event-edit")).toBeNull();
    expect(screen.queryByTestId("event-delete")).toBeNull();
    expect(screen.getByTestId("event-read-only")).toHaveTextContent(/Shared by Sam/);
    // A guest sees the list but cannot manage it.
    expect(screen.queryByTestId("event-guests-email")).toBeNull();

    fireEvent.press(screen.getByTestId("event-accept"));
    await waitFor(() => expect(JSON.parse(mock.history.put[0].data)).toEqual({ response: "accepted" }));

    fireEvent.press(await screen.findByTestId("event-leave"));
    await waitFor(() => expect(mock.history.delete[0]?.url).toBe("/api/v1/calendar_app/events/41/event_shares/77"));
    alert.mockRestore();
  });

  it("an EDITOR may edit but not delete", async () => {
    mockParams.current = { id: "41" };
    mock.onGet("/api/v1/calendar_app/events/41").reply(200, { event: serverEvent({ current_user_permission: "editor" }) });
    mock.onGet(/connected_user/).reply(200, { user: { id: 8 } });
    renderScreen(<EventDetail />);
    await screen.findByTestId("event-title");
    expect(screen.getByTestId("event-edit")).toBeTruthy();
    expect(screen.queryByTestId("event-delete")).toBeNull();
  });

  it("the owner invites by email, and a refusal is said in the server's words", async () => {
    mockParams.current = { id: "41" };
    mock.onGet("/api/v1/calendar_app/events/41").reply(200, { event: serverEvent() });
    mock.onGet("/api/v1/calendar_app/events/41/event_shares").reply(200, { shares: [] });
    mock.onPost("/api/v1/calendar_app/events/41/event_shares").replyOnce(404, { message: ["No MultiMagic account uses that email."] });
    renderScreen(<EventDetail />);
    const email = await screen.findByTestId("event-guests-email");
    // Not a valid address yet: Invite stays off.
    fireEvent.changeText(email, "lee@");
    expect(screen.getByTestId("event-guests-invite").props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(email, " Lee@Example.test ");
    fireEvent.press(screen.getByTestId("event-guests-invite"));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ share: { email: "lee@example.test", permission: "viewer" } });
    expect(await screen.findByTestId("event-guests-error")).toHaveTextContent("No MultiMagic account uses that email.");
  });

  it("an event that cannot load says so and offers a retry", async () => {
    mockParams.current = { id: "41" };
    mock.onGet("/api/v1/calendar_app/events/41").networkError();
    renderScreen(<EventDetail />);
    expect(await screen.findByTestId("event-load-failed")).toBeTruthy();
  });
});
