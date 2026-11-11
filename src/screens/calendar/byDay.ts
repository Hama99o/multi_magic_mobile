/**
 * Occurrences grouped by every day they cover.
 *
 * The server sends a multi-day event ONCE, on the day it starts (`on`), with
 * the event's own start and end. A month grid that only read `on` would mark
 * the first day of a three-day trip and leave the other two looking free.
 * The span is the EVENT's length, laid from this occurrence's `on`, so a
 * yearly 24–26 December spans 24–26 this year rather than in 2019.
 *
 * Order within a day is the server's (all-day first), never re-sorted.
 */
import type { Occurrence } from "@/api/calendar";
import { addDays, dayKey, parseDay } from "./dates";

/** Two months: no real event is longer, and a typo in an end date is. */
const MAX_SPAN = 62;

function spanDays(occurrence: Occurrence): number {
  const { event } = occurrence;
  let first: string | null = null;
  let last: string | null = null;
  if (occurrence.allDay) {
    first = event.startsOn;
    last = event.endsOn;
  } else if (occurrence.startsAt && occurrence.endsAt) {
    first = dayKey(new Date(occurrence.startsAt));
    last = dayKey(new Date(new Date(occurrence.endsAt).getTime() - 1));
  }
  if (!first || !last || last <= first) return 1;
  const days = Math.round((parseDay(last).getTime() - parseDay(first).getTime()) / 86_400_000) + 1;
  return Math.min(Math.max(days, 1), MAX_SPAN);
}

export function byDay(occurrences: Occurrence[]): Map<string, Occurrence[]> {
  const days = new Map<string, Occurrence[]>();
  for (const occurrence of occurrences) {
    const span = spanDays(occurrence);
    for (let index = 0; index < span; index += 1) {
      const day = addDays(occurrence.on, index);
      const list = days.get(day);
      if (list) list.push(occurrence);
      else days.set(day, [occurrence]);
    }
  }
  return days;
}
