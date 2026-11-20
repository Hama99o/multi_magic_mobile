/**
 * Previous / next across every file of a folder (parity #43). Pure.
 */
import { neighbours } from "../neighbours";

const f = (id: number) => ({ id, title: `f${id}` });

it("names the files before and after, and where this one is", () => {
  expect(neighbours([f(1), f(2), f(3)], 2)).toEqual({ prev: f(1), next: f(3), index: 1, total: 3 });
  expect(neighbours([f(1), f(2), f(3)], 1)).toEqual({ prev: null, next: f(2), index: 0, total: 3 });
  expect(neighbours([f(1), f(2), f(3)], 3)).toEqual({ prev: f(2), next: null, index: 2, total: 3 });
});

it("a file not in the list (just moved, or still loading) has no neighbours", () => {
  expect(neighbours([f(1)], 9)).toEqual({ prev: null, next: null, index: -1, total: 1 });
});
