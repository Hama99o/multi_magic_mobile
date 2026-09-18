/**
 * THE PALETTE, READ OFF HIS OWN ICON — `assets/icon.svg`.
 *
 * Karwan keeps colour in TypeScript rather than in Tailwind because its three
 * role themes need one token name to resolve to a different value per role.
 * This app has no roles, so `TOKENS` collapses to light/dark and `METRICS` to a
 * single profile — but the reason survives the simplification: one name, two
 * resolutions, decided in one file. A `dark:` variant on every coloured element
 * is the version that goes wrong one element at a time.
 *
 * `docs/design/IDENTITY.md` §1 is the record of why each value is what it is.
 * The short version: the icon's background IS the dark mode, so there was
 * nothing to invent.
 */

/** The icon's eight accents. Used ONLY where a category exists — never decoration. */
export const CATEGORY_COLORS = [
  "#49b4e4", "#77b87d", "#e9ab4c", "#db5d89",
  "#bd8aca", "#48aaa2", "#e9df71", "#e98262",
] as const;

export interface Tokens {
  /** Page background. In dark mode this is the icon's own ground. */
  ground: string;
  /** Raised surfaces: the composer pill, a sheet, a card. */
  surface: string;
  /** A hairline that reads on both grounds. */
  border: string;
  /** Body text. */
  ink: string;
  /** Secondary text: timestamps, counts, the disclaimer. */
  inkMuted: string;
  /** One accent: send, the live mic, a focused field. */
  accent: string;
  /** Text that sits ON the accent. */
  onAccent: string;
  /** The user's own message bubble. */
  userBubble: string;
  userBubbleInk: string;
  /** Destructive: the delete row and its confirm. */
  danger: string;
}

export const TOKENS: { light: Tokens; dark: Tokens } = {
  // Dark is the one the app is DESIGNED in — his icon is dark, and his words
  // were "both mode". Light is the one it also passes.
  dark: {
    ground: "#102125",
    surface: "#1b333a",
    border: "#2d5363",
    ink: "#E8EEEF",
    // Not pure white: the ground is teal-dark, so the text sits warm of it.
    inkMuted: "#9FB3B9",
    accent: "#48aaa2",
    onAccent: "#04161a",
    userBubble: "#2d5363",
    userBubbleInk: "#E8EEEF",
    danger: "#e98262",
  },
  light: {
    // A very slightly teal-biased off-white, not paper grey.
    ground: "#F7F9F9",
    surface: "#FFFFFF",
    border: "#D8E2E4",
    ink: "#12232A",
    inkMuted: "#5A7079",
    accent: "#2f8a83",
    onAccent: "#FFFFFF",
    userBubble: "#DCEEEC",
    userBubbleInk: "#12232A",
    danger: "#c2542f",
  },
};

export const METRICS = {
  /** Touch-target floor. */
  touch: 48,
  radius: { sm: 8, md: 12, lg: 20, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  /**
   * §8: at 800 dp the conversation takes a measure and centres rather than
   * stretching. A full-width line of serif text on a tablet is unreadable, and
   * that is the one place a wide screen needs a decision rather than a resize.
   */
  maxMeasure: 640,
} as const;

/**
 * A stable colour for a session's dot in the list.
 *
 * Keyed on the session id rather than its position, so a dot does not change
 * colour when a session moves up the list — which it does on every reply, since
 * the list is ordered by `updated_at`.
 */
export function categoryColorFor(id: number): string {
  return CATEGORY_COLORS[Math.abs(id) % CATEGORY_COLORS.length];
}
