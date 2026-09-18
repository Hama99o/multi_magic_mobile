/**
 * People chat at the boundary — and every test here pins one of the four
 * corrections in `docs/design/people-chat/SPEC.md` §0.
 *
 * Each of the four would have "worked": a blank row instead of a name, a badge
 * counting the wrong noun, a delete that reads as permanent. None of them
 * throws, which is exactly why they are tests rather than comments.
 */
import MockAdapter from "axios-mock-adapter";
import { conversationsApi, threadApi, absoluteUrl } from "../conversations";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

function directRow(extra: object = {}) {
  return {
    id: 7,
    created_at: "2026-09-18T09:00:00Z",
    updated_at: "2026-09-18T10:00:00Z",
    // NULL, which is the whole point of the first test.
    title: null,
    is_group: false,
    can_delete: true,
    is_admin: false,
    user: {
      id: 2,
      fullname: "Anisa Rahimi",
      email: "anisa@example.com",
      avatar: "/rails/active_storage/blobs/abc/photo.jpg",
      is_online: true,
    },
    participants: [],
    last_message: null,
    unread_messages_count: 3,
    ...extra,
  };
}

function page(rows: object[], meta: object = {}) {
  return {
    conversations: rows,
    meta: { pagy: { pages: 1 }, total_count: rows.length, unread_conversations: 2, ...meta },
  };
}

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});

afterEach(() => mock.restore());

// ── CORRECTION 1 ────────────────────────────────────────────────────────────
//
// A direct conversation's `title` is NULL — `create_one_to_one` never sets one.
// A list built on it is blank rows for most of the list, and nothing errors.
describe("the row's name", () => {
  it("comes from user.fullname, NOT from the null title", async () => {
    mock.onGet("/api/v1/conversations").reply(200, page([directRow()]));

    const { conversations } = await conversationsApi.list();

    expect(conversations[0].displayName).toBe("Anisa Rahimi");
  });

  it("falls back to the email, because fullname is `.presence` and can be null", async () => {
    mock
      .onGet("/api/v1/conversations")
      .reply(200, page([directRow({ user: { id: 2, fullname: null, email: "a@b.co" } })]));

    const { conversations } = await conversationsApi.list();

    expect(conversations[0].displayName).toBe("a@b.co");
  });

  it("reads a GROUP the same way — the serializer already substituted its title", async () => {
    mock.onGet("/api/v1/conversations").reply(
      200,
      page([
        directRow({
          is_group: true,
          title: "Family",
          user: { fullname: "Family", is_online: false },
        }),
      ]),
    );

    const { conversations } = await conversationsApi.list();

    expect(conversations[0].displayName).toBe("Family");
    expect(conversations[0].isGroup).toBe(true);
  });
});

// ── CORRECTION 2 ────────────────────────────────────────────────────────────
//
// `unread_messages_count` means CONVERSATIONS on the collection and MESSAGES on
// a row. Same name, two meanings, one endpoint apart.
describe("the two unread counts", () => {
  it("a ROW's unread_messages_count is a MESSAGE count", async () => {
    mock.onGet("/api/v1/conversations").reply(200, page([directRow()]));

    const { conversations } = await conversationsApi.list();

    expect(conversations[0].unreadMessages).toBe(3);
  });

  it("the COLLECTION's unread_messages_count is a CONVERSATION count", async () => {
    mock
      .onGet("/api/v1/conversations/unread_messages_count")
      .reply(200, { unread_messages_count: 4, unread_messages_total: 19 });

    await expect(conversationsApi.unreadCount()).resolves.toEqual({
      unreadConversations: 4,
      unreadMessagesTotal: 19,
    });
  });
});

// ── CORRECTION 3 ────────────────────────────────────────────────────────────
//
// There is no `is_ai` to filter. `Conversation.for_member` opens with `human`,
// so assistant sessions are not on this wire at all.
describe("assistant sessions", () => {
  it("are absent from the payload — the client does no filtering", async () => {
    mock.onGet("/api/v1/conversations").reply(200, page([directRow()]));

    const { conversations } = await conversationsApi.list();

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).not.toHaveProperty("isAi");
  });
});

