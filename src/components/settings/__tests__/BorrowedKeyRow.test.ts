import { resetDate } from "../BorrowedKeyRow";

// A monthly limit resets on the FIRST of next month — including across a year.
it("resets on the first of next month, across December too", () => {
  expect(resetDate(new Date(2026, 8, 24))).toEqual(new Date(2026, 9, 1));
  expect(resetDate(new Date(2026, 11, 31))).toEqual(new Date(2027, 0, 1));
});
