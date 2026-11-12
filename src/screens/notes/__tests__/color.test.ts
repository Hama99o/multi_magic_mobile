/**
 * Highlighted text must stay readable in both modes (SPEC §C11, dark mode):
 * the web stores fixed highlight colours, so the text on them takes whichever
 * of the mode's ink and ground contrasts more. Device QA 2026-11-12 found
 * light ink on the default yellow in dark mode: unreadable.
 */
import { TOKENS } from "@/theme/tokens";
import { readableInk } from "../editor/color";
import { runStyle } from "../editor/InlineRun";

const dark = TOKENS.dark;
const light = TOKENS.light;

describe("readableInk", () => {
  it.each([
    ["#fef08a", dark.ground],
    ["#FEF08A", dark.ground],
    ["#ff0", dark.ground],
    ["rgb(254, 240, 138)", dark.ground],
    ["rgba(30, 41, 59, 0.9)", dark.ink],
    ["hsl(220 70% 25%)", dark.ink],
    ["hsl(48, 96%, 76%)", dark.ground],
    ["hsl(48deg 96% 76% / 0.5)", dark.ground],
  ])("on %s in dark mode: %s", (bg, expected) => {
    expect(readableInk(bg, dark.ink, dark.ground)).toBe(expected);
  });
  it("keeps the mode's ink when the colour cannot be read", () => {
    expect(readableInk("var(--x)", dark.ink, dark.ground)).toBe(dark.ink);
  });
});

describe("runStyle", () => {
  it("puts dark text on the default yellow highlight in dark mode, and keeps light mode's ink", () => {
    expect(runStyle([{ type: "highlight", attrs: { color: null } }], dark)).toEqual({ backgroundColor: "#fef08a", color: dark.ground });
    expect(runStyle([{ type: "highlight", attrs: { color: null } }], light).color).toBe(light.ink);
  });
  it("a text colour set by the author wins over the highlight's ink", () => {
    const style = runStyle([
      { type: "textStyle", attrs: { color: "rgb(255, 0, 0)" } },
      { type: "highlight", attrs: { color: "#fef08a" } },
    ], dark);
    expect(style.color).toBe("rgb(255, 0, 0)");
  });
});
