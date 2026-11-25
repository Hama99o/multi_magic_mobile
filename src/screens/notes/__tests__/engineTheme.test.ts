/**
 * Engine B's theme from our tokens. Device, 2026-11-13: in dark mode a
 * table's header row was unreadable — B paints it #F3F4F6 unless told
 * otherwise, under our light text.
 */
import { engineTheme } from "../editor/engineTheme";

const dark = { ground: "#0f172a", surface: "#1e293b", border: "#334155", ink: "#e2e8f0", inkMuted: "#94a3b8", accent: "#2dd4bf", onAccent: "#042f2e", danger: "#f87171" };

it("a table's header row and borders come from our tokens (dark: never B's light grey)", () => {
  const theme = engineTheme(dark) as { table?: { headerBackgroundColor?: string; borderColor?: string } };
  expect(theme.table?.headerBackgroundColor).toBe(dark.surface);
  expect(theme.table?.borderColor).toBe(dark.border);
});

// Device, 2026-11-25 (readiness 200 %, flow 97): at a 200 % system font the
// note's title and dates doubled, its BODY stayed at 16. The native editor
// sizes text in dp (Android EditorEditTextConfiguration: COMPLEX_UNIT_PX from
// density, not scaledDensity; the iOS editor does not read Dynamic Type
// either: only the library's viewer does), so the scale is ours to apply.
it("text grows with the system font scale, line heights with it", () => {
  type T = { text: { fontSize: number }; paragraph: { lineHeight: number }; h1: { fontSize: number; lineHeight: number }; h3: { fontSize: number; lineHeight: number } };
  const one = engineTheme(dark) as unknown as T;
  const two = engineTheme(dark, dark.ground, 2) as unknown as T;
  expect(one.text.fontSize).toBe(16);
  expect(two.text.fontSize).toBe(32);
  expect(two.paragraph.lineHeight).toBe(48);
  expect(two.h1).toMatchObject({ fontSize: 52, lineHeight: 64 });
  expect(two.h3).toMatchObject({ fontSize: 36, lineHeight: 50 });
});
