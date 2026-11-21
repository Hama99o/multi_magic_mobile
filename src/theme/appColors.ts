/**
 * EACH APP'S COLOUR (owner, 2026-11-15: "why does Pages have colour and the
 * others not, make it good"). Taken from the MultiMagic icon's own squares
 * (CATEGORY_COLORS; IDENTITY.md §1 allows them where a category exists, and an
 * app IS the category here), one per app:
 *   Pages teal, Notes yellow (Keep's), Assistant coral (its badge a coral →
 *   pink gradient), Chats pink, Notifications orange, Calendar blue, Contacts
 *   green, SafeZone purple, Conversations indigo (the one colour not in the
 *   icon: nine apps, eight squares).
 * Flow mint (2026-11-20) is the third addition after them, Tables azure the fourth.
 * Todo lime and Finance gold (2026-11-16) are two more additions, like the
 *   indigo: "no two share one" is his rule (appColors.test.ts). Lime for a ticked list, gold for money; both
 *   clear of the icon's green, orange and yellow by hue and by lightness.
 * `tileColors` gives a tile's surface (the colour faintly over the page), its
 * solid badge and the glyph on it; appColors.test.ts checks 4.5:1 for the text
 * and 3:1 for the glyph, in both schemes.
 */
import { CATEGORY_COLORS, TOKENS } from "./tokens";

export const HOME_APPS = ["pages", "notes", "assistant", "chats", "notifications", "calendar", "contacts", "safezone", "conversations", "todos", "finance", "flow", "tables", "doc"] as const;
export type HomeApp = (typeof HOME_APPS)[number];

const [BLUE, GREEN, ORANGE, PINK, PURPLE, TEAL, YELLOW, CORAL] = CATEGORY_COLORS;
export const INDIGO = "#8b93e0";
export const LIME = "#a7c957";
export const GOLD = "#c9a227";
/** Flow (2026-11-20): mint, a board of columns; clear of the icon's teal and green by hue. */
export const MINT = "#3ecf9a";
/** Tables (2026-11-20): azure, rows and columns; darker and bluer than the icon's sky blue. */
export const AZURE = "#3d7fd9";
/** Doc Tools (2026-11-20): slate, not a PDF red — red is `danger` here (docs/design/doc/SPEC.md). */
export const SLATE = "#7a9cc6";

export const APP_COLORS: Record<HomeApp, string> = {
  pages: TEAL,
  notes: YELLOW,
  assistant: CORAL,
  chats: PINK,
  notifications: ORANGE,
  calendar: BLUE,
  contacts: GREEN,
  safezone: PURPLE,
  conversations: INDIGO,
  todos: LIME,
  finance: GOLD,
  flow: MINT,
  tables: AZURE,
  doc: SLATE,
};

/** The Assistant's badge: a gradient between two of the icon's colours. */
export const ASSISTANT_GRADIENT = [CORAL, PINK] as const;

/** The glyph on every badge: the icon's dark ground, readable on each colour. */
const GLYPH = "#04161a";

function mix(fg: string, bg: string, alpha: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  const out = [1, 3, 5].map((i) => Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha)));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function tileColors(app: HomeApp, scheme: "light" | "dark"): { surface: string; badge: string; glyph: string; ring: string } {
  const color = APP_COLORS[app];
  const t = TOKENS[scheme];
  // Faint enough that the page's own ink still reads on it (the test's 4.5:1).
  const surface = scheme === "dark" ? mix(color, t.ground, 0.16) : mix(color, "#ffffff", 0.11);
  return { surface, badge: color, glyph: GLYPH, ring: color };
}
