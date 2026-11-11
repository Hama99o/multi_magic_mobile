import { makeOccurrence } from "@/__tests__/calendarFixtures";
import { agendaGroups, byDay } from "../byDay";
import { dayKey } from "../dates";

describe("occurrences by day", () => {
  it("keeps the server's order within a day", () => {
    const a = makeOccurrence({ key: "1:2026-11-12", on: "2026-11-12", allDay: true, startsAt: null }, { id: 1, allDay: true, startsOn: "2026-11-12" });
    const b = makeOccurrence({ key: "2:2026-11-12", on: "2026-11-12", startsAt: new Date(2026, 10, 12, 9).toISOString(), endsAt: null }, { id: 2 });
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

/**
 * The agenda's days are the PHONE's days. The server files an occurrence
 * under the ACCOUNT's day (`on`), while every time on screen is the phone's
 * clock; with the phone in New York and the account in Paris, 00:30 Paris on
 * the 12th is 18:30 on the 11th and was listed under the 12th. A timed row
 * now sits under the day its displayed time is on; an all-day row keeps
 * `on`, which is a date and has no zone. Valid in Paris AND New York
 * (`test:west`): the expectation is computed with the same local clock.
 */
describe("the agenda's days", () => {
  it("a timed occurrence sits under the local day of its start", () => {
    const startsAt = "2026-11-11T23:30:00Z";
    const late = makeOccurrence({ key: "7:2026-11-12", on: "2026-11-12", startsAt, endsAt: null }, { id: 7 });
    const groups = agendaGroups([late]);
    expect(groups.map(([day]) => day)).toEqual([dayKey(new Date(startsAt))]);
  });

  it("orders by day, all-day first, then by start, without losing anything", () => {
    const allDay = makeOccurrence({ key: "1:2026-11-12", on: "2026-11-12", allDay: true, startsAt: null, endsAt: null }, { id: 1, allDay: true, startsOn: "2026-11-12" });
    const morning = makeOccurrence({ key: "2:2026-11-12", on: "2026-11-12", startsAt: new Date(2026, 10, 12, 9).toISOString(), endsAt: null }, { id: 2 });
    const earlier = makeOccurrence({ key: "3:2026-11-12", on: "2026-11-12", startsAt: new Date(2026, 10, 12, 8).toISOString(), endsAt: null }, { id: 3 });
    const groups = agendaGroups([morning, allDay, earlier]);
    expect(groups).toHaveLength(1);
    expect(groups[0][1].map((o) => o.key)).toEqual(["1:2026-11-12", "3:2026-11-12", "2:2026-11-12"]);
  });
});
