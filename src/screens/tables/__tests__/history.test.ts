import i18n from "@/i18n";
import type { HistoryItem } from "@/api/tables";
import { HISTORY_ACTIONS, historyDays, historyLine, lineKey } from "../history";

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

describe("historyDays (the web's HistoryFeed.tsx groups: Today, Yesterday, the date)", () => {
  // Local dates, so the phone's own calendar day is what is tested, whatever the runner's zone.
  const now = new Date(2026, 10, 20, 9, 0);
  const at = (d: Date) => d.toISOString();
  const line = (id: number, when: Date): HistoryItem => ({ ...item("row.created"), id, at: at(when) });
  const rows = [line(5, new Date(2026, 10, 20, 8, 0)), line(4, new Date(2026, 10, 20, 0, 5)), line(3, new Date(2026, 10, 19, 23, 50)), line(2, new Date(2026, 10, 18, 12, 0)), line(1, new Date(2026, 10, 18, 7, 0))];

  it("puts one header before each day, newest first, and keeps every line in order", () => {
    const out = historyDays(rows, t, "en", now);
    expect(out.map((e) => (e.kind === "day" ? `# ${e.label}` : e.item.id))).toEqual(["# Today", 5, 4, "# Yesterday", 3, `# ${new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" }).format(new Date(2026, 10, 18))}`, 2, 1]);
  });

  it("says the days in French, and the date in French", async () => {
    await i18n.changeLanguage("fr");
    const labels = historyDays(rows, t, "fr", now).filter((e) => e.kind === "day").map((e) => (e.kind === "day" ? e.label : ""));
    expect(labels.slice(0, 2)).toEqual(["Aujourd’hui", "Hier"]);
    expect(labels[2]).toMatch(/18 novembre/);
  });

  it("an empty history has no header", () => {
    expect(historyDays([], t, "en", now)).toEqual([]);
  });
});
