import { makeOccurrence } from "@/__tests__/calendarFixtures";
import { byDay } from "../byDay";

describe("occurrences by day", () => {
  it("keeps the server's order within a day", () => {
    const a = makeOccurrence({ key: "1:2026-11-12", on: "2026-11-12", allDay: true, startsAt: null }, { id: 1, allDay: true, startsOn: "2026-11-12" });
    const b = makeOccurrence({ key: "2:2026-11-12", on: "2026-11-12" }, { id: 2 });
    expect(byDay([a, b]).get("2026-11-12")?.map((o) => o.key)).toEqual(["1:2026-11-12", "2:2026-11-12"]);
  });

  it("a three-day all-day event is on all three days, once each", () => {
    const trip = makeOccurrence({ key: "3:2026-11-12", on: "2026-11-12", allDay: true, startsAt: null }, { id: 3, allDay: true, startsOn: "2026-11-12", endsOn: "2026-11-14" });
    const days = byDay([trip]);
    expect([...days.keys()]).toEqual(["2026-11-12", "2026-11-13", "2026-11-14"]);
  });

  it("a REPEATED multi-day event spans from its occurrence, not from its first year", () => {
    const yearly = makeOccurrence({ key: "4:2026-12-24", on: "2026-12-24", allDay: true, startsAt: null }, { id: 4, allDay: true, startsOn: "2019-12-24", endsOn: "2019-12-26", recurrence: "yearly" });
    expect([...byDay([yearly]).keys()]).toEqual(["2026-12-24", "2026-12-25", "2026-12-26"]);
  });

  it("a timed event past midnight is on both days", () => {
    const late = makeOccurrence(
      { key: "5:2026-11-12", on: "2026-11-12", startsAt: new Date(2026, 10, 12, 22).toISOString(), endsAt: new Date(2026, 10, 13, 2).toISOString() },
      { id: 5 },
    );
    expect([...byDay([late]).keys()]).toEqual(["2026-11-12", "2026-11-13"]);
  });

  it("a span is capped, so a bad end date cannot draw a year of dots", () => {
    const bad = makeOccurrence({ key: "6:2026-01-01", on: "2026-01-01", allDay: true, startsAt: null }, { id: 6, allDay: true, startsOn: "2026-01-01", endsOn: "2030-01-01" });
    expect(byDay([bad]).size).toBe(62);
  });
});
