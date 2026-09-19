/**
 * The assistant's API surface, and above all WHICH ENDPOINT THE RESYNC USES.
 */
import MockAdapter from "axios-mock-adapter";
import { aiApi, documentsApi, messagesApi, sessionsApi } from "../ai";
import { ApiShapeError } from "../parse";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

function message(id: number, role: string, body: string, extra: object = {}) {
  return {
    id,
    conversation_id: 4,
    user_id: role === "assistant" ? null : 2,
    role,
    body,
    created_at: "2026-09-18T10:00:00Z",
    deleted: false,
    sent_by_me: role === "user",
    edited_at: null,
    read_at: null,
    reactions: [],
    links: [],
    sources: [],
    ...extra,
  };
}

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});

afterEach(() => mock.restore());

// ── THE CORRECTION, PINNED ──────────────────────────────────────────────────
//
// `GET /api/v1/ai/conversation` returns `{ id: <number> }` and NOTHING ELSE.
// Resyncing against it would have "worked" — one integer, no error, and an
// empty transcript after every tunnel. These two tests exist so that swap can
// never be made silently.
describe("which endpoint gives what", () => {
  it("ai/conversation answers only WHICH session to open", async () => {
    mock.onGet("/api/v1/ai/conversation").reply(200, { id: 4 });

    await expect(aiApi.currentSessionId()).resolves.toBe(4);
  });

  it("the TRANSCRIPT comes from conversations/:id/messages", async () => {
    mock.onGet("/api/v1/conversations/4/messages").reply(200, {
      messages: [message(2, "assistant", "You owe 500."), message(1, "user", "Do I owe anyone?")],
      meta: { pagy: { pages: 1 }, total_count: 2 },
    });

    const page = await messagesApi.latest(4);

    expect(page.messages.map((m) => m.id)).toEqual([1, 2]);
    expect(page.hasMore).toBe(false);
  });
});

describe("messagesApi.latest", () => {
  it("reverses the server's newest-first into render order", async () => {
    mock.onGet("/api/v1/conversations/4/messages").reply(200, {
      messages: [message(9, "assistant", "third"), message(8, "user", "second"), message(7, "user", "first")],
      meta: { pagy: { pages: 3 }, total_count: 60 },
    });

    const page = await messagesApi.latest(4);

    expect(page.messages.map((m) => m.body)).toEqual(["first", "second", "third"]);
    expect(page.hasMore).toBe(true);
  });
});

describe("messagesApi.before", () => {
  // A cursor, not a page number: a conversation grows while you read it, so
  // every arriving reply shifts a page boundary and a page-2 fetch skips
  // whatever slid across it. That is how messages went missing on scroll-up in
  // the web app.
  it("pages by id cursor and reads has_more", async () => {
    mock.onGet("/api/v1/conversations/4/messages").reply(200, {
      messages: [message(3, "user", "older")],
      meta: { has_more: true },
    });

    const page = await messagesApi.before(4, 7);

    expect(mock.history.get[0].params).toEqual({ before_id: 7 });
    expect(page.hasMore).toBe(true);
  });
});

