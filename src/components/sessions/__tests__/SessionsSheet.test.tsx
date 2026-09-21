/**
 * The sheet. The assertion that matters most is the ORDER of the row menu:
 * Clear before Delete, because offering the safe action first is what makes the
 * destructive confirm rare.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
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
  client = testQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SessionsSheet
        visible
        activeId={4}
        onClose={jest.fn()}
        onOpenSession={jest.fn()}
       
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
      expect(screen.getByTestId("delete-conversation-question")).toHaveTextContent(
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
    await waitFor(() => expect(screen.getByTestId("delete-conversation-yes")).toBeTruthy());

    fireEvent.press(screen.getByTestId("delete-conversation-yes"));

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

/**
 * NEW CHAT, WHEN AN EMPTY ONE IS ALREADY SITTING THERE.
 *
 * Watched on the rig 2026-09-21: the top of the real list read **"New chat ·
 * 0 messages · Yesterday"** — a conversation made on an earlier visit, never
 * asked anything, still the first row. Nothing cleans one up and pressing New
 * chat again simply added another, so the list fills with identical empties
 * and the conversation he actually wants is pushed further down every time.
 *
 * An empty conversation is indistinguishable from a new one, so opening the
 * one that exists is the same act from his side with one fewer row afterwards.
 */
describe("new chat", () => {
  it("opens the empty conversation that already exists instead of making another", async () => {
    const empty = session({ id: 9, title: "New chat", messageCount: 0, documentCount: 0 });
    (sessionsApi.list as jest.Mock).mockResolvedValue([empty, session({ id: 4 })]);
    const create = jest.spyOn(sessionsApi, "create");
    const onOpenSession = jest.fn();

    renderSheet({ onOpenSession });
    // Wait for the LIST, not the button. The button renders before the query
    // resolves, and pressing it then finds no sessions to reuse — which is the
    // real behaviour, and made this test fail for a reason that was mine.
    await waitFor(() => expect(screen.getByTestId("session-row-9")).toBeTruthy());
    fireEvent.press(screen.getByTestId("sessions-new"));

    await waitFor(() => expect(onOpenSession).toHaveBeenCalledWith(9));
    // The saving is the whole point: no second empty row afterwards.
    expect(create).not.toHaveBeenCalled();
  });

  it("still creates one when every conversation has something in it", async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue([
      session({ id: 4, messageCount: 12, documentCount: 3 }),
      session({ id: 5, messageCount: 2, documentCount: 0 }),
    ]);
    const create = jest
      .spyOn(sessionsApi, "create")
      .mockResolvedValue(session({ id: 11, title: "New chat", messageCount: 0, documentCount: 0 }));
    const onOpenSession = jest.fn();

    renderSheet({ onOpenSession });
    await waitFor(() => expect(screen.getByTestId("session-row-5")).toBeTruthy());
    fireEvent.press(screen.getByTestId("sessions-new"));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(onOpenSession).toHaveBeenCalledWith(11);
  });

  /**
   * A conversation with no messages but a FILE in it is not empty — somebody
   * put that file there and it is the thing they were about to ask about.
   * Reusing it would hand them a chat with a document they did not choose.
   */
  it("does not reuse a conversation that holds a file", async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue([
      session({ id: 7, title: "New chat", messageCount: 0, documentCount: 1 }),
    ]);
    const create = jest
      .spyOn(sessionsApi, "create")
      .mockResolvedValue(session({ id: 12, messageCount: 0, documentCount: 0 }));

    renderSheet();
    await waitFor(() => expect(screen.getByTestId("session-row-7")).toBeTruthy());
    fireEvent.press(screen.getByTestId("sessions-new"));

    await waitFor(() => expect(create).toHaveBeenCalled());
  });
});

/**
 * A RENAMED CONVERSATION IS NOT AN EMPTY ONE — found on a device, not here.
 *
 * The first version of the reuse above took any conversation with no messages
 * and no files. The QA account holds one called "QA switch target", renamed by
 * a flow on an earlier run and never used since, and pressing New chat handed
 * that back: a conversation with a name somebody else chose, instead of the
 * new one being asked for. `15-sessions-switch` and `19-session-options` both
 * failed on it, which is how it surfaced at all.
 *
 * A title somebody set is a decision and emptiness does not cancel it.
 */
describe("new chat, and what counts as unnamed", () => {
  it("does not hand back an empty conversation somebody renamed", async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue([
      session({ id: 21, title: "QA switch target", messageCount: 0, documentCount: 0 }),
    ]);
    const create = jest
      .spyOn(sessionsApi, "create")
      .mockResolvedValue(session({ id: 22, title: "New chat", messageCount: 0, documentCount: 0 }));
    const onOpenSession = jest.fn();

    renderSheet({ onOpenSession });
    await waitFor(() => expect(screen.getByTestId("session-row-21")).toBeTruthy());
    fireEvent.press(screen.getByTestId("sessions-new"));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(onOpenSession).toHaveBeenCalledWith(22);
  });

  // `ai/sessions.rb:15` keeps both of these as "never named".
  it("treats the server's other default title as unnamed too", async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue([
      session({ id: 31, title: "AI Assistant", messageCount: 0, documentCount: 0 }),
    ]);
    const create = jest.spyOn(sessionsApi, "create");
    const onOpenSession = jest.fn();

    renderSheet({ onOpenSession });
    await waitFor(() => expect(screen.getByTestId("session-row-31")).toBeTruthy());
    fireEvent.press(screen.getByTestId("sessions-new"));

    await waitFor(() => expect(onOpenSession).toHaveBeenCalledWith(31));
    expect(create).not.toHaveBeenCalled();
  });
});
