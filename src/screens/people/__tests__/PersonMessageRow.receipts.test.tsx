/**
 * WHAT THE TICK MEANS, AND THE WORD THAT NEVER REACHED i18next.
 *
 * A separate file from `PersonMessageRow.test.tsx` deliberately: the SDK 57
 * upgrade is in flight in another worktree and a new file cannot conflict with
 * a merge, where added blocks in an existing file can.
 *
 * ── TWO FINDINGS FROM THE BACKWARD WALK ───────────────────────────────────
 * **One tick or two is the whole difference between "it arrived" and "they
 * read it"**, and it was carried by a shape and nothing else — no label, no
 * text, no handle. `qa/FLOW_REGISTER.md` already recorded that no flow covers
 * the double tick; what it could not say is that there was nothing to cover,
 * because a screen reader was told nothing at all. The code's own comment
 * calls `read_at` "a strong claim" in a group of five. A strong claim nobody
 * can hear is not a claim.
 *
 * **And `edited` was a bare English literal.** A message that silently changes
 * after somebody replied to it is the thing that word exists to prevent, and in
 * a French interface it said "edited". It survived `49a0a7a`, which fixed the
 * accessibility literals in this file, and it survived the scan that found the
 * other three — because that scan dropped any single lowercase token as
 * identifier-shaped. A plain lowercase dictionary word is not an identifier
 * shape, and correcting the filter found exactly this one with no new noise.
 * `docs/TESTING.md` §10, in the instrument written FOR §10.
 */
import { render, screen } from "@testing-library/react-native";
import i18n from "i18next";
import { PersonMessageRow } from "../PersonMessageRow";
import type { ChatMessage } from "@/api/ai";

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 2311,
    body: "see you at six",
    role: "user",
    sentByMe: true,
    createdAt: "2026-09-19T17:00:00Z",
    reactions: [],
    links: [],
    sources: [],
    ...over,
  } as ChatMessage;
}

const row = (over: Partial<ChatMessage> = {}) =>
  render(<PersonMessageRow message={message(over)} isLastSent />);

describe("the read receipt, for somebody who cannot see the tick", () => {
  it("says SENT when only one tick is drawn", () => {
    row();
    expect(screen.getByTestId("msg-receipt-sent")).toHaveAccessibleName("Sent");
    expect(screen.queryByTestId("msg-receipt-read")).toBeNull();
  });

  it("says READ BY EVERYONE when the second tick appears", () => {
    // `read_at` is nil unless every other member has read past it
    // (`message_serializer.rb:29-39`), so the word "everyone" is the claim the
    // server actually makes — not a softer one chosen to sound safe.
    row({ readAt: "2026-09-19T17:05:00Z" });
    expect(screen.getByTestId("msg-receipt-read")).toHaveAccessibleName("Read by everyone");
    expect(screen.queryByTestId("msg-receipt-sent")).toBeNull();
  });

  it("shows no receipt at all on a message that is not the last sent", () => {
    render(<PersonMessageRow message={message()} isLastSent={false} />);
    expect(screen.queryByTestId("msg-receipt-sent")).toBeNull();
    expect(screen.queryByTestId("msg-receipt-read")).toBeNull();
  });
});

describe("the edited marker", () => {
  /**
   * ── THIS HAD TO BE ASSERTED IN FRENCH, AND THE FIRST VERSION WAS NOT ─────
   * The first draft asserted `getByText("edited")` in English and called itself
   * "comes from a key rather than from a literal". It passed against the
   * literal too — English's value for the key IS "edited" — so it could not
   * fail for the reason it was named after, and planting the literal back
   * proved it: every other planted break went red and this one did not.
   *
   * That is `docs/TESTING.md` §2 exactly, and the same shape as the render
   * table that claimed "both languages" while reading English text inside a
   * container. The only place a key and a literal differ is the other locale.
   */
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("is a KEY, which only French can prove", async () => {
    await i18n.changeLanguage("fr");
    row({ editedAt: "2026-09-19T17:02:00Z" });
    expect(screen.getByText("modifié")).toBeTruthy();
    expect(screen.queryByText("edited")).toBeNull();
  });

  it("is absent on a message nobody changed", () => {
    row();
    expect(screen.queryByText("edited")).toBeNull();
  });
});
