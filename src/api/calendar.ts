/**
 * The agenda — `docs/design/calendar/SPEC.md`.
 *
 * ── THE CORRECTION THAT SHAPES THIS FILE ──────────────────────────────────
 * The endpoint is **`GET /api/v1/calendar_app/events/upcoming`**, and NOT
 * `/events`, which is the flat list of event rows. The difference is not
 * cosmetic: recurrence in this system is arithmetic, not rows —
 *
 *   "Recurrence is arithmetic, not rows: an event stores a rule and this
 *    expands it over the window being asked about. 'Every birthday forever'
 *    costs one row and one loop bounded by the window."
 *                                       — `calendar_app/occurrences.rb:5-8`
 *
 * So a yearly birthday is ONE row whose `starts_on` is in 1990. An agenda built
 * on `/events` sorts it into 1990 and never shows it. `upcoming` returns
 * OCCURRENCES — the rule already expanded over the window, already ordered, and
 * already including events shared with the reader rather than only their own
 * (`calendar_app/upcoming.rb:21-27`). The controller says so itself at
 * `events_controller.rb:21-22`.
 *
 * ── AN OCCURRENCE ID IS A STRING ──────────────────────────────────────────
 * `"#{event.id}:#{on}"` (`occurrences.rb:16`) — a composite key, not a record
 * id. `parse.ts`'s `id()` is deliberately strict about numbers and would throw
 * on it, correctly. It is parsed with `str()` and used as the list key, which
 * is exactly what a composite key is good for: the same event on two days is
 * two rows and they must not share a key.
 *
 * ── READ-ONLY, ON PURPOSE ─────────────────────────────────────────────────
 * `create`, `update`, `destroy`, `restore` and `destroy_permanently` all exist
 * on that controller and none is wired here. "A calendar that can read but not
 * write is honest, a calendar with a broken create button is not."
 *
 * ── AND THE TIMEZONE IS THE SERVER'S ──────────────────────────────────────
 * `events_controller.rb:138` resolves `current_user.timezone` and `Upcoming`
 * expands in that zone. This file formats what it is given and re-zones
 * nothing. Two timezone implementations in one feature is how an event lands on
 * the wrong day.
 */
import { http } from "./http";
import { arr, id, obj, optStr, str } from "./parse";

export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  kind: string | null;
  /** Non-null means it repeats — one glyph on the row, because a weekly
   *  stand-up that looks like a one-off is a small lie. */
  recurrence: string | null;
  /** The event's own colour. Data, not decoration — `IDENTITY.md` §1. */
  color: string | null;
}

export interface Occurrence {
  /** `"<eventId>:<date>"`. A composite key — see this file's header. */
  key: string;
  /** The day it falls on, in the reader's zone. Always present. */
  on: string;
  /** Null for an all-day event, which is why `on` does the grouping. */
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  event: CalendarEvent;
}

/**
 * A hex colour, or nothing.
 *
 * Anything else is dropped rather than handed to `backgroundColor`, where an
 * unexpected string is a red-box crash on Android and a silent no-op on iOS.
 * The row falls back to `categoryColorFor(event.id)`, so the bar is always
 * meaningful and never invented.
 */
function parseColor(value: unknown): string | null {
  const raw = optStr(value);
  return raw && /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : null;
}

function parseEvent(payload: unknown): CalendarEvent {
  const record = obj(payload, "event");
  return {
    id: id(record.id, "event.id"),
    title: optStr(record.title) ?? "Untitled",
    description: optStr(record.description),
    location: optStr(record.location),
    kind: optStr(record.kind),
    recurrence: optStr(record.recurrence),
    color: parseColor(record.color),
  };
}

function parseOccurrence(payload: unknown): Occurrence {
  const record = obj(payload, "occurrence");
  return {
    // `str`, not `id` — see this file's header.
    key: str(record.id, "occurrence.id"),
    on: str(record.on, "occurrence.on"),
    startsAt: optStr(record.starts_at),
    endsAt: optStr(record.ends_at),
    allDay: typeof record.all_day === "boolean" ? record.all_day : false,
    event: parseEvent(record.event),
  };
}

export const calendarApi = {
  /**
   * What is coming, from today forward.
   *
   * Seven days by default: "the next few days" is his phrase, and a week is the
   * smallest window that reliably contains something. The server clamps `days`
   * to 1–365 and caps the result at 100 occurrences (`upcoming.rb:13`), which a
   * seven-day window cannot reach.
   *
   * **The order is the server's and is not re-sorted here.** `Occurrence#sort_key`
   * (`occurrences.rb:19`) puts all-day events before timed ones within a day,
   * and re-sorting on the client would mean re-deriving a rule that arrives for
   * free — and getting it subtly different.
   */
  upcoming: async (days = 7): Promise<Occurrence[]> => {
    const res = await http.get("/api/v1/calendar_app/events/upcoming", {
      params: { days },
    });
    const record = obj(res.data, "upcoming");
    return arr(record.occurrences, "upcoming.occurrences").map(parseOccurrence);
  },
};

export const __parse = { parseOccurrence, parseColor };
