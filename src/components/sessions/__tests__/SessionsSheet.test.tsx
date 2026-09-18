/**
 * The sheet. The assertion that matters most is the ORDER of the row menu:
 * Clear before Delete, because offering the safe action first is what makes the
 * destructive confirm rare.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionsSheet } from "../SessionsSheet";
import { sessionsApi, type AiSession } from "@/api/ai";

function session(over: Partial<AiSession> = {}): AiSession {
  return {
    id: 4, title: "Money", messageCount: 12, documentCount: 3,
    createdAt: "2026-09-01T09:00:00Z", updatedAt: new Date().toISOString(),
    instructions: null, apps: [], ...over,
  };
}

let client: QueryClient | null = null;

function renderSheet(props: Partial<React.ComponentProps<typeof SessionsSheet>> = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionsSheet
        visible
        activeId={4}
        onClose={jest.fn()}
        onOpenSession={jest.fn()}
        onSignOut={jest.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(sessionsApi, "list").mockResolvedValue([session()]);
});

afterEach(() => {
  client?.clear();
  client = null;
  jest.restoreAllMocks();
});

describe("the list", () => {
  it("shows the counts the serializer already carries", async () => {
    renderSheet();

    await waitFor(() => expect(screen.getByTestId("session-row-4")).toBeTruthy());
    // The file count is not decoration — it is what makes the delete copy honest.
    expect(screen.getByText("12 messages · 3 files")).toBeTruthy();
  });

  it("omits the file count when a session has none", async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue([session({ documentCount: 0 })]);
    renderSheet();

    await waitFor(() => expect(screen.getByText("12 messages")).toBeTruthy());
  });

  it("refuses a 51st conversation and says which limit it hit", async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => session({ id: i + 1 })),
    );
    renderSheet();

    // Enforced before the request, so the server's error is never the first
    // the user hears of it.
    await waitFor(() => expect(screen.getByTestId("sessions-at-limit")).toBeTruthy());
    expect(screen.getByTestId("sessions-new").props.accessibilityState.disabled).toBe(true);
  });
});

// ── THE ORDER IS THE SAFETY MECHANISM ───────────────────────────────────────
describe("the row menu", () => {
  it("offers Clear BEFORE Delete", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("session-menu-4")).toBeTruthy());

    fireEvent.press(screen.getByTestId("session-menu-4"));

    await waitFor(() => expect(screen.getByTestId("session-menu")).toBeTruthy());
    const menu = screen.getByTestId("session-menu");
    const ids = menu.props.children
      .flat()
      .filter(Boolean)
      .map((c: { props?: { testID?: string } }) => c?.props?.testID)
      .filter(Boolean);

    // Most delete presses mean "this chat got messy". Offering the
    // non-destructive answer first makes the destructive confirm rare.
    expect(ids.indexOf("session-menu-clear")).toBeLessThan(ids.indexOf("session-menu-delete"));
  });

  it("says plainly that clearing keeps the files", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("session-menu-4")).toBeTruthy());
    fireEvent.press(screen.getByTestId("session-menu-4"));

    await waitFor(() =>
      expect(screen.getByText("Empties this chat. Its files stay.")).toBeTruthy(),
    );
  });

  it("clears without a heavy confirm — it is not the dangerous one", async () => {
    const clear = jest.spyOn(sessionsApi, "clear").mockResolvedValue(session({ messageCount: 0 }));
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("session-menu-4")).toBeTruthy());
    fireEvent.press(screen.getByTestId("session-menu-4"));
    await waitFor(() => expect(screen.getByTestId("session-menu-clear")).toBeTruthy());

    fireEvent.press(screen.getByTestId("session-menu-clear"));

    await waitFor(() => expect(clear).toHaveBeenCalledWith(4));
  });
});

describe("deleting", () => {
  it("asks first, naming the file count from the row", async () => {
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("session-menu-4")).toBeTruthy());
    fireEvent.press(screen.getByTestId("session-menu-4"));
    await waitFor(() => expect(screen.getByTestId("session-menu-delete")).toBeTruthy());

    fireEvent.press(screen.getByTestId("session-menu-delete"));

    await waitFor(() =>
      expect(screen.getByTestId("delete-confirm-question")).toHaveTextContent(
        "Delete this conversation and the 3 files in it?",
      ),
    );
  });

  it("opens the session the SERVER hands back, rather than inventing one", async () => {
    const onOpenSession = jest.fn();
    jest.spyOn(sessionsApi, "destroy").mockResolvedValue(session({ id: 9, title: "New chat" }));
    renderSheet({ onOpenSession });

    await waitFor(() => expect(screen.getByTestId("session-menu-4")).toBeTruthy());
    fireEvent.press(screen.getByTestId("session-menu-4"));
    await waitFor(() => expect(screen.getByTestId("session-menu-delete")).toBeTruthy());
    fireEvent.press(screen.getByTestId("session-menu-delete"));
    await waitFor(() => expect(screen.getByTestId("delete-confirm-yes")).toBeTruthy());

    fireEvent.press(screen.getByTestId("delete-confirm-yes"));

    // The server never leaves the user with nowhere to talk.
    await waitFor(() => expect(onOpenSession).toHaveBeenCalledWith(9));
  });
});

describe("failures", () => {
  it("says so rather than closing silently", async () => {
    jest.spyOn(sessionsApi, "create").mockRejectedValue({
      response: { status: 500, data: { error: "Could not start a new conversation." } },
      isAxiosError: true,
    });
    renderSheet();
    await waitFor(() => expect(screen.getByTestId("sessions-new")).toBeTruthy());

    fireEvent.press(screen.getByTestId("sessions-new"));

    await waitFor(() => expect(screen.getByTestId("sessions-error")).toBeTruthy());
  });
});
