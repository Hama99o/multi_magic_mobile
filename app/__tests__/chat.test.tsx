/**
 * The conversation, at the level a user meets it.
 *
 * The assertions that matter are about the ASYNCHRONY: a question must appear
 * before any answer exists, must not vanish when posting fails, and must be
 * distinguishable from one that is merely slow.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
  Link: ({ children }: { children: unknown }) => children,
}));

const mockUseConversation = jest.fn();
jest.mock("@/hooks/useConversation", () => ({
  useConversation: (...a: unknown[]) => mockUseConversation(...a),
}));

/* eslint-disable import/first */
import Chat from "../chat";
import { aiApi, type ChatMessage } from "@/api/ai";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

function message(id: number, role: "user" | "assistant", body: string, sources: unknown[] = []) {
  return {
    id, conversationId: 4, role, body, createdAt: "2026-09-18T10:00:00Z",
    deleted: false, userId: role === "user" ? 2 : null, sentByMe: role === "user",
    editedAt: null, readAt: null, reactions: [], links: [], sources,
    undoable: false, undoneAt: null,
  } as ChatMessage;
}

let conversation: Record<string, unknown>;
let addPending: jest.Mock;

/**
 * The session id arrives from `useQuery`, so nothing can be posted until it
 * resolves — `POST /ai/show` requires `conversation_id` and the screen refuses
 * to send without one. Waiting on the hook's argument proves the query landed,
 * rather than guessing with a timer.
 */
async function waitForSession() {
  await waitFor(() =>
    expect(mockUseConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 4 }),
    ),
  );
}

/**
 * Held so `afterEach` can clear it. A QueryClient keeps garbage-collection
 * timers running after the tree unmounts, and Jest reports that as "a worker
 * process has failed to exit gracefully" — a warning that looks like a leak in
 * the code under test and would eventually read as flake in CI.
 */
let client: QueryClient | null = null;

function renderChat() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Chat />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  // `useDraft` persists to AsyncStorage and the mock store is shared across
  // tests — so a question typed in one test comes back as the draft in the
  // next. That is the draft feature working; each test wants a fresh device.
  await AsyncStorage.clear();
  addPending = jest.fn();
  conversation = {
    messages: [], status: "ready", awaitingReply: false, failed: false,
    hasOlder: false, loadOlder: jest.fn(), addPending, resync: jest.fn(),
  };
  mockUseConversation.mockImplementation(() => conversation);
  jest.spyOn(aiApi, "currentSessionId").mockResolvedValue(4);
  jest.spyOn(aiApi, "ask").mockResolvedValue({ conversationId: 4, userMessageId: 11 });
});

afterEach(() => {
  client?.clear();
  client = null;
  jest.restoreAllMocks();
});

describe("the empty state", () => {
  it("offers questions about the user's OWN data, not a greeting", async () => {
    renderChat();

    await waitFor(() => expect(screen.getByTestId("chat-empty")).toBeTruthy());
    // Answering from his own data is the entire difference between this and any
    // chat app he could install instead, so the empty state says so.
    expect(screen.getByText("Do I owe anyone money?")).toBeTruthy();
  });

  it("asks an example when it is tapped", async () => {
    renderChat();
    await waitForSession();
    await waitFor(() => expect(screen.getByTestId("chat-empty")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText("Do I owe anyone money?"));
    });

    await waitFor(() =>
      expect(aiApi.ask).toHaveBeenCalledWith({ conversationId: 4, body: "Do I owe anyone money?" }),
    );
  });
});

