/**
 * Calendar arithmetic, on the DEVICE's own day.
 *
 * Every function here takes and returns `YYYY-MM-DD` keys built from LOCAL
 * getters, never `toISOString()` (UTC), which puts "today" on yesterday for
 * anybody west of Greenwich after their evening and on tomorrow east of it
 * after midnight UTC. Days are stepped with `setDate`, never by adding
 * 86 400 000 ms, which lands on 23:00 the day before across a DST change.
 *
 * The SERVER decides which day an occurrence falls on (`occurrence.on`, in the
 * user's zone); this file only lays days out and labels them.
 */
import type { CalendarEvent } from "@/api/calendar";

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight of a key. Built from parts: `new Date("2026-04-03")` is
 *  UTC midnight, which is the 2nd in New York. */
export function parseDay(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function todayKey(now: Date = new Date()): string {
  return dayKey(now);
}

export function addDays(key: string, count: number): string {
  const date = parseDay(key);
  date.setDate(date.getDate() + count);
  return dayKey(date);
}

/** The FIRST of the month `count` months away. Always from the first, so
 *  "the 31st plus one month" cannot skip February. */
export function addMonths(key: string, count: number): string {
  const date = parseDay(key);
  return dayKey(new Date(date.getFullYear(), date.getMonth() + count, 1));
}

export function startOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

/**
 * The six weeks a month grid draws, from the reader's first weekday. Always
 * 42 days, so the grid never changes height between months — a shifting grid
 * makes every tap land somewhere different (the web's `monthGridDays`).
 */
export function monthGridDays(month: string, weekStart: number): string[] {
  const first = parseDay(startOfMonth(month));
  const offset = (first.getDay() - weekStart + 7) % 7;
  const start = dayKey(new Date(first.getFullYear(), first.getMonth(), 1 - offset));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/** What to ask the server for: exactly the days the grid draws. */
export function gridWindow(month: string, weekStart: number): { from: string; to: string } {
  const days = monthGridDays(month, weekStart);
  return { from: days[0], to: days[days.length - 1] };
}

/**
 * Monday everywhere this app speaks (English and French), Sunday only for a
 * language tag that is explicitly US/Canadian — the web's rule
 * (`dates.ts#weekStartsOn`), so both clients draw the same grid.
 */
export function weekStartsOn(language: string): number {
  const lower = language.toLowerCase();
  return ["en-us", "en-ca"].some((code) => lower.startsWith(code)) ? 0 : 1;
}

/** One-letter weekday headers, in grid order and the app's language. */
export function weekdayLabels(weekStart: number, language: string): string[] {
  // 2026-11-01 is a Sunday; walk a week from the grid's first weekday.
  return Array.from({ length: 7 }, (_, index) =>
    parseDay(addDays("2026-11-01", (weekStart + index) % 7)).toLocaleDateString(language, { weekday: "narrow" }),
  );
}

/**
 * Whether the app's language writes a 12-hour clock. Measured by formatting
 * 13:00 rather than trusting `resolvedOptions().hour12`, which Hermes has not
 * always filled in.
 */
export function uses12h(language: string): boolean {
  const thirteen = new Date(2000, 0, 1, 13, 0).toLocaleTimeString(language, { hour: "numeric" });
  return !thirteen.includes("13");
}

/** "14:05" → "14:05" in French, "2:05 PM" in English. */
export function formatTime(hhmm: string, language: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return hhmm;
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(language, {
    hour: uses12h(language) ? "numeric" : "2-digit",
    minute: "2-digit",
  });
}

/** "Thu 12 Nov" / "jeu. 12 nov." — the short label a field shows. */
export function formatDay(key: string, language: string, withYear = false): string {
  return parseDay(key).toLocaleDateString(language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** "Thursday 12 November 2026" — what a screen reader says for a day. */
export function formatDayLong(key: string, language: string): string {
  return parseDay(key).toLocaleDateString(language, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "November 2026", for the month header. */
export function formatMonth(key: string, language: string): string {
  return parseDay(key).toLocaleDateString(language, { month: "long", year: "numeric" });
}

/** "HH:MM" of an instant, in the device's zone. */
export function clockOf(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** How old someone turns, or how many years an anniversary marks, on `on` —
 *  the point of storing the year it began (`Event#years_on`). */
export function yearsOn(event: Pick<CalendarEvent, "recurrence" | "allDay" | "startsOn" | "startsAt">, on: string): number | null {
  if (event.recurrence !== "yearly") return null;
  const anchor = event.allDay ? event.startsOn : event.startsAt;
  if (!anchor) return null;
  const years = parseDay(on).getFullYear() - (event.allDay ? parseDay(anchor) : new Date(anchor)).getFullYear();
  return years > 0 && years < 200 ? years : null;
}

/**
 * The detail page's "when" line, on the phone's clock.
 * - starts and ends at the same minute: ONE time ("10:00 – 10:00" says
 *   nothing a single time does not);
 * - ends on another day: the end NAMES its day ("22:00 → Sun 15 Nov 02:00"),
 *   because "22:00 – 02:00" hides that it runs two nights;
 * - an all-day span names its last day.
 */
export function timeRange(
  event: { allDay: boolean; startsAt: string | null; endsAt: string | null; startsOn: string | null; endsOn: string | null },
  language: string,
  allDayLabel = "All day",
): string {
  if (event.allDay) {
    return event.endsOn && event.startsOn && event.endsOn > event.startsOn
      ? `${allDayLabel} → ${formatDay(event.endsOn, language)}`
      : allDayLabel;
  }
  const start = event.startsAt ? clockOf(event.startsAt) : null;
  if (!event.startsAt || !start) return "";
  const startText = formatTime(start, language);
  const end = event.endsAt ? clockOf(event.endsAt) : null;
  if (!event.endsAt || !end || new Date(event.endsAt).getTime() <= new Date(event.startsAt).getTime()) return startText;
  const endDay = dayKey(new Date(event.endsAt));
  if (endDay !== dayKey(new Date(event.startsAt))) return `${startText} → ${formatDay(endDay, language)} ${formatTime(end, language)}`;
  return `${startText} – ${formatTime(end, language)}`;
}
