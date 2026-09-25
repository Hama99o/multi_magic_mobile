/**
 * WHAT THE PHONE SHOWS WHEN THE PROVIDER FAILS (2026-09-25).
 *
 * multi_magic 3598c4a changed the saved reply for four provider failures: an
 * interrupted turn (after a write), a cut-off answer, a refusal, and an empty
 * completion. `failureReplies.json` holds those replies BUILT from their
 * reply_body and locale files, not captured: provider faults are injected by
 * their own tool on their own eval database. Its `_source` says so.
 *
 * Two facts this pins:
 * - The flags they add, `data.cut_off` and `data.interrupted`, are NOT
 *   serialized (MessageSerializer exposes named fields only), so the phone
 *   gets the sentence and nothing else. If they ever are sent, a message
 *   carrying them must still parse: that is the silent, total failure mode
 *   worth guarding.
 * - Every one renders whole, as sentences, in both languages.
 */
import MockAdapter from "axios-mock-adapter";
import { render, screen } from "@testing-library/react-native";
import { AnswerMarkdown } from "../AnswerMarkdown";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { messagesApi } from "@/api/ai";
import replies from "./failureReplies.json";
import { fixture } from "@/__tests__/journey";

const bodies = Object.entries(replies).filter(([k]) => !k.startsWith("_")) as [string, string][];

function shown(): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === "string") return void out.push(node);
    if (Array.isArray(node)) return node.forEach(walk);
    walk((node as { children?: unknown }).children);
  };
  walk(screen.toJSON());
  return out.join("");
}

describe.each(bodies)("the %s reply", (_name, body) => {
  it("renders whole, as sentences", () => {
    render(<AnswerMarkdown content={body} />);
    const text = shown();
    const lastSentence = body.trim().split(/(?<=[.)])\s+/).pop()!;
    expect(text).toContain(lastSentence.replace(/\n+/g, ""));
    expect(text).not.toMatch(/\*\*|\]\(/);
  });
});

describe("a reply carrying the new flags, if they are ever serialized", () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(http);
    __resetTokenCache();
    __resetFingerprintCache();
  });
  afterEach(() => mock.restore());

  it("still parses, every row read", async () => {
    const page = fixture("ai_messages_latest");
    page.messages[0] = { ...page.messages[0], body: replies["interrupted-en"], cut_off: true, interrupted: true, data: { interrupted: true } };
    mock.onGet(/\/api\/v1\/conversations\/\d+\/messages/).reply(200, page);
    const parsed = await messagesApi.latest(264);
    expect(parsed.unreadable).toBe(0);
    expect(parsed.messages.some((m) => m.body === replies["interrupted-en"])).toBe(true);
  });
});
