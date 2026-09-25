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

  // ── THE QUESTION IS DRAWN BEFORE THE POST ANSWERS ────────────────────────
  //
  // Measured 2026-09-24 on `qa_phone4`: drawn only after the 202, the question
  // was on screen nowhere for ~1.4 s and the thread dropped back and jumped up.
  const draft = (body: string): Omit<ChatMessage, "id"> => {
    const { id: _id, ...rest } = message(0, "user", body);
    return rest;
  };

  it("draws an optimistic question at once, LAST in the thread, and waits", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => void result.current.addOptimistic(draft("And Husna?")));

    expect(result.current.messages.at(-1)?.body).toBe("And Husna?");
    expect(result.current.awaitingReply).toBe(true);
  });

  it("swaps the local id for the server's when the POST answers — one copy", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let localId = 0;
    act(() => { localId = result.current.addOptimistic(draft("And Husna?")); });

    act(() => result.current.confirmPending(localId, 7));

    expect(result.current.messages.map((m) => m.id)).toEqual([1, 7]);
  });

  it("keeps the row's KEY across the swap, so it does not remount and re-fade", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let localId = 0;
    act(() => { localId = result.current.addOptimistic(draft("And Husna?")); });
    const before = result.current.keyOf(result.current.messages.at(-1)!);

    act(() => result.current.confirmPending(localId, 7));

    expect(result.current.keyOf(result.current.messages.at(-1)!)).toBe(before);
  });

  it("does not show the question twice when the socket echo beats the POST", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let localId = 0;
    act(() => { localId = result.current.addOptimistic(draft("And Husna?")); });

    await act(async () => {
      listener().onData({ message: rawMessage(7, "user", "And Husna?") });
    });
    expect(result.current.messages.map((m) => m.id)).toEqual([1, 7]);

    act(() => result.current.confirmPending(localId, 7));
    expect(result.current.messages.map((m) => m.id)).toEqual([1, 7]);
  });

  it("takes the question back off the screen when the POST fails", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let localId = 0;
    act(() => { localId = result.current.addOptimistic(draft("And Husna?")); });

    act(() => result.current.dropPending(localId));

    expect(result.current.messages.map((m) => m.body)).toEqual(["Do I owe anyone?"]);
    expect(result.current.awaitingReply).toBe(false);
  });

  it("stops waiting when the answer to an optimistic question lands", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let localId = 0;
    act(() => { localId = result.current.addOptimistic(draft("And Husna?")); });
    act(() => result.current.confirmPending(localId, 7));

    await act(async () => {
      listener().onData({ message: rawMessage(8, "assistant", "Husna owes you 200.") });
    });

    expect(result.current.awaitingReply).toBe(false);
  });

  // ── THE POLL MUST NOT HAND EVERY ROW A NEW OBJECT ────────────────────────
  //
  // Measured 2026-09-24 on `qa_phone4`: identical-but-fresh copies from the
  // 3-second resync defeated `MessageRow`'s memo, and every poll re-parsed
  // every visible answer (413–602 ms commits).
  it("keeps the SAME object for a message a resync returns unchanged", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const before = result.current.messages[0];

    await act(async () => { await result.current.resync(); });

    expect(result.current.messages[0]).toBe(before);
  });

  it("but takes the new object when the message really changed", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    latest.mockResolvedValue({ messages: [{ ...message(1, "user", "Do I owe anyone?"), editedAt: "2026-09-18T11:00:00Z" }], hasMore: false });

    await act(async () => { await result.current.resync(); });

    expect(result.current.messages[0].editedAt).toBe("2026-09-18T11:00:00Z");
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

// ── THE SOCKET AUDIT, 2026-09-24 ──────────────────────────────────────────
describe("a reconnect after more than a page arrived", () => {
  it("reads back until it meets what is on screen, so nothing in between is missing", async () => {
    latest.mockResolvedValue({ messages: [message(1, "user", "a"), message(2, "assistant", "b")], hasMore: false });
    const { result } = render();
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual([1, 2]));

    // Offline long enough for the newest page to start at 30, with a gap
    // between 2 and it.
    latest.mockResolvedValue({ messages: [message(30, "user", "x"), message(31, "assistant", "y")], hasMore: true });
    before.mockImplementation(async (_c: number, id: number) =>
      id === 30
        ? { messages: [message(10, "user", "m"), message(11, "assistant", "n")], hasMore: true }
        : { messages: [message(3, "user", "p"), message(4, "assistant", "q")], hasMore: true },
    );
    await act(async () => {
      listener().onConnected?.();
    });

    expect(before).toHaveBeenNthCalledWith(1, 4, 30);
    expect(before).toHaveBeenNthCalledWith(2, 4, 10);
    // It stopped at the page that met message 2, not at the start of history.
    expect(before).toHaveBeenCalledTimes(2);
    expect(result.current.messages.map((m) => m.id)).toEqual([1, 2, 3, 4, 10, 11, 30, 31]);
  });

  it("asks for nothing more when the newest page already meets the screen", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    latest.mockResolvedValue({ messages: [message(1, "user", "Do I owe anyone?"), message(2, "assistant", "No.")], hasMore: true });
    await act(async () => {
      listener().onConnected?.();
    });
    expect(before).not.toHaveBeenCalled();
  });
});

