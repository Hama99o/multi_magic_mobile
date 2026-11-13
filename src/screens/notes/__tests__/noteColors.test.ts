/**
 * A note's colour on the phone, from the web's own palette (owner,
 * 2026-11-13: Keep's grid, colour fills the whole card). The web stores one
 * of ten keys in note.data.color (tag.rb enum) and draws a Tailwind tone
 * (noteColor.service.ts). The phone draws the same hue, blended over our own
 * page: in dark mode strong (the 900 tone at 80%), as the owner's Keep
 * screenshots show a fully coloured card (2026-11-13, not stored); in light
 * mode the web's 100 tone at the web's opacity. No colour = the page itself,
 * with an outline (the same reference).
 */
import { TOKENS } from "@/theme/tokens";
import { contrastRatio } from "../editor/color";
import { NOTE_COLOR_KEYS, noteColor } from "../editor/noteColors";

it("knows the web's ten keys, in the web's order", () => {
  expect(NOTE_COLOR_KEYS).toEqual(["no_color", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"]);
});

it("no colour is the page itself, outlined", () => {
  expect(noteColor(null, "dark")).toMatchObject({ fill: TOKENS.dark.ground, border: TOKENS.dark.border });
  expect(noteColor("no_color", "light").fill).toBe(TOKENS.light.ground);
  expect(noteColor("not-a-key", "dark").fill).toBe(TOKENS.dark.ground);
});

it("dark mode blends the web's 900 tone at 80% over our ground (red: rose-900)", () => {
  // rose-900 #881337 at 0.80 over #102125 → round(0.8*c + 0.2*g)
  expect(noteColor("red", "dark").fill).toBe("#701633");
});

it("light mode blends the web's 100 tone (orange: orange-100 #ffedd5 at 75% over #F7F9F9)", () => {
  expect(noteColor("orange", "light").fill).toBe("#fdf0de");
});

it.each(["dark", "light"] as const)("%s: the theme's ink stays readable on every colour (WCAG AA 4.5:1)", (mode) => {
  for (const key of NOTE_COLOR_KEYS) {
    expect(contrastRatio(TOKENS[mode].ink, noteColor(key, mode).fill)).toBeGreaterThanOrEqual(4.5);
  }
});

it("each colour has an outline a shade off its fill, and a dot for pickers", () => {
  const c = noteColor("blue", "dark");
  expect(c.border).not.toBe(c.fill);
  expect(c.dot).toMatch(/^#[0-9a-f]{6}$/);
});
