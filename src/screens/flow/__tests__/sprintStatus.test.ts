/**
 * A sprint's status pill (Hello, 2026-11-21: "design tokens only, light +
 * dark checked by a test"). The pill draws its words in the status colour on
 * a 15 % tint of that colour over the sheet's surface (`Pill` in parts.tsx,
 * `${color}26`), so the words must read on BOTH: WCAG AA, 4.5:1 for text.
 * The old `#22c55e` green on the light surface was about 2.2:1.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { TOKENS } from "@/theme/tokens";
import { sprintStatusColor } from "../SprintsSheet";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `fg` at `alpha` over `bg`, as the pill's background draws it. */
const over = (fg: string, bg: string, alpha: number) =>
  `#${[1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;

describe.each(["light", "dark"] as const)("%s mode", (mode) => {
  const t = TOKENS[mode];
  it.each(["planning", "active", "completed"] as const)("the %s pill's words read on the surface and on the pill's own tint", (status) => {
    const c = sprintStatusColor(t, status);
    expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect([status, contrast(c, t.surface) >= 4.5]).toEqual([status, true]);
    expect([status, contrast(c, over(c, t.surface, 0x26 / 255)) >= 4.5]).toEqual([status, true]);
  });
});

it("the three statuses are told apart by colour, not only by word", () => {
  for (const mode of ["light", "dark"] as const) {
    const t = TOKENS[mode];
    expect(new Set(["planning", "active", "completed"].map((s) => sprintStatusColor(t, s as "planning"))).size).toBe(3);
  }
});

it("the sprints sheet names no colour of its own (tokens only)", () => {
  const source = readFileSync(join(__dirname, "../SprintsSheet.tsx"), "utf8");
  expect(source.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
});
