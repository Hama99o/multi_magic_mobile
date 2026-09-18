import { isToday, relativeTime } from "../relativeTime";

const now = new Date("2026-09-18T16:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("relativeTime", () => {
  it("reads as just now for anything inside a minute", () => {
    expect(relativeTime(ago(5_000), now)).toBe("just now");
  });

  // A device clock slightly behind the server's would otherwise produce
  // "in 3 seconds" on a message that has just arrived.
  it("does not go negative when the device clock is behind the server", () => {
    expect(relativeTime(new Date(now.getTime() + 3_000).toISOString(), now)).toBe("just now");
  });

  it("counts minutes, then hours", () => {
    expect(relativeTime(ago(12 * 60_000), now)).toBe("12 min ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
  });

  // Past a week "37 days ago" is arithmetic nobody asked for.
  it("switches to a date rather than counting days forever", () => {
    expect(relativeTime(ago(40 * 86_400_000), now)).toMatch(/\d/);
    expect(relativeTime(ago(40 * 86_400_000), now)).not.toMatch(/days ago/);
  });

  it("survives a malformed timestamp instead of rendering NaN", () => {
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("isToday", () => {
  it("separates today from earlier", () => {
    expect(isToday(ago(60_000), now)).toBe(true);
    expect(isToday(ago(3 * 86_400_000), now)).toBe(false);
  });
});
