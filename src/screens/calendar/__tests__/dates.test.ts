/**
 * Calendar arithmetic on the DEVICE's day. Runs in Paris and again in New York
 * (`npm run test:west`): every bug in this file's history is a UTC/local
 * mix-up that only one of the two zones shows.
 */
import {
  addDays,
  addMonths,
  dayKey,
  formatTime,
  gridWindow,
  monthGridDays,
  parseDay,
  uses12h,
  weekStartsOn,
  weekdayLabels,
  timeRange,
  yearsOn,
} from "../dates";

describe("a day key", () => {
  it("is the LOCAL date, never toISOString's UTC one", () => {
    // 23:30 local on the 3rd is already the 4th in UTC east of here, and the
    // 3rd's evening is the 4th's morning in UTC west of here.
    expect(dayKey(new Date(2026, 3, 3, 23, 30))).toBe("2026-04-03");
    expect(dayKey(new Date(2026, 3, 3, 0, 15))).toBe("2026-04-03");
  });

  it("round-trips through parseDay at local midnight", () => {
    const d = parseDay("2026-02-28");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 1, 28, 0]);
    expect(dayKey(parseDay("2026-02-28"))).toBe("2026-02-28");
  });

  it("adds days across a month and a DST change without drifting", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // Europe's spring-forward night
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // America's fall-back night
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("adds months from the first of the month, so the 31st never skips one", () => {
    expect(addMonths("2026-01-01", 1)).toBe("2026-02-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
  });
});

describe("the month grid", () => {
  it("is always 42 days, so it never changes height between months", () => {
    for (const month of ["2026-02-01", "2026-03-01", "2026-08-01", "2027-02-01"]) {
      expect(monthGridDays(month, 1)).toHaveLength(42);
    }
  });

  it("starts on the reader's first weekday", () => {
    // 1 Nov 2026 is a Sunday.
    expect(monthGridDays("2026-11-01", 1)[0]).toBe("2026-10-26"); // Monday-first
    expect(monthGridDays("2026-11-01", 0)[0]).toBe("2026-11-01"); // Sunday-first
  });

  it("asks the server for exactly the days it draws", () => {
    expect(gridWindow("2026-11-01", 1)).toEqual({ from: "2026-10-26", to: "2026-12-06" });
  });

  it("English and French both start on Monday; US English on Sunday", () => {
    expect(weekStartsOn("fr")).toBe(1);
    expect(weekStartsOn("en")).toBe(1);
    expect(weekStartsOn("en-US")).toBe(0);
  });

  it("labels the weekdays in the app's language, in grid order", () => {
    expect(weekdayLabels(1, "fr")).toHaveLength(7);
    expect(weekdayLabels(1, "en")[0]).toMatch(/^M/);
    expect(weekdayLabels(0, "en")[0]).toMatch(/^S/);
  });
});

describe("the clock", () => {
  it("is 24 h in French and 12 h in English", () => {
    expect(uses12h("fr")).toBe(false);
    expect(uses12h("en")).toBe(true);
  });

  it("formats HH:MM the way the language writes it", () => {
    expect(formatTime("14:05", "fr")).toBe("14:05");
    expect(formatTime("14:05", "en")).toMatch(/^2:05\sPM$/);
    expect(formatTime("00:00", "en")).toMatch(/^12:00\sAM$/);
  });
});

describe("an age", () => {
  const birthday = { recurrence: "yearly", allDay: true, startsOn: "1990-04-03", startsAt: null };
  it("is this occurrence's year minus the year it began", () => {
    expect(yearsOn(birthday, "2026-04-03")).toBe(36);
  });
  it("is nothing for an event that does not come round every year, or the first one", () => {
    expect(yearsOn({ ...birthday, recurrence: "weekly" }, "2026-04-03")).toBeNull();
    expect(yearsOn(birthday, "1990-04-03")).toBeNull();
  });
});

/**
 * The detail page's "when" line. Hard cases from the 2026-11-11 desk pass:
 * a zero-minute event, and one that runs past midnight into another day.
 */
describe("a time range", () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();

  it("is one time when it starts and ends at the same minute", () => {
    expect(timeRange({ allDay: false, startsAt: at(20, 10), endsAt: at(20, 10), startsOn: null, endsOn: null }, "fr")).toBe("10:00");
  });

  it("is start – end on one day", () => {
    expect(timeRange({ allDay: false, startsAt: at(20, 10), endsAt: at(20, 11, 30), startsOn: null, endsOn: null }, "fr")).toBe("10:00 – 11:30");
  });

  it("NAMES the end's day when it ends on another one", () => {
    const line = timeRange({ allDay: false, startsAt: at(13, 22), endsAt: at(15, 2), startsOn: null, endsOn: null }, "fr");
    expect(line).toMatch(/^22:00 → .*15.* 02:00$/);
  });

  it("an all-day span names its last day", () => {
    expect(timeRange({ allDay: true, startsAt: null, endsAt: null, startsOn: "2026-11-13", endsOn: "2026-11-15" }, "fr", "Toute la journée")).toMatch(/^Toute la journée → .*15/);
    expect(timeRange({ allDay: true, startsAt: null, endsAt: null, startsOn: "2026-11-13", endsOn: null }, "fr", "Toute la journée")).toBe("Toute la journée");
  });
});