describe("posting a question", () => {
  it("draws it immediately, using the SERVER's id so the socket echo merges", async () => {
    renderChat();
    await waitForSession();

    fireEvent.changeText(screen.getByTestId("composer-input"), "Do I owe anyone?");
    await act(async () => {
      fireEvent.press(screen.getByTestId("composer-send"));
    });

    // 202 carries the user_message_id. Inventing a local id would show the
    // question twice the moment the socket echoed it back.
    await waitFor(() =>
      expect(addPending).toHaveBeenCalledWith(expect.objectContaining({ id: 11, sentByMe: true })),
    );
  });

  // ── A QUESTION MUST NEVER VANISH ──────────────────────────────────────────
  it("puts the question BACK when posting fails", async () => {
    (aiApi.ask as jest.Mock).mockRejectedValue({ response: { status: 500 }, isAxiosError: true });
    renderChat();
    await waitForSession();

    fireEvent.changeText(screen.getByTestId("composer-input"), "Do I owe anyone?");
    await act(async () => {
      fireEvent.press(screen.getByTestId("composer-send"));
    });

    await waitFor(() => expect(screen.getByTestId("chat-send-failed")).toBeTruthy());
    // Back in the composer, not lost to an optimistic bubble.
    expect(screen.getByTestId("composer-input").props.value).toBe("Do I owe anyone?");
  });

  it("says WAIT on a 429 rather than showing a failure", async () => {
    (aiApi.ask as jest.Mock).mockRejectedValue({ response: { status: 429 }, isAxiosError: true });
    renderChat();
    await waitForSession();

    fireEvent.changeText(screen.getByTestId("composer-input"), "hello");
    await act(async () => {
      fireEvent.press(screen.getByTestId("composer-send"));
    });

    // A substring match: the row also carries the Retry button's label, and
    // `toHaveTextContent` compares the node's full text.
    await waitFor(() => expect(screen.getByText(/You have asked a lot in a short time/)).toBeTruthy());
  });

  it("will not send an empty question", async () => {
    renderChat();
    await waitForSession();

    fireEvent.press(screen.getByTestId("composer-send"));

    expect(aiApi.ask).not.toHaveBeenCalled();
  });
});

describe("waiting for the answer", () => {
  it("shows the dots where the answer will appear", async () => {
    conversation.awaitingReply = true;
    renderChat();

    // The only thing standing between a posted question and silence.
    await waitFor(() => expect(screen.getByTestId("thinking")).toBeTruthy());
  });

  // The server broadcasts `aiError`. Without this the question looks like it is
  // still being thought about, for ever.
  it("says the answer did not arrive, and offers to ask again", async () => {
    conversation.failed = true;
    conversation.messages = [message(1, "user", "Do I owe anyone?")];
    renderChat();

    await waitFor(() => expect(screen.getByTestId("chat-answer-failed")).toBeTruthy());
    expect(screen.getByText("Ask again")).toBeTruthy();
  });
});

describe("the answer", () => {
  it("renders sources as chips when there are any", async () => {
    conversation.messages = [
      message(2, "assistant", "You lent Ahmad 500.", [
        { label: "Loan to Ahmad", path: "/loans/3" },
      ]),
    ];
    renderChat();

    // The receipt under the claim — already on the wire, and easy to never show.
    await waitFor(() => expect(screen.getByTestId("source-chips")).toBeTruthy());
    expect(screen.getByText("Loan to Ahmad")).toBeTruthy();
  });

  // No sources means a different KIND of answer — one from the model's own
  // knowledge rather than from his data. An empty "Sources" heading would hide
  // that distinction.
  it("shows NO row at all when an answer has no sources", async () => {
    conversation.messages = [message(2, "assistant", "I am not sure.")];
    renderChat();

    await waitFor(() => expect(screen.getByTestId("assistant-answer")).toBeTruthy());
    expect(screen.queryByTestId("source-chips")).toBeNull();
  });

  it("opens a preview sheet when a chip is tapped", async () => {
    conversation.messages = [
      message(2, "assistant", "You lent Ahmad 500.", [
        { label: "Loan to Ahmad", path: "/loans/3" },
      ]),
    ];
    renderChat();
    await waitFor(() => expect(screen.getByTestId("source-chips")).toBeTruthy());

    fireEvent.press(screen.getByText("Loan to Ahmad"));

    // A sheet, because this app has no loan screen to open — and seeing WHY the
    // assistant said it is the point.
    await waitFor(() => expect(screen.getByTestId("source-sheet")).toBeTruthy());
    expect(screen.getByText("Open in MultiMagic")).toBeTruthy();
  });
});

describe("when the transcript cannot be read", () => {
  it("says so instead of showing an empty conversation", async () => {
    conversation.status = "failed";
    renderChat();

    await waitFor(() => expect(screen.getByTestId("chat-load-failed")).toBeTruthy());
    expect(screen.queryByTestId("chat-empty")).toBeNull();
  });
});
