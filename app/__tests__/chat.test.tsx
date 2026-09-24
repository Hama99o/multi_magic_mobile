/**
 * The conversation, at the level a user meets it.
 *
 * The assertions that matter are about the ASYNCHRONY: a question must appear
 * before any answer exists, must not vanish when posting fails, and must be
 * distinguishable from one that is merely slow.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, FlatList } from "react-native";

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
import { aiApi, documentsApi, type ChatMessage } from "@/api/ai";
import { useReachability } from "@/stores/reachability.store";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
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
let addOptimistic: jest.Mock;
let confirmPending: jest.Mock;
let dropPending: jest.Mock;

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
  client = testQueryClient({ queries: { staleTime: 0 } });
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
  addOptimistic = jest.fn(() => 9_000_000_000_000_000);
  confirmPending = jest.fn();
  dropPending = jest.fn();
  conversation = {
    messages: [], status: "ready", awaitingReply: false, failed: false,
    hasOlder: false, loadOlder: jest.fn(), addOptimistic, confirmPending, dropPending,
    keyOf: (m: ChatMessage) => String(m.id), resync: jest.fn(),
  };
  mockUseConversation.mockImplementation(() => conversation);
  jest.spyOn(aiApi, "currentSessionId").mockResolvedValue(4);
  // Derived suggestions read from these; empty is the default, which is the
  // state an account with nothing in it is actually in.
  jest.spyOn(documentsApi, "list").mockResolvedValue([]);
  jest.spyOn(aiApi, "ask").mockResolvedValue({ conversationId: 4, userMessageId: 11 });
});

afterEach(() => {
  client?.clear();
  client = null;
  useReachability.setState({ reachable: true, unreachableSince: null });
  jest.restoreAllMocks();
});

describe("the empty state", () => {
  it("says what the assistant answers FROM, without inventing a question", async () => {
    renderChat();

    await waitFor(() => expect(screen.getByTestId("chat-empty")).toBeTruthy());
    expect(screen.getByText(/Ask about anything you have kept in MultiMagic/)).toBeTruthy();
  });

  // ── NO SUGGESTIONS IS A LEGITIMATE STATE ──────────────────────────────────
  //
  // His instruction: the prompts must be linked to his data and "should not be
  // a random thing". An account with nothing in it gets NO suggestions rather
  // than three invented ones — because a question the app suggested, answered
  // with "I could not find anything", is worse than no suggestion at all.
  it("offers NOTHING when there is nothing to derive from", async () => {
    renderChat();

    await waitFor(() => expect(screen.getByTestId("chat-empty")).toBeTruthy());
    expect(screen.queryAllByTestId("chat-prompt")).toHaveLength(0);
  });

  it("asks a derived suggestion when it is tapped", async () => {
    (documentsApi.list as jest.Mock).mockResolvedValue([
      { id: 1, filename: "payslip.pdf", contentType: "application/pdf", byteSize: 10, status: "ready" },
    ]);
    renderChat();
    await waitForSession();

    await waitFor(() => expect(screen.getByText("What does payslip.pdf say?")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText("What does payslip.pdf say?"));
    });

    // The question asked is the derived one, verbatim.
    await waitFor(() =>
      expect(aiApi.ask).toHaveBeenCalledWith({
        conversationId: 4,
        body: "What does payslip.pdf say?",
      }),
    );
  });
});

// ── THE LIST IS INVERTED, NEWEST FIRST ────────────────────────────────────
//
// Chosen 2026-09-24 after the chase was measured shaking the thread on
// `qa_phone4` (`useNewestAnchor`). Inverted with the data in the old order
// would open on the OLDEST message; the two only mean "newest at the bottom"
// together, so both are asserted.
describe("the thread", () => {
  it("is an inverted list with the newest message first in its data", async () => {
    conversation.messages = [message(1, "user", "First?"), message(2, "assistant", "Newest.")];
    renderChat();
    await waitForSession();

    const list = screen.UNSAFE_getByType(FlatList);
    expect(list.props.inverted).toBe(true);
    expect((list.props.data as ChatMessage[]).map((m) => m.id)).toEqual([2, 1]);
  });
});

// ── TYPING MUST NOT RE-RENDER THE LIST ───────────────────────────────────
//
// Measured 2026-09-24 on `qa_phone4` with React.Profiler: with inline list
// props every keystroke re-rendered every visible row and re-parsed its
// markdown, 212–382 ms a commit. `FlatList` is a PureComponent, so the proof
// is that none of its props changes identity across a keystroke.
describe("typing", () => {
  it("hands the list the SAME props before and after a keystroke", async () => {
    conversation.messages = [message(1, "user", "First?"), message(2, "assistant", "Newest.")];
    renderChat();
    await waitForSession();
    // Let the queries the screen starts on mount (session, starter prompts)
    // land first: their data arriving is a real change, not a keystroke's.
    fireEvent.changeText(screen.getByTestId("composer-input"), "D");
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const before = { ...screen.UNSAFE_getByType(FlatList).props };

    fireEvent.changeText(screen.getByTestId("composer-input"), "Do I");

    // IDENTITY ONLY — never `toEqual` here. A deep compare walks the list's
    // ref and React elements, and on 2026-09-24 it exhausted the Jest worker's
    // heap (FATAL: heap out of memory), in a tree other sessions run too.
    const after = screen.UNSAFE_getByType(FlatList).props;
    const changed = Object.keys(before).filter((key) => after[key] !== before[key]);
    expect(changed).toEqual([]);
  });
});

describe("posting a question", () => {
  // ── DRAWN BEFORE THE POST ANSWERS, THEN GIVEN THE SERVER'S ID ────────────
  //
  // Measured 2026-09-24, `qa_phone4`: drawing the bubble only after the 202
  // left the question on screen NOWHERE for ~1.4 s, and the thread dropped
  // back and jumped up. The echo-twice worry that kept it pessimistic is
  // handled in `useConversation`'s merge, and tested there.
  it("draws it BEFORE the server answers, then swaps in the server's id", async () => {
    let answer!: (v: { conversationId: number; userMessageId: number }) => void;
    (aiApi.ask as jest.Mock).mockReturnValue(new Promise((r) => { answer = r; }));
    renderChat();
    await waitForSession();

    fireEvent.changeText(screen.getByTestId("composer-input"), "Do I owe anyone?");
    await act(async () => {
      fireEvent.press(screen.getByTestId("composer-send"));
    });

    // The POST is still in flight, and the question is already drawn.
    expect(addOptimistic).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Do I owe anyone?", sentByMe: true }),
    );
    expect(confirmPending).not.toHaveBeenCalled();

    await act(async () => answer({ conversationId: 4, userMessageId: 11 }));
    expect(confirmPending).toHaveBeenCalledWith(9_000_000_000_000_000, 11);
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
    // Back in the composer, and the optimistic bubble taken back off.
    expect(screen.getByTestId("composer-input").props.value).toBe("Do I owe anyone?");
    expect(dropPending).toHaveBeenCalledWith(9_000_000_000_000_000);
  });

  // ── A 429 IS A WAIT, NOT A FAILURE ──────────────────────────────────────
  //
  // It used to be the danger tone with a Retry button — an invitation to do
  // the one thing that keeps the limit closed. Now: muted, a countdown, the
  // limits named, the question kept, and send off until the minute is up.
  it("says WAIT on a 429 rather than showing a failure", async () => {
    (aiApi.ask as jest.Mock).mockRejectedValue({ response: { status: 429 }, isAxiosError: true });
    renderChat();
    await waitForSession();

    fireEvent.changeText(screen.getByTestId("composer-input"), "hello");
    await act(async () => {
      fireEvent.press(screen.getByTestId("composer-send"));
    });

    await waitFor(() => expect(screen.getByTestId("chat-rate-limited")).toBeTruthy());
    expect(screen.getByText(/You have asked a lot in a short time/)).toBeTruthy();
    // Both caps are named, and the minute is counted down.
    expect(screen.getByText(/15 questions a minute and 200 an hour/)).toBeTruthy();
    expect(screen.getByText(/in 60 s/)).toBeTruthy();
    // Nothing red, no Retry, the question still in the field, send held.
    expect(screen.queryByTestId("chat-send-failed")).toBeNull();
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.getByTestId("composer-input").props.value).toBe("hello");
    expect(screen.getByTestId("composer-send").props.accessibilityState.disabled).toBe(true);
  });

  it("honours a Retry-After when the server sends one", async () => {
    (aiApi.ask as jest.Mock).mockRejectedValue({
      response: { status: 429, headers: { "retry-after": "12" }, data: {} },
      isAxiosError: true,
    });
    renderChat();
    await waitForSession();

    fireEvent.changeText(screen.getByTestId("composer-input"), "hello");
    await act(async () => {
      fireEvent.press(screen.getByTestId("composer-send"));
    });

    await waitFor(() => expect(screen.getByText(/in 12 s/)).toBeTruthy());
  });

  it("will not send an empty question", async () => {
    renderChat();
    await waitForSession();

    fireEvent.press(screen.getByTestId("composer-send"));

    expect(aiApi.ask).not.toHaveBeenCalled();
  });
});

describe("when MultiMagic is not answering", () => {
  // Observed, not assumed: the store flips when a request got no response.
  // The composer says so, keeps the draft, and holds send.
  it("says so under the composer and holds send", async () => {
    useReachability.setState({ reachable: false, unreachableSince: Date.now() });
    renderChat();
    await waitForSession();

    fireEvent.changeText(screen.getByTestId("composer-input"), "Do I owe anyone?");

    expect(screen.getByTestId("composer-offline")).toBeTruthy();
    expect(screen.getByTestId("composer-send").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("composer-input").props.value).toBe("Do I owe anyone?");
  });

  it("comes back the moment the server answers", async () => {
    useReachability.setState({ reachable: false, unreachableSince: Date.now() });
    renderChat();
    await waitForSession();
    expect(screen.getByTestId("composer-offline")).toBeTruthy();

    act(() => useReachability.getState().markReachable());

    expect(screen.queryByTestId("composer-offline")).toBeNull();
  });
});

describe("waiting for the answer", () => {
  it("shows the dots where the answer will appear", async () => {
    conversation.awaitingReply = true;
    renderChat();

    // The only thing standing between a posted question and silence.
    await waitFor(() => expect(screen.getByTestId("thinking")).toBeTruthy());
  });

  /**
   * The sighted half of this is `scrollToEnd`: the screen moves to where the
   * answer landed. Someone using a screen reader got neither that nor a word,
   * so a posted question was followed by silence and the only way to find out
   * was to swipe the screen looking. docs/ACCESSIBILITY.md D1.
   *
   * The ARRIVAL is announced, not the answer — speaking paragraphs about
   * somebody's money unbidden takes the reading out of their hands.
   */
  it("says the answer arrived, because nothing else did", async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => {});
    conversation.awaitingReply = true;
    renderChat();
    await waitFor(() => expect(screen.getByTestId("thinking")).toBeTruthy());
    expect(announce).not.toHaveBeenCalledWith("Answer received.");

    conversation.awaitingReply = false;
    conversation.messages = [message(2, "assistant", "Your rent is 1,284.50 EUR.")];
    act(() => {
      screen.rerender(
        <QueryClientProvider client={client as QueryClient}>
          <Chat />
        </QueryClientProvider>,
      );
    });

    await waitFor(() => expect(announce).toHaveBeenCalledWith("Answer received."));
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
