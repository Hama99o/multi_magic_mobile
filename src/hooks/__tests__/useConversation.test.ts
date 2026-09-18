/**
 * The reconnect-then-resync rule, which is the reason this app has a Phase 1.
 *
 * Every failure here is invisible on a screen: a reply that never arrives looks
 * like the assistant thinking, and a resync that reads the wrong endpoint looks
 * like an empty conversation.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockSubscribe = jest.fn();
jest.mock("@/lib/cable", () => ({
  subscribeToChannel: (...args: unknown[]) => mockSubscribe(...args),
}));

// Below the mock on purpose: `jest.mock`'s factory closes over `mockSubscribe`,
// and importing the hook above it would run the factory during that const's
// temporal dead zone.
/* eslint-disable import/first */
import { useConversation } from "../useConversation";
import { messagesApi, type ChatMessage } from "@/api/ai";

function message(id: number, role: "user" | "assistant", body: string): ChatMessage {
  return {
    id, conversationId: 4, role, body,
    createdAt: "2026-09-18T10:00:00Z", deleted: false,
    userId: role === "user" ? 2 : null, sentByMe: role === "user",
    editedAt: null, readAt: null, reactions: [], links: [], sources: [],
    undoable: false, undoneAt: null,
  };
}

/** The raw serializer shape, as a socket frame carries it. */
function rawMessage(id: number, role: string, body: string, conversationId = 4) {
  return {
    id, conversation_id: conversationId, user_id: role === "user" ? 2 : null, role, body,
    created_at: "2026-09-18T10:00:00Z", deleted: false,
    sent_by_me: role === "user", edited_at: null, read_at: null,
    reactions: [], links: [], sources: [], undoable: false, undone_at: null,
  };
}

/** The listener the hook handed the cable, so a test can drive the socket. */
type Listener = { onData: (p: unknown) => void; onConnected?: () => void };
const listener = (): Listener => mockSubscribe.mock.calls.at(-1)![1] as Listener;

let latest: jest.SpyInstance;
let before: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockSubscribe.mockReturnValue(() => {});
  latest = jest.spyOn(messagesApi, "latest").mockResolvedValue({
    messages: [message(1, "user", "Do I owe anyone?")],
    hasMore: false,
  });
  before = jest.spyOn(messagesApi, "before");
});

afterEach(() => jest.restoreAllMocks());

const render = () =>
  renderHook(() => useConversation({ conversationId: 4, channel: "MessageChannel" }));

describe("opening a conversation", () => {
  it("reads the transcript from the messages endpoint", async () => {
    const { result } = render();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(latest).toHaveBeenCalledWith(4);
    expect(result.current.messages.map((m) => m.body)).toEqual(["Do I owe anyone?"]);
  });

  it("subscribes to the channel it was given, not to a hardcoded one", async () => {
    renderHook(() =>
      useConversation({
        conversationId: 9,
        channel: "ConversationChannel",
        channelParams: { conversation_id: 9 },
      }),
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
    // The assistant is the first CONSUMER of this hook, not its shape.
    expect(mockSubscribe.mock.calls[0][0]).toBe("ConversationChannel");
    expect(mockSubscribe.mock.calls[0][2]).toEqual({ conversation_id: 9 });
  });
});

// ── THE RULE THE SPINE EXISTS FOR ───────────────────────────────────────────
describe("reconnecting", () => {
  it("RE-READS the transcript on every reconnect", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(latest).toHaveBeenCalledTimes(1);

    // The phone went through a tunnel. ActionCable replays nothing, so a reply
    // broadcast meanwhile exists only in the transcript.
    latest.mockResolvedValue({
      messages: [
        message(1, "user", "Do I owe anyone?"),
        message(2, "assistant", "You lent Ahmad 500."),
      ],
      hasMore: false,
    });
    await act(async () => {
      listener().onConnected?.();
    });

    expect(latest).toHaveBeenCalledTimes(2);
    expect(result.current.messages.map((m) => m.body)).toEqual([
      "Do I owe anyone?",
      "You lent Ahmad 500.",
    ]);
  });

  it("MERGES rather than replaces, so a reply mid-flight is not dropped", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // A reply arrives on the socket...
    await act(async () => {
      listener().onData({ message: rawMessage(2, "assistant", "Landed on the socket") });
    });
    // ...and a resync returns a page that predates it.
    await act(async () => {
      listener().onConnected?.();
    });

    expect(result.current.messages.map((m) => m.id)).toEqual([1, 2]);
  });
});

describe("waiting for an answer", () => {
  it("shows the question at once and waits", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.addPending(message(7, "user", "And Husna?")));

    // The question is on screen before the server has echoed it — the composer
    // cannot await a reply that arrives on a different transport.
    expect(result.current.messages.map((m) => m.id)).toContain(7);
    expect(result.current.awaitingReply).toBe(true);
  });

  it("stops waiting when the assistant's reply lands", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.addPending(message(7, "user", "And Husna?")));

    await act(async () => {
      listener().onData({ message: rawMessage(8, "assistant", "Husna owes you 200.") });
    });

    expect(result.current.awaitingReply).toBe(false);
    expect(result.current.messages.map((m) => m.body)).toContain("Husna owes you 200.");
  });

  // ── "ARRIVES, OR SAYS IT DID NOT" ─────────────────────────────────────────
  //
  // The server already broadcasts `aiError`. Without this branch a failed
  // question is indistinguishable from one still being thought about — for ever.
  it("reports the failure the server broadcasts", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.addPending(message(7, "user", "And Husna?")));

    await act(async () => {
      listener().onData({ aiError: true, conversationId: 4 });
    });

    expect(result.current.failed).toBe(true);
    expect(result.current.awaitingReply).toBe(false);
  });
});

