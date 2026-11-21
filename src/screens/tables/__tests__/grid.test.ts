/**
 * The tablet grid's layout (increment 9), against the web's Grid.tsx and the
 * server's records#summary.
 */
import type { FieldDefinition } from "@/api/fields";
import { columnWidth, GRID_MIN_WIDTH, parseSummary, showsGrid, TITLE_WIDTH } from "../grid";

const f = (id: number, fieldType: string) => ({ id, fieldType }) as unknown as FieldDefinition;

it("the grid from the web's phone breakpoint, on grid views only", () => {
  expect(showsGrid(GRID_MIN_WIDTH, "grid")).toBe(true);
  expect(showsGrid(GRID_MIN_WIDTH - 1, "grid")).toBe(false);
  expect(showsGrid(1200, "gallery")).toBe(false);
});

it("widths: the view's own (clamped as the server does), else the web's by type; the title column 220", () => {
  expect(columnWidth(f(1, "text"), 1, null)).toBe(TITLE_WIDTH);
  expect(columnWidth(f(2, "boolean"), 1, null)).toBe(96);
  expect(columnWidth(f(3, "email"), 1, {})).toBe(180);
  expect(columnWidth(f(3, "email"), 1, { "3": 300 })).toBe(300);
  expect(columnWidth(f(3, "email"), 1, { "3": 5 })).toBe(60);
  expect(columnWidth(f(3, "email"), 1, { "3": 5000 })).toBe(800);
});

it("the summary: filled, sum and average for plain columns; a bare count for links and files", () => {
  expect(parseSummary({ "2": { filled: 12, sum: "1250.5", avg: 104.21 }, "1": { filled: 25 }, "3": 7, junk: 1 })).toEqual({
    1: { filled: 25, sum: null, avg: null },
    2: { filled: 12, sum: 1250.5, avg: 104.21 },
    3: { filled: 7, sum: null, avg: null },
  });
  expect(parseSummary(null)).toEqual({});
});