describe("the message parser", () => {
  it("keeps the fields a HUMAN thread needs, not just the assistant's subset", async () => {
    mock.onGet("/api/v1/conversations/4/messages").reply(200, {
      messages: [
        message(5, "user", "hi", {
          sent_by_me: false,
          user_id: 9,
          read_at: "2026-09-18T11:00:00Z",
          edited_at: "2026-09-18T10:30:00Z",
          reactions: [{ emoji: "👍", count: 2, mine: true }],
        }),
      ],
      meta: { pagy: { pages: 1 } },
    });

    const [m] = (await messagesApi.latest(4)).messages;

    // `sent_by_me` decides which side a bubble sits on and the SERVER has
    // already answered it — the client must not re-derive it from user ids.
    expect(m.sentByMe).toBe(false);
    expect(m.userId).toBe(9);
    expect(m.readAt).toBe("2026-09-18T11:00:00Z");
    expect(m.editedAt).toBe("2026-09-18T10:30:00Z");
    expect(m.reactions).toEqual([{ emoji: "👍", count: 2, mine: true }]);
  });

  it("parses the SOURCES already on the wire", async () => {
    mock.onGet("/api/v1/conversations/4/messages").reply(200, {
      messages: [
        message(6, "assistant", "You lent Ahmad 500.", {
          sources: [{ key: "loan", params: { id: "3" }, label: "Loan to Ahmad", path: "/loans/3" }],
        }),
      ],
      meta: { pagy: { pages: 1 } },
    });

    const [m] = (await messagesApi.latest(4)).messages;

    // The app's whole claim is that it answers from his own data. An answer
    // with no receipt under it is any chat app he could install instead.
    //
    // `key` is carried too — the route key is the server's own statement of
    // WHICH app a link belongs to (`frontend_routes.rb`), and it is what lets
    // a screen know the assistant just wrote to it without parsing a path.
    expect(m.sources).toEqual([{ label: "Loan to Ahmad", path: "/loans/3", key: "loan" }]);
  });

  it("treats a missing collection as empty, not as a shape error", async () => {
    mock.onGet("/api/v1/conversations/4/messages").reply(200, {
      messages: [{
        id: 1, conversation_id: 4, user_id: 2, role: "user", body: "hi",
        created_at: "2026-09-18T10:00:00Z", deleted: false, sent_by_me: true,
        edited_at: null, read_at: null,
      }],
      meta: { pagy: { pages: 1 } },
    });

    const [m] = (await messagesApi.latest(4)).messages;
    expect(m.sources).toEqual([]);
    expect(m.reactions).toEqual([]);
  });

  it("accepts a deleted message's null body", async () => {
    mock.onGet("/api/v1/conversations/4/messages").reply(200, {
      messages: [message(1, "user", null as unknown as string, { deleted: true })],
      meta: { pagy: { pages: 1 } },
    });

    const [m] = (await messagesApi.latest(4)).messages;
    expect(m.body).toBeNull();
    expect(m.deleted).toBe(true);
  });

  // An id arriving as a string breaks the cable subscription and the cursor
  // silently — `"7" !== 7`. Better to hear about it at the boundary.
  // ── role IS NULL FOR EVERY MESSAGE A PERSON SENDS ────────────────────────
  //
  // Only assistant turns carry one, and the serializer emits the field
  // unconditionally, so it arrives as null rather than absent. `str()` threw on
  // it and took all of people chat with it.
  it("accepts a null role, because a person's message has none", async () => {
    mock.onGet("/api/v1/conversations/4/messages").reply(200, {
      messages: [message(5, "user", "hello", { role: null })],
      meta: { pagy: { pages: 1 } },
    });

    const [m] = (await messagesApi.latest(4)).messages;
    expect(m.role).toBe("user");
  });

  it("REFUSES a stringified id instead of coercing it", async () => {
    mock.onGet("/api/v1/conversations/4/messages").reply(200, {
      messages: [message("7" as unknown as number, "user", "hi")],
      meta: { pagy: { pages: 1 } },
    });

    await expect(messagesApi.latest(4)).rejects.toBeInstanceOf(ApiShapeError);
  });
});

describe("asking a question", () => {
  it("sends conversation_id in snake_case and reads the 202 back", async () => {
    mock.onPost("/api/v1/ai/show").reply(202, { conversation_id: 4, user_message_id: 11 });

    const result = await aiApi.ask({ conversationId: 4, body: "Do I owe anyone?" });

    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      conversation_id: 4,
      body: "Do I owe anyone?",
    });
    // Nothing about the REPLY is in this response — it arrives over the socket.
    expect(result).toEqual({ conversationId: 4, userMessageId: 11 });
  });
});

describe("sessions", () => {
  const session = {
    id: 4, title: "Money", message_count: 12, document_count: 3,
    created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-18T10:00:00Z",
    instructions: null, apps: [],
  };

  it("lists with the counts the delete confirm needs", async () => {
    mock.onGet("/api/v1/ai/sessions").reply(200, { sessions: [session] });

    const [s] = await sessionsApi.list();

    // The confirm names the number of files, so it has to come from somewhere.
    expect(s.documentCount).toBe(3);
    expect(s.messageCount).toBe(12);
  });

  it("clear keeps the session; destroy returns the one to fall back to", async () => {
    mock.onPost("/api/v1/ai/sessions/4/clear").reply(200, {
      session: { ...session, message_count: 0, document_count: 3 },
    });
    mock.onDelete("/api/v1/ai/sessions/4").reply(200, {
      session: { ...session, id: 5, title: "New chat", message_count: 0, document_count: 0 },
    });

    const cleared = await sessionsApi.clear(4);
    // Clear is the SAFE one: the transcript goes, the files stay.
    expect(cleared.messageCount).toBe(0);
    expect(cleared.documentCount).toBe(3);

    const fallback = await sessionsApi.destroy(4);
    // The server never leaves the user with nowhere to talk.
    expect(fallback.id).toBe(5);
  });
});

describe("documents", () => {
  it("uploads as multipart, overriding the JSON default", async () => {
    mock.onPost("/api/v1/ai/sessions/4/documents").reply(201, {
      document: { id: 3, filename: "statement.pdf", content_type: "application/pdf", byte_size: 1024, status: "pending" },
    });

    const doc = await documentsApi.upload(4, {
      uri: "file:///statement.pdf", name: "statement.pdf", mimeType: "application/pdf",
    });

    // Leaving the instance's application/json default in place produces a body
    // Rails parses as empty — "file is required" for a file that was there.
    expect(mock.history.post[0].headers?.["Content-Type"]).toBe("multipart/form-data");
    // `pending` is normal: extraction and embedding happen in a background job.
    expect(doc.status).toBe("pending");
  });
});