describe("frames for another conversation", () => {
  it("ignores them — MessageChannel streams for the USER, not the thread", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      listener().onData({ message: rawMessage(99, "assistant", "another session", 77) });
    });

    expect(result.current.messages.map((m) => m.id)).not.toContain(99);
  });

  it("resyncs rather than dropping a frame it cannot parse", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(latest).toHaveBeenCalledTimes(1);

    await act(async () => {
      listener().onData({ message: { id: "not-a-number" } });
    });

    expect(latest).toHaveBeenCalledTimes(2);
  });
});

describe("older history", () => {
  it("pages by cursor from the oldest message on screen", async () => {
    latest.mockResolvedValue({ messages: [message(10, "user", "newest")], hasMore: true });
    before.mockResolvedValue({ messages: [message(9, "user", "older")], hasMore: false });
    const { result } = render();
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(before).toHaveBeenCalledWith(4, 10);
    expect(result.current.messages.map((m) => m.id)).toEqual([9, 10]);
    expect(result.current.hasOlder).toBe(false);
  });

  it("keeps what is on screen when loading history fails", async () => {
    latest.mockResolvedValue({ messages: [message(10, "user", "newest")], hasMore: true });
    before.mockRejectedValue(new Error("offline"));
    const { result } = render();
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(result.current.messages.map((m) => m.id)).toEqual([10]);
  });
});

// ── THE CHANNEL IS THE FAST PATH, NEVER THE ONLY ONE ────────────────────────
//
// AI_ASSISTANT.md §11. The web shipped the other version first and it meant "a
// question with no bubble and a spinner that only a reload could clear". These
// are the three things that replaced it.
describe("delivery that does not depend on the socket", () => {
  it("re-reads the transcript every 3s while a reply is pending", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useConversation({ conversationId: 4, channel: "MessageChannel" }),
    );
    await act(async () => {});
    latest.mockClear();

    act(() => result.current.addPending(message(7, "user", "And Husna?")));

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(latest).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(latest).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it("stops polling once nothing is pending", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useConversation({ conversationId: 4, channel: "MessageChannel" }),
    );
    await act(async () => {});
    latest.mockClear();

    // Never asked anything: an idle chat must not poll.
    await act(async () => {
      jest.advanceTimersByTime(12_000);
    });

    expect(latest).not.toHaveBeenCalled();
    expect(result.current.awaitingReply).toBe(false);
    jest.useRealTimers();
  });

  // Dots that never stop are indistinguishable from a lost reply, and the one
  // thing somebody cannot do with them is decide what to do next.
  it("gives the composer back after three minutes", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useConversation({ conversationId: 4, channel: "MessageChannel" }),
    );
    await act(async () => {});

    act(() => result.current.addPending(message(7, "user", "And Husna?")));
    expect(result.current.awaitingReply).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(180_000);
    });

    expect(result.current.awaitingReply).toBe(false);
    expect(result.current.failed).toBe(true);
    jest.useRealTimers();
  });

  // Clearing only on a socket frame is what made a delivered answer still look
  // pending: the poll brought it, so the poll has to clear the wait.
  it("clears the wait when a POLL brings the answer, not only a socket frame", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useConversation({ conversationId: 4, channel: "MessageChannel" }),
    );
    await act(async () => {});
    act(() => result.current.addPending(message(7, "user", "And Husna?")));

    latest.mockResolvedValue({
      messages: [message(7, "user", "And Husna?"), message(8, "assistant", "She owes you 200.")],
      hasMore: false,
    });
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    expect(result.current.awaitingReply).toBe(false);
    jest.useRealTimers();
  });

  // An assistant message OLDER than the question is not this question's answer.
  it("is not fooled by an older assistant message already on screen", async () => {
    latest.mockResolvedValue({
      messages: [message(1, "assistant", "an older answer")],
      hasMore: false,
    });
    const { result } = renderHook(() =>
      useConversation({ conversationId: 4, channel: "MessageChannel" }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.addPending(message(7, "user", "And Husna?")));
    await act(async () => {
      listener().onConnected?.();
    });

    expect(result.current.awaitingReply).toBe(true);
  });
});

describe("merging without expecting a reply", () => {
  // A thread with a PERSON never produces an assistant message, so routing its
  // sends and reactions through `addPending` would start the 3-second poll and
  // run it the full three minutes before the timeout released it — on a mobile
  // connection, for a thumbs-up.
  it("does NOT start the poll", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useConversation({ conversationId: 4, channel: "ConversationChannel" }),
    );
    await act(async () => {});
    latest.mockClear();

    act(() => result.current.mergeMessage(message(7, "user", "a message to a person")));

    expect(result.current.awaitingReply).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(12_000);
    });
    expect(latest).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("still puts the message on screen", async () => {
    const { result } = renderHook(() =>
      useConversation({ conversationId: 4, channel: "ConversationChannel" }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.mergeMessage(message(7, "user", "a message to a person")));

    expect(result.current.messages.map((m) => m.id)).toContain(7);
  });

  it("addPending still DOES expect one, for the assistant", async () => {
    const { result } = renderHook(() =>
      useConversation({ conversationId: 4, channel: "MessageChannel" }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.addPending(message(7, "user", "Do I owe anyone?")));

    expect(result.current.awaitingReply).toBe(true);
  });
});

describe("when the first read fails", () => {
  it("says so rather than showing an empty conversation", async () => {
    latest.mockRejectedValue(new Error("offline"));
    const { result } = render();

    // An empty transcript and a failed one look identical on screen; they are
    // opposite problems.
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.messages).toEqual([]);
  });
});
