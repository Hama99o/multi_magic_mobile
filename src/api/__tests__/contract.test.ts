/**
 * THE PARSERS AGAINST WHAT THE SERVER ACTUALLY SENDS (2026-09-25).
 *
 * Every other parser test in this repo was written from the TypeScript type,
 * so it can only repeat the type's own assumptions. These run the app's real
 * API functions over responses CAPTURED from the live local backend by
 * `qa/capture_fixtures.py` (karwan-mobile's practice; their first live
 * capture found a parser that had refused every real response it received).
 *
 * The central claim is that every row PARSES: `unreadable` is 0 on every
 * list. A parser that refused a real field would count rows here rather
 * than pass.
 *
 * RE-CAPTURE, NEVER EDIT. The fingerprint block below pins traits the server
 * produces and a hand-written fixture would not: a person's message with
 * `role: null`, and pagy's own `scaffold_url`. Personal values are scrubbed
 * at capture (the repo is public); their TYPES are the server's.
 *
 * What it cannot see: endpoints not captured, and fields the QA account has
 * no data for (it has no events and no notifications, so those lists are
 * EMPTY, and prove only the envelope).
 */
import fs from "fs";
import path from "path";
import MockAdapter from "axios-mock-adapter";
import { http, __resetTokenCache } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { documentsApi, messagesApi, sessionsApi, aiApi } from "../ai";
import { conversationsApi } from "../conversations";
import { notificationsApi } from "../notifications";
import { calendarApi } from "../calendar";
import { aiKeysApi } from "../aiKeys";
import { meApi } from "../me";
import { profileApi, WrongCurrentPassword } from "../profile";

type Fixture = { status: number; request: string; body: unknown };
const load = (name: string): Fixture =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", `${name}.json`), "utf8"));

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
});
afterEach(() => mock.restore());

/** Serves a fixture for the request it was captured from. */
function serve(name: string, url: RegExp | string) {
  const f = load(name);
  const [method] = f.request.split(" ");
  const handler = method === "PUT" ? mock.onPut(url) : mock.onGet(url);
  handler.reply(f.status, f.body);
  return f;
}

describe("the captured fixtures are REAL, not written", () => {
  it("carry a person's message with role null, which the type would never write", () => {
    const raw = JSON.stringify(load("conversations_page1").body);
    expect(raw).toContain('"role":null');
  });

  it("carry pagy's own block, which a hand-written page would not", () => {
    for (const name of ["ai_messages_latest", "conversations_page1", "notifications_page1"]) {
      expect(JSON.stringify(load(name).body)).toContain("scaffold_url");
    }
  });

  it("carry nothing personal: every email is the scrub's placeholder", () => {
    const dir = path.join(__dirname, "fixtures");
    for (const file of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
      expect(emails.filter((e) => e !== "person@example.test")).toEqual([]);
    }
  });
});

describe("every captured response parses, every row read", () => {
  it("the profile", async () => {
    serve("connected_user", "/api/v1/users/connected_user");
    const profile = await profileApi.me();
    expect(typeof profile.id).toBe("number");
    expect(typeof profile.aiMorningBrief).toBe("boolean");
  });

  it("the current assistant session", async () => {
    serve("ai_conversation", "/api/v1/ai/conversation");
    expect(typeof (await aiApi.currentSessionId())).toBe("number");
  });

  it("the assistant sessions", async () => {
    serve("ai_sessions", "/api/v1/ai/sessions");
    expect((await sessionsApi.list()).length).toBeGreaterThan(0);
  });

  it("the assistant's latest messages", async () => {
    const f = serve("ai_messages_latest", /\/api\/v1\/conversations\/\d+\/messages/);
    const id = Number(f.request.match(/conversations\/(\d+)/)![1]);
    const page = await messagesApi.latest(id);
    expect(page.messages.length).toBeGreaterThan(0);
    expect(page.unreadable).toBe(0);
  });

  it("the session's documents", async () => {
    serve("ai_documents", /\/api\/v1\/ai\/sessions\/\d+\/documents/);
    expect(Array.isArray(await documentsApi.list(1))).toBe(true);
  });

  it("the people chats, page 1", async () => {
    serve("conversations_page1", "/api/v1/conversations");
    const list = await conversationsApi.list(1);
    expect(list.conversations.length).toBeGreaterThan(0);
    expect(list.unreadable).toBe(0);
  });

  it("the chats badge", async () => {
    serve("conversations_unread", "/api/v1/conversations/unread_messages_count");
    const counts = await conversationsApi.unreadCount();
    expect(typeof counts.unreadConversations).toBe("number");
  });

  it("notifications, page 1 (EMPTY on this account: the envelope only)", async () => {
    serve("notifications_page1", "/api/v1/notifications");
    const page = await notificationsApi.list(1);
    expect(page.unreadable).toBe(0);
  });

  it("the notifications badge", async () => {
    serve("notifications_unread", "/api/v1/notifications/unread_count");
    expect(typeof (await notificationsApi.unreadCount())).toBe("number");
  });

  it("the calendar's 7 days (EMPTY on this account: the envelope only)", async () => {
    serve("calendar_upcoming_7", "/api/v1/calendar_app/events/upcoming");
    const page = await calendarApi.upcomingPage(7);
    expect(page.unreadable).toBe(0);
  });

  it("the AI keys", async () => {
    serve("ai_keys", "/api/v1/ai_keys");
    const keys = await aiKeysApi.list();
    expect(Array.isArray(keys.keys)).toBe(true);
  });

  it("the data summary", async () => {
    serve("me_summary", "/api/v1/me/summary");
    const summary = await meApi.summary();
    expect(Array.isArray(summary.stocked)).toBe(true);
  });
});

describe("a captured REFUSAL", () => {
  // The server's own shape for a wrong current password: a code beside the
  // sentence (multi_magic 1f62871). A hand-written refusal would have had
  // only the sentence, which is what the app matched until 3f7ec45.
  it("a wrong current password is recognised by the code the server sends", async () => {
    const f = serve("change_password_wrong_current", /\/api\/v1\/users\/\d+\/change_password/);
    expect((f.body as { code?: string }).code).toBe("wrong_current_password");
    await expect(
      profileApi.changePassword(494, { currentPassword: "x", password: "newpass123", passwordConfirmation: "newpass123" }),
    ).rejects.toBeInstanceOf(WrongCurrentPassword);
  });
});
