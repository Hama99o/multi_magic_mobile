/**
 * A NOTE'S COLOUR ON THE PHONE, from the web's palette.
 *
 * The web stores one of ten keys in note.data.color (multi_magic tag.rb enum;
 * the serializer falls back to a label's colour) and draws a Tailwind tone
 * (noteColor.service.ts: e.g. red = rose-100 / rose-900). The phone draws the
 * same hue blended over its own page:
 *  - dark: the 900 tone at 80%. The owner's Keep screenshots (2026-11-13, not
 *    stored) show a fully coloured card, not a tint;
 *  - light: the 100 tone at the web's opacity.
 * No colour is the page itself with an outline (same reference).
 */
import { TOKENS } from "@/theme/tokens";

export const NOTE_COLOR_KEYS = ["no_color", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"] as const;
export type NoteColorKey = (typeof NOTE_COLOR_KEYS)[number];

// Tailwind tones the web uses for each key: [light tone, light opacity, dark tone, dot].
const WEB: Record<Exclude<NoteColorKey, "no_color">, [string, number, string, string]> = {
  red: ["#ffe4e6", 0.75, "#881337", "#f43f5e"], // rose
  orange: ["#ffedd5", 0.75, "#7c2d12", "#f97316"],
  yellow: ["#fef9c3", 0.8, "#713f12", "#facc15"],
  green: ["#d1fae5", 0.75, "#064e3b", "#10b981"], // emerald
  teal: ["#ccfbf1", 0.75, "#134e4a", "#14b8a6"],
  blue: ["#e0f2fe", 0.75, "#0c4a6e", "#0ea5e9"], // sky
  purple: ["#ede9fe", 0.75, "#4c1d95", "#8b5cf6"], // violet
  pink: ["#fae8ff", 0.75, "#701a75", "#d946ef"], // fuchsia
  gray: ["#f1f5f9", 0.8, "#334155", "#94a3b8"], // slate (dark: slate-700)
};
const DARK_STRENGTH = 0.8;

const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function blend(top: string, base: string, alpha: number): string {
  const a = rgb(top);
  const b = rgb(base);
  return `#${a.map((c, i) => hex(alpha * c + (1 - alpha) * b[i])).join("")}`;
}

export interface NoteColor {
  fill: string;
  border: string;
  dot: string;
}

export function isNoteColorKey(key: unknown): key is NoteColorKey {
  return typeof key === "string" && (NOTE_COLOR_KEYS as readonly string[]).includes(key);
}

export function noteColor(key: string | null | undefined, mode: "dark" | "light"): NoteColor {
  const theme = TOKENS[mode];
  if (!isNoteColorKey(key) || key === "no_color") {
    return { fill: theme.ground, border: theme.border, dot: theme.border };
  }
  const [light, lightAlpha, dark, dot] = WEB[key];
  const fill = mode === "dark" ? blend(dark, theme.ground, DARK_STRENGTH) : blend(light, theme.ground, lightAlpha);
  // The outline: the fill pulled towards the ink, a shade off it.
  const border = blend(theme.ink, fill, mode === "dark" ? 0.18 : 0.12);
  return { fill, border, dot };
}
