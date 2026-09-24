/**
 * The three actions a person CONFIRMS on this screen — delete, mark all read,
 * clear read — had no error handling: a refusal put the row back on the next
 * reload with nothing said. Now the reason is shown (2026-09-24 error sweep).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {} }));

/* eslint-disable import/first */
import Notifications from "../notifications";
import { notificationsApi, type AppNotification } from "@/api/notifications";
import { testQueryClient } from "@/__tests__/queryClient";

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