describe("a stale resync after an edit or a delete", () => {
  it("does not give a deleted message its words back", async () => {
    latest.mockResolvedValue({ messages: [message(2, "user", "secret")], hasMore: false });
    const { result } = render();
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await act(async () => {
      listener().onData({ message: { ...rawMessage(2, "user", "secret"), deleted: true, body: null } });
    });
    // A read that started before the delete lands after it.
    await act(async () => {
      listener().onConnected?.();
    });
    expect(result.current.messages[0]).toMatchObject({ deleted: true, body: null });
  });

  it("does not revert an edit", async () => {
    latest.mockResolvedValue({ messages: [message(2, "user", "old")], hasMore: false });
    const { result } = render();
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await act(async () => {
      listener().onData({ message: { ...rawMessage(2, "user", "new"), edited_at: "2026-09-24T22:00:00Z" } });
    });
    await act(async () => {
      listener().onConnected?.();
    });
    expect(result.current.messages[0]).toMatchObject({ body: "new", editedAt: "2026-09-24T22:00:00Z" });
  });

  it("but a LATER edit still wins", async () => {
    latest.mockResolvedValue({
      messages: [{ ...message(2, "user", "first"), editedAt: "2026-09-24T21:00:00Z" }],
      hasMore: false,
    });
    const { result } = render();
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await act(async () => {
      listener().onData({ message: { ...rawMessage(2, "user", "second"), edited_at: "2026-09-24T22:00:00Z" } });
    });
    expect(result.current.messages[0]).toMatchObject({ body: "second" });
  });
});

describe("messages the parser could not read", () => {
  it("are counted for the screen to say so", async () => {
    latest.mockResolvedValue({ messages: [message(1, "user", "Do I owe anyone?")], hasMore: false, unreadable: 1 });
    const { result } = render();
    await waitFor(() => expect(result.current.unreadable).toBe(1));
  });
});

describe("a conversation deleted on another device", () => {
  it("is GONE on a 404, so the screen can say so", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    latest.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    await act(async () => {
      listener().onConnected?.();
    });
    expect(result.current.status).toBe("gone");
  });

  it("but any other failure keeps a thread already shown", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    latest.mockRejectedValue({ isAxiosError: true, response: { status: 500 } });
    await act(async () => {
      listener().onConnected?.();
    });
    expect(result.current.status).toBe("ready");
  });
});


// The two cases where TEXT order and TIME order disagree; any other pair
// passes a text comparison by accident, which is what this test's first
// version did (planted, it stayed green).
it("keeps a newer edit against an older one whose text sorts later", async () => {
  latest.mockResolvedValue({ messages: [{ ...message(2, "user", "current"), editedAt: "2026-09-24T21:30:00Z" }], hasMore: false });
  const { result } = render();
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  // 22:00 at +02:00 is 20:00 UTC: OLDER than 21:30 UTC, though "22:00" > "21:30".
  await act(async () => {
    listener().onData({ message: { ...rawMessage(2, "user", "stale"), edited_at: "2026-09-24T22:00:00+02:00" } });
  });
  expect(result.current.messages[0]).toMatchObject({ body: "current" });
});

it("takes a newer edit whose text sorts earlier", async () => {
  latest.mockResolvedValue({ messages: [{ ...message(2, "user", "older"), editedAt: "2026-09-24T23:00:00+02:00" }], hasMore: false });
  const { result } = render();
  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  // 21:30 UTC is LATER than 23:00 at +02:00 (21:00 UTC), though "21:30" < "23:00".
  await act(async () => {
    listener().onData({ message: { ...rawMessage(2, "user", "newer"), edited_at: "2026-09-24T21:30:00Z" } });
  });
  expect(result.current.messages[0]).toMatchObject({ body: "newer" });
});
