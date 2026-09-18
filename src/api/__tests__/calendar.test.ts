/**
 * The agenda at the boundary — and the first test is the whole reason this
 * file exists.
 *
 * `GET /events` (the flat list) and `GET /events/upcoming` (occurrences) both
 * return 200 with plausible-looking rows. The difference only shows on a
 * RECURRING event, where the flat list gives you a birthday dated 1990 and the
 * agenda silently has nothing in it. That is a bug you find in production, on
 * his real calendar, not in a demo.
 */
import MockAdapter from "axios-mock-adapter";
import { calendarApi, __parse } from "../calendar";
import { ApiShapeError } from "../parse";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

/** A yearly birthday: ONE row, `starts_on` in 1990, expanded by the server to
 *  this year's date. */
const birthday = {
  id: "12:2026-09-22",
  on: "2026-09-22",
  starts_at: null,
  ends_at: null,
  all_day: true,
  event: {
    id: 12,
    title: "Anisa's birthday",
    description: null,
    location: null,
    kind: "birthday",
    all_day: true,
    starts_on: "1990-09-22",
    recurrence: "yearly",
    color: "#e9ab4c",
  },
};

const standup = {
  id: "5:2026-09-18",
  on: "2026-09-18",
  starts_at: "2026-09-18T09:30:00Z",
  ends_at: "2026-09-18T10:00:00Z",
  all_day: false,
  event: {
    id: 5,
    title: "Daily standup",
    description: null,
    location: "Zoom",
    kind: "meeting",
    all_day: false,
    recurrence: "weekly",
    color: null,
  },
};

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});

afterEach(() => mock.restore());

// ── THE CORRECTION, PINNED ──────────────────────────────────────────────────
describe("which endpoint the agenda reads", () => {
  it("asks `upcoming`, never the flat `/events` list", async () => {
    mock
      .onGet("/api/v1/calendar_app/events/upcoming")
      .reply(200, { occurrences: [standup, birthday] });

    await calendarApi.upcoming(7);

    expect(mock.history.get[0].url).toBe("/api/v1/calendar_app/events/upcoming");
    expect(mock.history.get[0].params).toEqual({ days: 7 });
  });

  it("gets a 1990 birthday back on THIS year's date, which /events could not do", async () => {
    mock
      .onGet("/api/v1/calendar_app/events/upcoming")
      .reply(200, { occurrences: [birthday] });

    const [occurrence] = await calendarApi.upcoming();

    // The event row still says 1990; the OCCURRENCE says 2026. An agenda built
    // on the event would sort this into 1990 and never show it.
    expect(occurrence.on).toBe("2026-09-22");
    expect(occurrence.event.recurrence).toBe("yearly");
  });
});

describe("an occurrence id", () => {
  it("is a STRING composite key, not a record id", async () => {
    mock
      .onGet("/api/v1/calendar_app/events/upcoming")
      .reply(200, { occurrences: [standup, birthday] });

    const rows = await calendarApi.upcoming();

    expect(rows.map((r) => r.key)).toEqual(["5:2026-09-18", "12:2026-09-22"]);
    // The same event on two days must be two rows with two keys.
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });

  it("throws rather than coercing if the server ever sends a number", () => {
    expect(() => __parse.parseOccurrence({ ...standup, id: 5 })).toThrow(ApiShapeError);
  });
});

describe("the ordering", () => {
  it("is the server's and is not re-sorted — all-day first within a day", async () => {
    const sameDayTimed = { ...standup, id: "5:2026-09-22", on: "2026-09-22" };
    mock
      .onGet("/api/v1/calendar_app/events/upcoming")
      .reply(200, { occurrences: [birthday, sameDayTimed] });

    const rows = await calendarApi.upcoming();

    expect(rows.map((r) => r.key)).toEqual(["12:2026-09-22", "5:2026-09-22"]);
  });
});

describe("all-day events", () => {
  it("have a null starts_at, which is why `on` does the grouping", async () => {
    mock
      .onGet("/api/v1/calendar_app/events/upcoming")
      .reply(200, { occurrences: [birthday] });

    const [occurrence] = await calendarApi.upcoming();

    expect(occurrence.allDay).toBe(true);
    expect(occurrence.startsAt).toBeNull();
    expect(occurrence.on).toBe("2026-09-22");
  });
});

describe("the colour bar", () => {
  it("takes a hex colour from the event", () => {
    expect(__parse.parseColor("#e9ab4c")).toBe("#e9ab4c");
  });

  it("drops anything that is not one, rather than handing it to backgroundColor", () => {
    // An unexpected string here is a red box on Android and a silent no-op on
    // iOS — so the row falls back to `categoryColorFor` instead.
    expect(__parse.parseColor("rebeccapurple")).toBeNull();
    expect(__parse.parseColor("javascript:alert(1)")).toBeNull();
    expect(__parse.parseColor(null)).toBeNull();
    expect(__parse.parseColor(7)).toBeNull();
  });
});

describe("the window", () => {
  it("defaults to seven days — 'the next few days', not a month", async () => {
    mock.onGet("/api/v1/calendar_app/events/upcoming").reply(200, { occurrences: [] });

    await calendarApi.upcoming();

    expect(mock.history.get[0].params).toEqual({ days: 7 });
  });
});