// ── CORRECTION 4 ────────────────────────────────────────────────────────────
describe("DELETE is clear-for-me", () => {
  it("is named clearForMe and hits the conversation, not a message", async () => {
    mock.onDelete("/api/v1/conversations/7").reply(200, {
      message: "Conversation deleted for you.",
    });

    await expect(conversationsApi.clearForMe(7)).resolves.toBeUndefined();
    expect(mock.history.delete[0].url).toBe("/api/v1/conversations/7");
  });
});

describe("mark_read", () => {
  it("POSTs to the member route, so opening a thread does not wait on a socket", async () => {
    mock.onPost("/api/v1/conversations/7/mark_read").reply(200, {
      conversation: directRow({ unread_messages_count: 0 }),
    });

    const conversation = await conversationsApi.markRead(7);

    expect(mock.history.post[0].url).toBe("/api/v1/conversations/7/mark_read");
    expect(conversation.unreadMessages).toBe(0);
  });
});

describe("sending", () => {
  it("POSTs a nested `message` param, which is what `params.expect` requires", async () => {
    mock.onPost("/api/v1/conversations/7/messages").reply(201, {
      id: 91,
      conversation_id: 7,
      user_id: 1,
      role: "user",
      body: "on my way",
      created_at: "2026-09-18T10:05:00Z",
      deleted: false,
      sent_by_me: true,
      edited_at: null,
      read_at: null,
      reactions: [],
    });

    const saved = await threadApi.send(7, "on my way");

    expect(JSON.parse(mock.history.post[0].data)).toEqual({ message: { body: "on my way" } });
    // The server's own id, so the MessageChannel echo merges rather than
    // appearing twice.
    expect(saved.id).toBe(91);
    expect(saved.sentByMe).toBe(true);
  });
});

describe("reacting", () => {
  it("is ONE endpoint for add and remove — the same emoji twice takes it back", async () => {
    mock.onPost("/api/v1/conversations/7/messages/91/reactions").reply(200, {
      id: 91,
      conversation_id: 7,
      user_id: 1,
      role: "user",
      body: "on my way",
      created_at: "2026-09-18T10:05:00Z",
      deleted: false,
      sent_by_me: true,
      edited_at: null,
      read_at: null,
      reactions: [{ emoji: "👍", count: 1, mine: true }],
    });

    const updated = await threadApi.react(7, 91, "👍");

    expect(JSON.parse(mock.history.post[0].data)).toEqual({ emoji: "👍" });
    expect(updated.reactions).toEqual([{ emoji: "👍", count: 1, mine: true }]);
    // No DELETE route exists for a reaction, and none is called.
    expect(mock.history.delete).toHaveLength(0);
  });
});

describe("a deleted message", () => {
  it("keeps its place: deleted true, body null — never dropped from the list", async () => {
    mock.onDelete("/api/v1/conversations/7/messages/91").reply(200, {
      id: 91,
      conversation_id: 7,
      user_id: 1,
      role: "user",
      body: null,
      created_at: "2026-09-18T10:05:00Z",
      deleted: true,
      sent_by_me: true,
      edited_at: null,
      read_at: null,
      reactions: [],
    });

    const removed = await threadApi.remove(7, 91);

    expect(removed.deleted).toBe(true);
    expect(removed.body).toBeNull();
  });
});

describe("avatar paths", () => {
  it("absolutises a relative Active Storage path", () => {
    expect(absoluteUrl("/rails/active_storage/blobs/abc/p.jpg")).toBe(
      `${http.defaults.baseURL}/rails/active_storage/blobs/abc/p.jpg`,
    );
  });

  it("leaves an absolute URL alone, and null alone", () => {
    expect(absoluteUrl("https://cdn.example.com/p.jpg")).toBe("https://cdn.example.com/p.jpg");
    expect(absoluteUrl(null)).toBeNull();
  });
});
