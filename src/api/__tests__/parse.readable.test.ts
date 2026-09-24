/**
 * The parsers audit, 2026-09-24: one malformed REACTION threw for its whole
 * message, the message for its page, and the page for the thread, so a
 * decoration the server got wrong cost the person their transcript. The
 * decorations are now read item by item (`readable` in parse.ts). The ROW's
 * own required fields still throw, which is right: a message with no id is
 * not a message.
 */
import { messagesApi } from "../ai";
import { ApiShapeError, readable } from "../parse";
import MockAdapter from "axios-mock-adapter";
import { http, __resetTokenCache } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { conversationsApi } from "../conversations";
import { notificationsApi } from "../notifications";
import { aiKeysApi } from "../aiKeys";

const raw = (over: Record<string, unknown> = {}) => ({
  id: 1, conversation_id: 4, user_id: 2, role: "user", body: "hi", created_at: "2026-09-18T10:00:00Z",
  deleted: false, sent_by_me: true, edited_at: null, read_at: null, reactions: [], links: [], sources: [],
  undoable: false, undone_at: null, ...over,
});

it("keeps a message whose reactions, links and sources hold something unreadable", () => {
  const parsed = messagesApi.parseOne(
    raw({
      reactions: [{ emoji: "👍", count: 2, mine: true }, { emoji: null, count: "x" }, 42],
      links: [null, { label: "Loyer", path: "/notes/1", key: "note" }],
      sources: ["x", { label: "Contrat", path: "/pages/3", key: "page" }],
    }),
  );
  expect(parsed.body).toBe("hi");
  expect(parsed.reactions).toEqual([{ emoji: "👍", count: 2, mine: true }]);
  expect(parsed.links.map((l) => l.label)).toEqual(["Loyer"]);
  expect(parsed.sources.map((l) => l.label)).toEqual(["Contrat"]);
});

it("still refuses a message with no id: that is not a message", () => {
  expect(() => messagesApi.parseOne(raw({ id: null }))).toThrow(ApiShapeError);
});

it("drops only shape errors; a real bug still throws", () => {
  const boom = () => {
    throw new TypeError("a bug, not a shape");
  };
  expect(() => readable([1], boom)).toThrow(TypeError);
});

// ── THE ROWS' OWN DECORATIONS, through the real endpoints ─────────────────

describe("a malformed decoration costs itself, not its row or its list", () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(http);
    __resetTokenCache();
    __resetFingerprintCache();
  });
  afterEach(() => mock.restore());

  it("a bad participant keeps the conversation, and the list", async () => {
    mock.onGet("/api/v1/conversations").reply(200, {
      conversations: [{
        id: 266, is_group: false, updated_at: "2026-09-18T17:29:24Z", last_message: null,
        user: { id: 494, fullname: "Qa MOBILE" },
        participants: [{ user: { id: 494, fullname: "Qa MOBILE" } }, { user: null }, 42],
      }],
      meta: { pagy: { pages: 1 }, unread_conversations: 0 },
    });
    const list = await conversationsApi.list();
    expect(list.conversations).toHaveLength(1);
    expect(list.conversations[0].participants.map((p) => p.id)).toEqual([494]);
  });

  it("a bad actor keeps the notification, and the list", async () => {
    mock.onGet("/api/v1/notifications").reply(200, {
      notifications: [{ id: 9, kind: "loan_due", title: "Prêt d’Anisa", created_at: "2026-09-18T10:00:00Z", actor: { id: "x" } }],
      meta: { pagy: { pages: 1 }, unread_count: 1 },
    });
    const page = await notificationsApi.list();
    expect(page.notifications).toHaveLength(1);
    expect(page.notifications[0].actor).toBeNull();
  });

  it("a bad lent key keeps the screen your own keys are on", async () => {
    mock.onGet("/api/v1/ai_keys").reply(200, {
      ai_keys: [{ id: 3, provider: "gemini", masked: "AIza…9f2a", active: true, verified: true, verified_at: null, verification_error: null, shared_with: [] }],
      providers: ["gemini"],
      borrowed: [{ provider: null }, { provider: "gemini", shared_by: "Anisa", monthly_credit_limit: null, spent_this_month: 0, exhausted: false }],
    });
    const keys = await aiKeysApi.list();
    expect(keys.keys).toHaveLength(1);
    expect(keys.borrowed.map((b) => b.provider)).toEqual(["gemini"]);
  });
});
