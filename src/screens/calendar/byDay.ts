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

/**
 * The PHONE's day for an occurrence. The server files it under the
 * ACCOUNT's day (`on`), while every time on screen is the phone's clock; a
 * phone in New York on a Paris account showed 18:30 under tomorrow. A timed
 * occurrence sits under the local day of its start; an all-day one keeps
 * `on`, a date with no zone. Same phone and account zone: identical to `on`.
 */
export function localDay(occurrence: Occurrence): string {
  if (occurrence.allDay || !occurrence.startsAt) return occurrence.on;
  const start = new Date(occurrence.startsAt);
  return Number.isNaN(start.getTime()) ? occurrence.on : dayKey(start);
}

/**
 * The agenda: `[day, occurrences]` in day order, all-day first, then by
 * start. It IS a sort, because moving a row to the phone's day can move it
 * past rows the server ordered under the account's day; the key is the
 * server's own (`Occurrence#sort_key`) on the phone's clock, and ties keep
 * the server's order.
 */
export function agendaGroups(occurrences: Occurrence[]): [string, Occurrence[]][] {
  const keyed = occurrences.map((occurrence, index) => ({
    occurrence,
    index,
    day: localDay(occurrence),
    at: occurrence.startsAt ? new Date(occurrence.startsAt).getTime() || 0 : 0,
  }));
  keyed.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? -1 : 1;
    if (a.occurrence.allDay !== b.occurrence.allDay) return a.occurrence.allDay ? -1 : 1;
    return a.at - b.at || a.index - b.index;
  });
  const groups: [string, Occurrence[]][] = [];
  for (const { day, occurrence } of keyed) {
    const last = groups[groups.length - 1];
    if (last && last[0] === day) last[1].push(occurrence);
    else groups.push([day, [occurrence]]);
  }
  return groups;
}

export function byDay(occurrences: Occurrence[]): Map<string, Occurrence[]> {
  const days = new Map<string, Occurrence[]>();
  for (const occurrence of occurrences) {
    const span = spanDays(occurrence);
    const first = localDay(occurrence);
    for (let index = 0; index < span; index += 1) {
      const day = addDays(first, index);
      const list = days.get(day);
      if (list) list.push(occurrence);
      else days.set(day, [occurrence]);
    }
  }
  return days;
}
