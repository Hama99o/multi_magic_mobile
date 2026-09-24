import { resetDate } from "../BorrowedKeyRow";

// A LIMIT OF THIS TEST, measured 2026-09-24: it catches a return to the
// phone's calendar only on a machine EAST of UTC (this one is Europe/Paris).
// On a UTC machine (GitHub Actions' default, so CI) the phone's calendar and the
// server's agree and the old code passes. Setting `process.env.TZ` inside the
// Jest worker was tried and changes nothing: the zone is fixed before the
// test runs. So a regression here is caught on a laptop in Paris, not in CI.

// A monthly limit resets at the next month start on the SERVER's calendar,
// which is UTC (`BorrowedKeyRow.tsx` names the server lines). Instants, not
// local dates, so this reads the same on any machine's time zone.
it("resets at the next UTC month start, across December too", () => {
  expect(resetDate(new Date("2026-09-24T12:00:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  expect(resetDate(new Date("2026-12-31T12:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
});

// The case that was a MONTH wrong. 23:30 UTC on 30 September is already
// 1 October in Paris, so the phone's calendar said "next month" meant
// November, while the server's month (September) ends in 30 minutes.
it("in the first hours of a local month east of UTC, it is minutes away, not a month", () => {
  expect(resetDate(new Date("2026-09-30T23:30:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
});
