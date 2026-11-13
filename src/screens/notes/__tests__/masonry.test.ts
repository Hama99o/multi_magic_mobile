/** Keep's grid: 2 columns of staggered heights; each card goes to the shorter column. */
import { masonry } from "../masonry";

it("puts each item in the shorter column, keeping the reading order per column", () => {
  const items = [{ id: 1, h: 100 }, { id: 2, h: 40 }, { id: 3, h: 40 }, { id: 4, h: 40 }];
  expect(masonry(items, (i) => i.h, 2).map((col) => col.map((i) => i.id))).toEqual([[1], [2, 3, 4]]);
});

it("ties go to the left column", () => {
  expect(masonry([{ h: 10 }, { h: 10 }, { h: 10 }], (i) => i.h, 2).map((c) => c.length)).toEqual([2, 1]);
});

it("one column is the list layout", () => {
  expect(masonry([1, 2, 3], () => 1, 1)).toEqual([[1, 2, 3]]);
});

it("empty in, empty columns out", () => {
  expect(masonry([], () => 1, 2)).toEqual([[], []]);
});
