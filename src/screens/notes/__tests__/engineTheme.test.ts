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
