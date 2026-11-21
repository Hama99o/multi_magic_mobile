/**
 * Every app on Home has its own colour (owner, 2026-11-15: "why does Pages have
 * colour and the others not, make it good"), taken from the MultiMagic icon's
 * palette, and every tile stays readable in both schemes (WCAG AA, 4.5:1).
 */
import { APP_COLORS, HOME_APPS, tileColors } from "../appColors";
import { CATEGORY_COLORS, TOKENS } from "../tokens";

function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

it("the map is total: every Home app has a colour, and no two share one", () => {
  expect(HOME_APPS).toEqual(["pages", "notes", "assistant", "chats", "notifications", "calendar", "contacts", "safezone", "conversations", "todos", "finance", "flow", "tables", "doc"]);
  for (const app of HOME_APPS) expect(APP_COLORS[app]).toMatch(/^#[0-9a-f]{6}$/i);
  expect(new Set(HOME_APPS.map((a) => APP_COLORS[a])).size).toBe(HOME_APPS.length);
});

it("the colours are the icon's own (Conversations' indigo, Todo's lime, Finance's gold, Flow's mint, Tables' azure and Doc's slate are the additions)", () => {
  for (const app of HOME_APPS) {
    if (app === "conversations" || app === "todos" || app === "finance" || app === "flow" || app === "tables" || app === "doc") continue;
    expect(CATEGORY_COLORS as readonly string[]).toContain(APP_COLORS[app]);
  }
});

it.each(["light", "dark"] as const)("every tile's title and line read at 4.5:1 or more on its tint (%s)", (scheme) => {
  const t = TOKENS[scheme];
  for (const app of HOME_APPS) {
    const c = tileColors(app, scheme);
    expect([app, contrast(t.ink, c.surface) >= 4.5]).toEqual([app, true]);
    expect([app, contrast(t.inkMuted, c.surface) >= 4.5]).toEqual([app, true]);
    // The glyph on its solid badge: 3:1, the WCAG bar for a graphic.
    expect([app, contrast(c.glyph, c.badge) >= 3]).toEqual([app, true]);
  }
});
