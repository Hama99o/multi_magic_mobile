/**
 * The three actions a person CONFIRMS on this screen — delete, mark all read,
 * clear read — had no error handling: a refusal put the row back on the next
 * reload with nothing said. Now the reason is shown (2026-09-24 error sweep).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {} }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

/* eslint-disable import/first */
import Notifications from "../notifications";
import { notificationsApi, type AppNotification } from "@/api/notifications";
import { testQueryClient } from "@/__tests__/queryClient";
import { aiApi } from "@/api/ai";

const { router } = jest.requireMock("expo-router") as {
  router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };
};
beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.replace.mockClear();
  router.canGoBack.mockReturnValue(true);
});

const read: AppNotification = {
  id: 9, kind: "loan_due", title: "Anisa's loan is due", body: null, path: null,
  readAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  subjectType: null, subjectId: null, actor: null,
} as AppNotification;

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <Notifications />
    </QueryClientProvider>,
  );
}

afterEach(() => jest.restoreAllMocks());

it("says so when a confirmed Clear read is refused, with the server's reason", async () => {
  jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [read], unreadCount: 0, hasMore: false });
  jest.spyOn(notificationsApi, "clearRead").mockRejectedValue({
    isAxiosError: true,
    response: { status: 422, data: { error: "Nothing to clear" } },
  });
  // Press the destructive button of whatever the confirm offers.
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });

  renderScreen();
  fireEvent.press(await screen.findByLabelText("Clear read notifications"));

  await waitFor(() => expect(screen.getByTestId("notifications-action-failed")).toBeTruthy());
  expect(screen.getByText("Nothing to clear")).toBeTruthy();
});

it("says nothing when there is nothing wrong", async () => {
  jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [read], unreadCount: 0, hasMore: false });
  jest.spyOn(notificationsApi, "clearRead").mockResolvedValue(undefined as never);
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });

  renderScreen();
  fireEvent.press(await screen.findByLabelText("Clear read notifications"));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

  expect(screen.queryByTestId("notifications-action-failed")).toBeNull();
});

// ── EVERY PAGE (the volume audit, 2026-09-24) ─────────────────────────────
// Only the newest 20 could be read: the screen asked for page 1 and never
// another, on the reasoning that the server's 90-day window is "bounded".
// Bounded in time is not bounded in count.
describe("more than one page", () => {
  const row = (id: number) => ({ ...read, id, title: `Notice ${id}` }) as AppNotification;

  it("loads the next page at the end of the list, once per row", async () => {
    const list = jest.spyOn(notificationsApi, "list").mockImplementation(async (page = 1) =>
      page === 1
        ? { notifications: [row(1), row(2)], unreadCount: 7, hasMore: true }
        : { notifications: [row(2), row(3)], unreadCount: 7, hasMore: false },
    );
    renderScreen();
    await screen.findByText("Notice 1");
    await act(async () => {
      fireEvent(screen.getByTestId("notifications-list"), "endReached");
    });
    expect(await screen.findByText("Notice 3")).toBeTruthy();
    expect(list).toHaveBeenCalledWith(2);
    // Row 2 arrived on both pages and is drawn once.
    expect(screen.getAllByText("Notice 2")).toHaveLength(1);
  });

  it("does not ask past the last page", async () => {
    const list = jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [row(1)], unreadCount: 0, hasMore: false });
    renderScreen();
    await screen.findByText("Notice 1");
    await act(async () => {
      fireEvent(screen.getByTestId("notifications-list"), "endReached");
    });
    expect(list).toHaveBeenCalledTimes(1);
  });
});

// ── AN UNREADABLE ROW IS SKIPPED AND SAID (Hamma9901's call, 2026-09-25) ──
describe("rows the app could not read", () => {
  it("are counted on screen, not hidden in silence, and not allowed to take the list", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [read], unreadCount: 0, hasMore: false, unreadable: 2 });
    renderScreen();
    expect(await screen.findByText("Anisa's loan is due")).toBeTruthy();
    expect(screen.getByTestId("unreadable-notice").props.children).toBe(
      "2 items here could not be read, so they are not shown.",
    );
  });

  it("say nothing when every row was read", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [read], unreadCount: 0, hasMore: false, unreadable: 0 });
    renderScreen();
    await screen.findByText("Anisa's loan is due");
    expect(screen.queryByTestId("unreadable-notice")).toBeNull();
  });
});

describe("the bin (Clear read)", () => {
  // docs/QA_FULL.md, 2026-11-07: on an empty list the bin stood in the header
  // with nothing to clear.
  it("is not offered when there is nothing in the list", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [], unreadCount: 0, hasMore: false });
    renderScreen();
    await waitFor(() => expect(screen.getByText("You're all caught up.")).toBeTruthy());
    expect(screen.queryByLabelText("Clear read notifications")).toBeNull();
  });

  it("is offered when there is something to clear", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [read], unreadCount: 0, hasMore: false });
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText("Clear read notifications")).toBeTruthy());
  });
});

