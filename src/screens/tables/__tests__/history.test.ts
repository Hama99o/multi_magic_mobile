import i18n from "@/i18n";
import type { HistoryItem } from "@/api/tables";
import { HISTORY_ACTIONS, historyLine, lineKey } from "../history";

const item = (action: string, details: Record<string, unknown> = {}, who: string | null = "Amina"): HistoryItem => ({ id: 1, action, source: "app", details, subjectType: null, subjectId: null, who, at: "", restorable: false });
const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

it("says each action in the web's words, filled from its details", () => {
  expect(historyLine(item("row.updated", { fields: ["Status", "Price"] }), t)).toBe("Amina changed a row (Status, Price)");
  expect(historyLine(item("rows.deleted", { count: 3, titles: ["A", "B"] }), t)).toBe("Amina deleted 3 rows (A, B…)");
  expect(historyLine(item("rows.deleted", { count: 1, titles: ["A"] }), t)).toBe("Amina deleted the row A");
  expect(historyLine(item("share.added", { who: "Omar", role: "viewer" }), t)).toBe("Amina shared the base with Omar (Viewer)");
  expect(historyLine(item("table.renamed", { from: "Old", to: "New" }), t)).toBe('Amina renamed the table "Old" to "New"');
});

it("someone, when the person is gone; the raw action when the server sends one this app does not know", () => {
  expect(historyLine(item("row.created", {}, null), t)).toBe("Someone added a row");
  expect(historyLine(item("form.answered"), t)).toBe("form.answered");
});

it("every action the server logs has a sentence in both languages", async () => {
  for (const lang of ["en", "fr"]) {
    await i18n.changeLanguage(lang);
    for (const a of HISTORY_ACTIONS) {
      const key = lineKey(a);
      const exists = i18n.exists(key) || i18n.exists(`${key}_one`);
      expect([lang, a, exists]).toEqual([lang, a, true]);
    }
  }
});
