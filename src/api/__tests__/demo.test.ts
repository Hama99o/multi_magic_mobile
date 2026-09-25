/**
 * THE STORE-PICTURE DEMO DATA PARSES, EVERY ROW (2026-09-25).
 *
 * `qa/demo/<lang>/` is what the fault proxy serves while the listing
 * screenshots are taken (rendered by qa/demo/build_demo.py from the words in
 * qa/demo/content.py). A row the parser refuses would be missing from a
 * picture that goes to the whole world, and nobody would see the gap in a
 * screenshot. So the app's real API functions read every file, in both
 * languages, and every list must read with unreadable === 0.
 *
 * The time placeholders are filled here with the proxy's own rule (a fixed
 * clock), so what is parsed is what the app would receive.
 */
import fs from "fs";
import path from "path";
import MockAdapter from "axios-mock-adapter";
import { http, __resetTokenCache } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { messagesApi, sessionsApi, aiApi } from "../ai";
import { conversationsApi } from "../conversations";
import { notificationsApi } from "../notifications";
import { calendarApi } from "../calendar";
import { meApi } from "../me";
import { profileApi } from "../profile";

const DEMO = path.resolve(__dirname, "../../../qa/demo");
const NOW = new Date("2026-09-23T10:00:00Z"); // a Wednesday

/** The proxy's placeholders, filled with a fixed clock. */
function fill(text: string): string {
  const dayOffset = (d: string) => (d === "sat" ? ((6 - NOW.getUTCDay() + 7) % 7 || 7) : Number(d));
  const plus = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
  return text
    .replace(/\{\{ago:(\d+)\}\}/g, (_, m) => new Date(NOW.getTime() - Number(m) * 60_000).toISOString())
    .replace(/\{\{date:(sat|\d+)\}\}/g, (_, d) => plus(dayOffset(d)).toISOString().slice(0, 10))
    .replace(/\{\{at:(sat|\d+)@(\d\d):(\d\d)\}\}/g, (_, d, hh, mm) => {
      const t = plus(dayOffset(d));
      t.setUTCHours(Number(hh), Number(mm), 0, 0);
      return t.toISOString();
    });
}

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
});
afterEach(() => mock.restore());

describe.each(["en", "fr"])("the %s demo", (lang) => {
  const serve = (name: string) => JSON.parse(fill(fs.readFileSync(path.join(DEMO, lang, `${name}.json`), "utf8")));

  it("leaves no placeholder unfilled", () => {
    for (const file of fs.readdirSync(path.join(DEMO, lang))) {
      expect(fill(fs.readFileSync(path.join(DEMO, lang, file), "utf8"))).not.toMatch(/\{\{/);
    }
  });

  it("carries nothing captured: no QA value, no real date", () => {
    for (const file of fs.readdirSync(path.join(DEMO, lang))) {
      const raw = fs.readFileSync(path.join(DEMO, lang, file), "utf8");
      expect(raw).not.toMatch(/scrubbed|person@example\.test|\[qa\]|qa\.mobile|Qa MOBILE|2026-09-\d\dT/);
    }
  });

  it("every list and object parses, every row read", async () => {
    mock.onGet("/api/v1/users/connected_user").reply(200, serve("connected_user"));
    mock.onGet("/api/v1/ai/conversation").reply(200, serve("ai_conversation"));
    mock.onGet("/api/v1/ai/sessions").reply(200, serve("sessions"));
    mock.onGet(/\/api\/v1\/conversations\/9001\/messages/).reply(200, serve("assistant_messages"));
    mock.onGet(/\/api\/v1\/conversations\/9101\/messages/).reply(200, serve("thread_messages"));
    mock.onGet("/api/v1/conversations/9101").reply(200, serve("thread_detail"));
    mock.onGet("/api/v1/conversations").reply(200, serve("conversations"));
    mock.onGet("/api/v1/notifications").reply(200, serve("notifications"));
    mock.onGet("/api/v1/calendar_app/events/upcoming").reply(200, serve("calendar"));
    mock.onGet("/api/v1/me/summary").reply(200, serve("me_summary"));

    expect((await profileApi.me()).firstName).toBe("Maya");
    expect(await aiApi.currentSessionId()).toBe(9001);
    expect((await sessionsApi.list()).length).toBe(4);

    const assistant = await messagesApi.latest(9001);
    expect(assistant.unreadable).toBe(0);
    expect(assistant.messages).toHaveLength(4);
    // The answers cite their sources: the listing's whole point.
    expect(assistant.messages.filter((m) => m.sources.length > 0)).toHaveLength(2);

    const thread = await messagesApi.latest(9101);
    expect(thread.unreadable).toBe(0);
    expect(thread.messages).toHaveLength(5);
    expect((await conversationsApi.show(9101)).id).toBe(9101);

    const chats = await conversationsApi.list(1);
    expect(chats.unreadable).toBe(0);
    expect(chats.conversations).toHaveLength(3);

    const notifications = await notificationsApi.list(1);
    expect(notifications.unreadable).toBe(0);
    expect(notifications.notifications).toHaveLength(3);

    const calendar = await calendarApi.upcomingPage(7);
    expect(calendar.unreadable).toBe(0);
    expect(calendar.occurrences).toHaveLength(5);
    // The birthday the words call "Saturday" is one.
    const birthday = calendar.occurrences.find((o) => o.event.kind === "birthday")!;
    expect(new Date(`${birthday.on}T12:00:00Z`).getUTCDay()).toBe(6);

    expect((await meApi.summary()).stocked.length).toBeGreaterThan(0);
  });
});