// ── A TAP OPENS THE SCREEN THE NOTIFICATION IS ABOUT (audit P0 #3) ────────
// It used to compose a question in the assistant for every kind; the web's
// bell navigates to `path` (NotificationBell.tsx:118-129). The question is
// kept only for paths this app has no screen for.
describe("opening a notification", () => {
  const unread = (over: Partial<AppNotification>): AppNotification =>
    ({ ...read, id: 21, readAt: null, title: "Sam", kind: "chat.message", ...over }) as AppNotification;

  beforeEach(() => {
    jest.spyOn(aiApi, "currentSessionId").mockResolvedValue(5);
  });

  it("a chat message opens its thread, and is marked read", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({
      notifications: [unread({ path: "/conversations?conversation_id=31" })], unreadCount: 1, hasMore: false,
    });
    const markRead = jest.spyOn(notificationsApi, "markRead").mockResolvedValue(undefined as never);
    renderScreen();
    fireEvent.press(await screen.findByTestId("notification-row-21"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/chat/[id]", params: { id: "31" } });
    expect(router.push).not.toHaveBeenCalledWith("/chat");
    await waitFor(() => expect(markRead).toHaveBeenCalledWith(21));
    // Nothing was composed, so nothing says it was.
    expect(screen.queryByText("Question ready in the chat — edit it before you ask.")).toBeNull();
  });

  it("a reminder opens the event on its day", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({
      notifications: [unread({ kind: "calendar.reminder", path: "/calendar?event=7&on=2026-11-20" })], unreadCount: 1, hasMore: false,
    });
    jest.spyOn(notificationsApi, "markRead").mockResolvedValue(undefined as never);
    renderScreen();
    fireEvent.press(await screen.findByTestId("notification-row-21"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/calendar/event", params: { id: "7", on: "2026-11-20" } });
  });

  it("a kind with no screen here still composes the question in the assistant", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({
      notifications: [unread({ kind: "table_app.share", path: "/tables/4" })], unreadCount: 1, hasMore: false,
    });
    jest.spyOn(notificationsApi, "markRead").mockResolvedValue(undefined as never);
    renderScreen();
    await waitFor(() => expect(aiApi.currentSessionId).toHaveBeenCalled());
    fireEvent.press(await screen.findByTestId("notification-row-21"));
    expect(router.push).toHaveBeenCalledWith("/chat");
    expect(await screen.findByText("Question ready in the chat — edit it before you ask.")).toBeTruthy();
  });
});

// ── PER ROW: MARK READ AND DELETE, AS ON THE WEB (audit P1 #36) ────────────
describe("a row's own actions", () => {
  const unread = { ...read, id: 22, readAt: null, title: "Due today" } as AppNotification;

  it("an unread row offers Mark as read, which marks it without opening anything", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [unread], unreadCount: 1, hasMore: false });
    const markRead = jest.spyOn(notificationsApi, "markRead").mockResolvedValue(undefined as never);
    renderScreen();
    fireEvent.press(await screen.findByTestId("notification-mark-read-22"));
    await waitFor(() => expect(markRead).toHaveBeenCalledWith(22));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("a read row has nothing to mark", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [read], unreadCount: 0, hasMore: false });
    renderScreen();
    await screen.findByText("Anisa's loan is due");
    expect(screen.queryByTestId("notification-mark-read-9")).toBeNull();
  });

  it("every row offers Delete, confirmed, without a long press", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [read], unreadCount: 0, hasMore: false });
    const remove = jest.spyOn(notificationsApi, "remove").mockResolvedValue(undefined as never);
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    renderScreen();
    fireEvent.press(await screen.findByTestId("notification-delete-9"));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(9));
    expect(router.push).not.toHaveBeenCalled();
  });
});

// ── BACK TO THE APP GRID (owner's known issue; as Notes does) ─────────────
describe("back", () => {
  it("goes back when Home is behind", async () => {
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [], unreadCount: 0, hasMore: false });
    renderScreen();
    fireEvent.press(screen.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("goes Home when nothing is behind (opened from a push or a link)", async () => {
    router.canGoBack.mockReturnValue(false);
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [], unreadCount: 0, hasMore: false });
    renderScreen();
    fireEvent.press(screen.getByLabelText("Back"));
    expect(router.replace).toHaveBeenCalledWith("/home");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("Android back with nothing behind goes Home instead of leaving the app", async () => {
    const { BackHandler } = jest.requireActual("react-native");
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, "addEventListener").mockImplementation((...args: unknown[]) => {
      handlers.push(args[1] as () => boolean);
      return { remove: () => undefined };
    });
    router.canGoBack.mockReturnValue(false);
    jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [], unreadCount: 0, hasMore: false });
    renderScreen();
    let handled = false;
    act(() => { handled = handlers.some((h) => h()); });
    expect(handled).toBe(true);
    expect(router.replace).toHaveBeenCalledWith("/home");
  });
});

// ── NOT BLANK WHILE LOADING (audit P2) ────────────────────────────────────
it("shows rows in the rows' shape while the first page loads", async () => {
  jest.spyOn(notificationsApi, "list").mockReturnValue(new Promise(() => undefined));
  renderScreen();
  expect(await screen.findByTestId("notifications-loading", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByTestId("notifications-empty")).toBeNull();
});
