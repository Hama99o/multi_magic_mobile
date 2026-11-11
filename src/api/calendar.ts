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
 * ── AND NOW IT WRITES (2026-11-11) ────────────────────────────────────────
 * It was read-only on purpose while the calendar was one view of a
 * four-screen assistant. It is now a full app (`docs/design/calendar/SPEC.md`
 * §A): create, update, delete-to-trash and restore, and the guests. Request
 * bodies use the SERVER's field names (`events_controller.rb#event_params`),
 * because nothing here converts case. The JSON shapes the phone sends are
 * pinned server-side by `mobile_contract_spec.rb` (multi_magic b55f6ff5).
 *
 * ── AND THE TIMEZONE IS THE SERVER'S ──────────────────────────────────────
 * `events_controller.rb:138` resolves `current_user.timezone` and `Upcoming`
 * expands in that zone. This file formats what it is given and re-zones
 * nothing. Two timezone implementations in one feature is how an event lands on
 * the wrong day.
 */
import { http } from "./http";
import { arr, id, obj, optStr, readableRows, str } from "./parse";

export type EventKind = "event" | "appointment" | "birthday" | "anniversary";
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type Permission = "owner" | "editor" | "viewer";
export type GuestPermission = "editor" | "viewer";
export type Response = "pending" | "accepted" | "declined";

export const KINDS: readonly EventKind[] = ["event", "appointment", "birthday", "anniversary"];
export const RECURRENCES: readonly Recurrence[] = ["none", "daily", "weekly", "monthly", "yearly"];
/** `CalendarApp::Reminder::PRESETS`, in minutes. */
export const REMINDER_PRESETS = [0, 15, 60, 1440, 10080] as const;

export interface Reminder {
  id: number;
  leadMinutes: number;
}

export interface Share {
  id: number;
  permission: GuestPermission;
  response: Response;
  sharedWithId: number;
  sharedWithName: string;
  /** Only the owner's share list carries it (`event_shares#present`). */
  sharedWithEmail: string | null;
}

export interface CalendarEvent {
  id: number;
  /** Null when the server sends none. The word for "untitled" is chosen at
   *  render, in the reader's language, not baked in here in English. */
  title: string | null;
  description: string | null;
  location: string | null;
  kind: string | null;
  allDay: boolean;
  /** Set when all-day: the DATE is the truth. */
  startsOn: string | null;
  endsOn: string | null;
  /** Set when timed: the INSTANT is the truth. */
  startsAt: string | null;
  endsAt: string | null;
  /** Non-null means it repeats — one glyph on the row, because a weekly
   *  stand-up that looks like a one-off is a small lie. "none" is null. */
  recurrence: string | null;
  recurrenceUntil: string | null;
  /** The web's colour key (`blue green amber red grey`) or a hex; anything
   *  else is dropped. Resolved to a colour by `eventColor()`. */
  color: string | null;
  owner: { id: number; name: string } | null;
  /** What THIS reader may do (`event_serializer.rb`), so no control the
   *  server would refuse is drawn. Null: not known, so nothing is offered. */
  permission: Permission | null;
  /** A guest's own answer; null for the owner. */
  response: Response | null;
  reminders: Reminder[];
  shares: Share[];
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

/** What `create` and `update` send, in the server's own names. */
export interface EventPayload {
  title: string;
  description: string | null;
  location: string | null;
  kind: EventKind;
  all_day: boolean;
  starts_on: string | null;
  ends_on: string | null;
  starts_at: string | null;
  ends_at: string | null;
  recurrence: Recurrence;
  recurrence_until: string | null;
  color: string | null;
}

export const COLOR_KEYS = ["blue", "green", "amber", "red", "grey"] as const;

/**
 * A hex colour, one of the web's keys, or nothing.
 *
 * Anything else is dropped rather than handed to `backgroundColor`, where an
 * unexpected string is a red-box crash on Android and a silent no-op on iOS.
 * The web stores KEYS ("green"); until 2026-11-11 this accepted hex only, so
 * every colour chosen on the web was silently ignored on the phone.
 */
function parseColor(value: unknown): string | null {
  const raw = optStr(value);
  if (!raw) return null;
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  return (COLOR_KEYS as readonly string[]).includes(raw) ? raw : null;
}

/**
 * The server's recurrence is a Rails enum (`CalendarApp::Event`: none, daily,
 * weekly, monthly, yearly), so a one-off event arrives as the STRING "none".
 * Kept as-is, every one-off event drew `EventRow`'s repeat icon (seen
 * 2026-11-10). "none" and absent are both null: no recurrence.
 */
function parseRecurrence(value: unknown): string | null {
  const recurrence = optStr(value);
  return recurrence === "none" ? null : recurrence;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const RESPONSES: readonly Response[] = ["pending", "accepted", "declined"];

function parseShare(payload: unknown): Share {
  const record = obj(payload, "share");
  return {
    id: id(record.id, "share.id"),
    permission: oneOf(record.permission, ["editor", "viewer"] as const) ?? "viewer",
    response: oneOf(record.response, RESPONSES) ?? "pending",
    sharedWithId: id(record.shared_with_id, "share.shared_with_id"),
    sharedWithName: optStr(record.shared_with_name) ?? optStr(record.shared_with_email) ?? "",
    sharedWithEmail: optStr(record.shared_with_email),
  };
}

function parseReminder(payload: unknown): Reminder {
  const record = obj(payload, "reminder");
  return { id: id(record.id, "reminder.id"), leadMinutes: id(record.lead_minutes, "reminder.lead_minutes") };
}

/** A list the row can do without: read what can be read, never fail the event for it. */
function decorations<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) return [];
  return readableRows(value, parse).rows;
}

