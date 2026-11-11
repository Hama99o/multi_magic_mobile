/**
 * One way to build a calendar event in a test, so a new field on
 * `CalendarEvent` is added here once instead of in every suite.
 */
import type { CalendarEvent, Occurrence } from "@/api/calendar";

export function makeEvent(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 5,
    title: "Dentist",
    description: null,
    location: null,
    kind: null,
    allDay: false,
    startsOn: null,
    endsOn: null,
    startsAt: null,
    endsAt: null,
    recurrence: null,
    recurrenceUntil: null,
    color: null,
    owner: null,
    permission: null,
    response: null,
    reminders: [],
    shares: [],
    ...over,
  };
}

export function makeOccurrence(over: Partial<Occurrence> = {}, event: Partial<CalendarEvent> = {}): Occurrence {
  return {
    key: "5:2026-09-20",
    on: "2026-09-20",
    startsAt: "2026-09-20T09:00:00Z",
    endsAt: "2026-09-20T09:30:00Z",
    allDay: false,
    ...over,
    event: makeEvent(event),
  };
}
