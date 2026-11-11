/**
 * The event form's brain: a draft, the rules that keep it coherent, and the
 * payload it becomes. No React here, so every rule is tested on its own
 * (`__tests__/draft.test.ts`).
 *
 * Each rule is the web's (`multi_magic/.../calendar/components/EventDrawer.tsx`)
 * so the laptop and the phone behave alike:
 *   - picking a birthday or an anniversary answers all-day and yearly;
 *   - moving the start moves an end that would fall behind it;
 *   - an end before the start is dropped, never sent backwards;
 *   - all-day carries DATES and timed carries INSTANTS, never both
 *     (`docs/CALENDAR_APP.md`: a birthday stored as a UTC instant lands on the
 *     2nd for half the world).
 */
import type { CalendarEvent, EventKind, EventPayload, Recurrence } from "@/api/calendar";
import { KINDS, RECURRENCES } from "@/api/calendar";
import { addDays, clockOf, dayKey, parseDay } from "./dates";

export interface Draft {
  title: string;
  description: string;
  location: string;
  kind: EventKind;
  allDay: boolean;
  /** `YYYY-MM-DD`. */
  day: string;
  /** `YYYY-MM-DD`, or "" for "ends the day it starts". */
  endDay: string;
  /** `HH:MM`, 24 h, whatever the display language. */
  startTime: string;
  endTime: string;
  recurrence: Recurrence;
  recurrenceUntil: string;
  color: string;
  reminders: number[];
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "14:30" → "15:30", wrapping at midnight. */
export function plusOneHour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours)) return time;
  return `${pad((hours + 1) % 24)}:${pad(minutes || 0)}`;
}

/**
 * A blank event on `day`. Today starts at the NEXT full hour, because 09:00
 * this morning is already gone and a form that proposes the past is a form
 * that gets saved with it; past 23:00 it stays at 23:00 rather than wrapping
 * to a midnight before it.
 */
export function newDraft(day: string, now: Date = new Date()): Draft {
  let startTime = "09:00";
  if (day === dayKey(now)) startTime = `${pad(Math.min(now.getHours() + 1, 23))}:00`;
  return {
    title: "",
    description: "",
    location: "",
    kind: "event",
    allDay: false,
    day,
    endDay: "",
    startTime,
    endTime: plusOneHour(startTime),
    recurrence: "none",
    recurrenceUntil: "",
    color: "blue",
    reminders: [60],
  };
}

function asKind(value: string | null): EventKind {
  return (KINDS as readonly string[]).includes(value ?? "") ? (value as EventKind) : "event";
}

function asRecurrence(value: string | null): Recurrence {
  return (RECURRENCES as readonly string[]).includes(value ?? "") ? (value as Recurrence) : "none";
}

/** An existing event as a draft, in the DEVICE's local terms. */
export function draftFromEvent(event: CalendarEvent): Draft {
  const startDay = event.allDay ? event.startsOn : event.startsAt ? dayKey(new Date(event.startsAt)) : null;
  const endDay = event.allDay ? event.endsOn : event.endsAt ? dayKey(new Date(event.endsAt)) : null;
  const startTime = (event.startsAt && clockOf(event.startsAt)) || "09:00";
  return {
    title: event.title ?? "",
    description: event.description ?? "",
    location: event.location ?? "",
    kind: asKind(event.kind),
    allDay: event.allDay,
    day: startDay ?? dayKey(new Date()),
    endDay: endDay ?? "",
    startTime,
    endTime: (event.endsAt && clockOf(event.endsAt)) || (event.allDay ? plusOneHour(startTime) : ""),
    recurrence: asRecurrence(event.recurrence),
    recurrenceUntil: event.recurrenceUntil ?? "",
    color: event.color ?? "blue",
    reminders: [...event.reminders.map((reminder) => reminder.leadMinutes)].sort((a, b) => a - b),
  };
}

export function withKind(draft: Draft, kind: EventKind): Draft {
  const annual = kind === "birthday" || kind === "anniversary";
  return { ...draft, kind, allDay: annual ? true : draft.allDay, recurrence: annual ? "yearly" : draft.recurrence };
}

export function withAllDay(draft: Draft, allDay: boolean): Draft {
  return { ...draft, allDay };
}

/** Moving the start moves an end that would be behind it — without this an
 *  event set to start at 00:15 silently kept a 10:00 end (the web's bug). */
export function withStartTime(draft: Draft, startTime: string): Draft {
  const sameDay = !draft.endDay || draft.endDay === draft.day;
  const behind = !draft.endTime || (sameDay && draft.endTime <= startTime);
  return { ...draft, startTime, endTime: behind ? plusOneHour(startTime) : draft.endTime };
}

/** Moving the start day carries a multi-day end by the same distance. */
export function withDay(draft: Draft, day: string): Draft {
  if (!draft.endDay || !draft.day) return { ...draft, day };
  const span = Math.round((parseDay(draft.endDay).getTime() - parseDay(draft.day).getTime()) / 86_400_000);
  return { ...draft, day, endDay: span > 0 ? addDays(day, span) : "" };
}

export function toggleReminder(draft: Draft, minutes: number): Draft {
  const reminders = draft.reminders.includes(minutes)
    ? draft.reminders.filter((value) => value !== minutes)
    : [...draft.reminders, minutes].sort((a, b) => a - b);
  return { ...draft, reminders };
}

/** A local instant from a day key and "HH:MM", built from parts (a string
 *  without an offset is parsed as UTC by some engines and local by others). */
function instant(day: string, time: string): Date {
  const date = parseDay(day);
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

export function toPayload(draft: Draft): EventPayload {
  const base = {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    location: draft.location.trim() || null,
    kind: draft.kind,
    recurrence: draft.recurrence,
    recurrence_until: draft.recurrence !== "none" && draft.recurrenceUntil ? draft.recurrenceUntil : null,
    color: draft.color || null,
  };
  if (draft.allDay) {
    const endsOn = draft.endDay && draft.endDay > draft.day ? draft.endDay : null;
    return { ...base, all_day: true, starts_on: draft.day, ends_on: endsOn, starts_at: null, ends_at: null };
  }
  const start = instant(draft.day, draft.startTime || "09:00");
  const end = draft.endTime ? instant(draft.endDay || draft.day, draft.endTime) : null;
  return {
    ...base,
    all_day: false,
    starts_on: null,
    ends_on: null,
    starts_at: start.toISOString(),
    ends_at: end && end > start ? end.toISOString() : null,
  };
}

export type Problem = "title" | "day" | "until";

/** What stops a save, named so the form can point at the field. */
export function problems(draft: Draft): Problem[] {
  const found: Problem[] = [];
  if (!draft.title.trim()) found.push("title");
  if (!draft.day) found.push("day");
  if (draft.recurrence !== "none" && draft.recurrenceUntil && draft.day && draft.recurrenceUntil < draft.day) found.push("until");
  return found;
}

/** Whether Cancel has something to lose. */
export function isDirty(draft: Draft, initial: Draft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(initial);
}