function parseEvent(payload: unknown): CalendarEvent {
  const record = obj(payload, "event");
  const owner = record.owner && typeof record.owner === "object" ? (record.owner as Record<string, unknown>) : null;
  return {
    id: id(record.id, "event.id"),
    title: optStr(record.title),
    description: optStr(record.description),
    location: optStr(record.location),
    kind: optStr(record.kind),
    allDay: record.all_day === true,
    startsOn: optStr(record.starts_on),
    endsOn: optStr(record.ends_on),
    startsAt: optStr(record.starts_at),
    endsAt: optStr(record.ends_at),
    recurrence: parseRecurrence(record.recurrence),
    recurrenceUntil: optStr(record.recurrence_until),
    color: parseColor(record.color),
    owner: owner && typeof owner.id === "number" ? { id: owner.id, name: optStr(owner.name) ?? "" } : null,
    permission: oneOf(record.current_user_permission, ["owner", "editor", "viewer"] as const),
    response: oneOf(record.current_user_response, RESPONSES),
    reminders: decorations(record.reminders, parseReminder),
    shares: decorations(record.shares, parseShare),
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

export interface OccurrencePage {
  occurrences: Occurrence[];
  unreadable: number;
}

function occurrencePage(data: unknown, field: string): OccurrencePage {
  const record = obj(data, field);
  const { rows, unreadable } = readableRows(arr(record.occurrences, `${field}.occurrences`), parseOccurrence);
  return { occurrences: rows, unreadable };
}

const BASE = "/api/v1/calendar_app/events";

const eventOf = (data: unknown) => parseEvent(obj(data, "response").event);
const shareOf = (data: unknown) => parseShare(obj(data, "response").share);

export const calendarApi = {
  /**
   * What is coming, from today forward.
   *
   * Seven days by default: "the next few days" is his phrase, and a week is the
   * smallest window that reliably contains something. The server clamps `days`
   * to 1–365 and caps the result at 100 occurrences (`upcoming.rb:13`).
   *
   * **The order is the server's and is not re-sorted here.** `Occurrence#sort_key`
   * (`occurrences.rb:19`) puts all-day events before timed ones within a day,
   * and re-sorting on the client would mean re-deriving a rule that arrives for
   * free — and getting it subtly different.
   */
  upcoming: async (days = 7): Promise<Occurrence[]> => (await calendarApi.upcomingPage(days)).occurrences,

  /** The same, with a count of the occurrences that could not be read, for
   *  the calendar screen to say so (`readableRows`, parse.ts). */
  upcomingPage: async (days = 7): Promise<OccurrencePage> => {
    const res = await http.get(`${BASE}/upcoming`, { params: { days } });
    return occurrencePage(res.data, "upcoming");
  },

  /** Every occurrence in a window, uncapped (the server limits the window to
   *  400 days instead) — what the month view reads. */
  occurrences: async (from: string, to: string): Promise<OccurrencePage> => {
    const res = await http.get(`${BASE}/occurrences`, { params: { from, to } });
    return occurrencePage(res.data, "occurrences");
  },

  show: async (eventId: number): Promise<CalendarEvent> => eventOf((await http.get(`${BASE}/${eventId}`)).data),

  /** `reminders` are lead times in minutes, the WHOLE list: the server
   *  replaces what it has with it (`apply_reminders`). */
  create: async (event: EventPayload, reminders: number[]): Promise<CalendarEvent> =>
    eventOf((await http.post(BASE, { event, reminders })).data),

  update: async (eventId: number, event: EventPayload, reminders: number[]): Promise<CalendarEvent> =>
    eventOf((await http.put(`${BASE}/${eventId}`, { event, reminders })).data),

  /** To the trash, not gone: `restore` is the Undo. Owner only. */
  remove: async (eventId: number): Promise<void> => {
    await http.delete(`${BASE}/${eventId}`);
  },

  restore: async (eventId: number): Promise<CalendarEvent> =>
    eventOf((await http.put(`${BASE}/${eventId}/restore`)).data),
};

export const sharesApi = {
  list: async (eventId: number): Promise<Share[]> => {
    const res = await http.get(`${BASE}/${eventId}/event_shares`);
    return readableRows(arr(obj(res.data, "shares").shares, "shares.shares"), parseShare).rows;
  },

  /** Trimmed and lower-cased here: the server matches `LOWER(email)`, and a
   *  trailing space from a phone keyboard's autocomplete is not an address. */
  invite: async (eventId: number, email: string, permission: GuestPermission): Promise<Share> =>
    shareOf((await http.post(`${BASE}/${eventId}/event_shares`, { share: { email: email.trim().toLowerCase(), permission } })).data),

  setPermission: async (eventId: number, shareId: number, permission: GuestPermission): Promise<Share> =>
    shareOf((await http.put(`${BASE}/${eventId}/event_shares/${shareId}`, { share: { permission } })).data),

  /** The owner removing a guest, or a guest removing THEMSELF (leaving). */
  remove: async (eventId: number, shareId: number): Promise<void> => {
    await http.delete(`${BASE}/${eventId}/event_shares/${shareId}`);
  },

  respond: async (eventId: number, response: "accepted" | "declined"): Promise<Share> =>
    shareOf((await http.put(`${BASE}/${eventId}/event_shares/respond`, { response })).data),
};

export const __parse = { parseOccurrence, parseColor, parseEvent };
