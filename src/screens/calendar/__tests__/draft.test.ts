/**
 * The form's brain, with no screen in the way. Each rule is the web's
 * (`EventDrawer.tsx`), so a person who learnt the calendar on the laptop
 * finds the same behaviour on the phone.
 */
import { makeEvent } from "@/__tests__/calendarFixtures";
import {
  draftFromEvent,
  isDirty,
  newDraft,
  problems,
  toPayload,
  toggleReminder,
  withAllDay,
  withDay,
  withKind,
  withStartTime,
  type Draft,
} from "../draft";

const base = (over: Partial<Draft> = {}): Draft => ({ ...newDraft("2026-11-12", new Date(2026, 10, 1, 8, 0)), ...over });

describe("a new draft", () => {
  it("on a later day starts at 09:00 for an hour, with the web's one-hour reminder", () => {
    const draft = newDraft("2026-11-12", new Date(2026, 10, 1, 8, 0));
    expect(draft).toMatchObject({ day: "2026-11-12", startTime: "09:00", endTime: "10:00", allDay: false, kind: "event", reminders: [60], recurrence: "none" });
  });

  it("TODAY starts at the next full hour, not at a 09:00 already gone", () => {
    const draft = newDraft("2026-11-12", new Date(2026, 10, 12, 14, 20));
    expect(draft.startTime).toBe("15:00");
    expect(draft.endTime).toBe("16:00");
  });

  it("late tonight still starts today rather than wrapping to 00:00 before it", () => {
    const draft = newDraft("2026-11-12", new Date(2026, 10, 12, 23, 40));
    expect(draft.startTime).toBe("23:00");
  });
});

describe("moving the start", () => {
  it("moves an end that would be behind it", () => {
    expect(withStartTime(base({ startTime: "09:00", endTime: "10:00" }), "11:15").endTime).toBe("12:15");
  });

  it("leaves an end that is still after it", () => {
    expect(withStartTime(base({ startTime: "09:00", endTime: "17:00" }), "10:00").endTime).toBe("17:00");
  });

  it("a later start DAY carries a multi-day end with it", () => {
    const draft = withDay(base({ day: "2026-11-12", endDay: "2026-11-14" }), "2026-11-20");
    expect(draft.endDay).toBe("2026-11-22");
  });
});

describe("the kind", () => {
  it("a birthday is all-day and yearly without being asked", () => {
    expect(withKind(base(), "birthday")).toMatchObject({ kind: "birthday", allDay: true, recurrence: "yearly" });
    expect(withKind(base(), "anniversary")).toMatchObject({ allDay: true, recurrence: "yearly" });
  });

  it("leaving birthday for event does not undo what the person set", () => {
    expect(withKind(withKind(base(), "birthday"), "event")).toMatchObject({ allDay: true, recurrence: "yearly" });
  });
});

describe("reminders", () => {
  it("toggle in and out, kept sorted", () => {
    let draft = base({ reminders: [60] });
    draft = toggleReminder(draft, 15);
    draft = toggleReminder(draft, 1440);
    expect(draft.reminders).toEqual([15, 60, 1440]);
    expect(toggleReminder(draft, 60).reminders).toEqual([15, 1440]);
  });
});

describe("the payload", () => {
  it("a timed event carries instants and NO dates — never both", () => {
    const payload = toPayload(base({ title: "  Dentist ", startTime: "14:30", endTime: "15:00" }));
    expect(payload).toMatchObject({ title: "Dentist", all_day: false, starts_on: null, ends_on: null });
    expect(new Date(payload.starts_at!).getTime()).toBe(new Date(2026, 10, 12, 14, 30).getTime());
    expect(new Date(payload.ends_at!).getTime()).toBe(new Date(2026, 10, 12, 15, 0).getTime());
  });

  it("an all-day event carries dates and NO instants", () => {
    const payload = toPayload(withAllDay(base({ title: "Off", endDay: "2026-11-13" }), true));
    expect(payload).toMatchObject({ all_day: true, starts_on: "2026-11-12", ends_on: "2026-11-13", starts_at: null, ends_at: null });
  });

  it("an end before the start is dropped, not sent backwards", () => {
    expect(toPayload(base({ title: "x", endDay: "2026-11-12", startTime: "15:00", endTime: "14:00" })).ends_at).toBeNull();
    expect(toPayload(withAllDay(base({ title: "x", endDay: "2026-11-10" }), true)).ends_on).toBeNull();
  });

  it("an end on a later day is kept for a timed event", () => {
    const payload = toPayload(base({ title: "Trip", endDay: "2026-11-13", startTime: "20:00", endTime: "08:00" }));
    expect(new Date(payload.ends_at!).getTime()).toBe(new Date(2026, 10, 13, 8, 0).getTime());
  });

  it("blank notes and location are null, and 'repeat until' only when it repeats", () => {
    const payload = toPayload(base({ title: "x", description: "  ", location: "", recurrenceUntil: "2027-01-01" }));
    expect(payload).toMatchObject({ description: null, location: null, recurrence_until: null });
    expect(toPayload(base({ title: "x", recurrence: "weekly", recurrenceUntil: "2027-01-01" })).recurrence_until).toBe("2027-01-01");
  });
});

describe("what stops a save", () => {
  it("a title is required, and so is a day", () => {
    expect(problems(base({ title: "  " }))).toContain("title");
    expect(problems(base({ title: "x", day: "" }))).toContain("day");
    expect(problems(base({ title: "x" }))).toEqual([]);
  });

  it("a 'repeat until' before the first day is a mistake the form names", () => {
    expect(problems(base({ title: "x", recurrence: "weekly", recurrenceUntil: "2026-11-01" }))).toContain("until");
  });
});

describe("an existing event", () => {
  it("fills the draft from a timed event in LOCAL terms", () => {
    const at = new Date(2026, 10, 12, 14, 30);
    const end = new Date(2026, 10, 12, 15, 45);
    const draft = draftFromEvent(makeEvent({ title: "Dentist", startsAt: at.toISOString(), endsAt: end.toISOString(), reminders: [{ id: 1, leadMinutes: 15 }], recurrence: "weekly", color: "green" }));
    expect(draft).toMatchObject({ title: "Dentist", day: "2026-11-12", startTime: "14:30", endDay: "2026-11-12", endTime: "15:45", reminders: [15], recurrence: "weekly", color: "green" });
  });

  it("fills an all-day birthday from its DATE, not shifted by a zone", () => {
    const draft = draftFromEvent(makeEvent({ kind: "birthday", allDay: true, startsOn: "1990-04-03", recurrence: "yearly" }));
    expect(draft).toMatchObject({ allDay: true, day: "1990-04-03", kind: "birthday", recurrence: "yearly" });
  });

  it("an unchanged draft is not dirty, so Cancel does not ask", () => {
    const draft = draftFromEvent(makeEvent({ startsAt: new Date(2026, 10, 12, 9).toISOString() }));
    expect(isDirty(draft, draft)).toBe(false);
    expect(isDirty({ ...draft, title: "changed" }, draft)).toBe(true);
  });
});
