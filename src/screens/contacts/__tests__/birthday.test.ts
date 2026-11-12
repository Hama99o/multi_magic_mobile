import { birthdayInfo } from "../birthday";

describe("birthdayInfo", () => {
  it("counts the days to the next one and the age it brings", () => {
    expect(birthdayInfo("1990-04-05", "2026-04-01")).toEqual({ inDays: 4, turning: 36, nextDate: "2026-04-05" });
  });

  it("says 0 on the day itself", () => {
    expect(birthdayInfo("1990-11-12", "2026-11-12")).toEqual({ inDays: 0, turning: 36, nextDate: "2026-11-12" });
  });

  it("rolls into next year once this year's has passed", () => {
    expect(birthdayInfo("1990-01-02", "2026-11-12")).toEqual({ inDays: 51, turning: 37, nextDate: "2027-01-02" });
  });

  it("keeps a 29 February birthday on 28 February in a common year, as the web does", () => {
    expect(birthdayInfo("2000-02-29", "2026-02-01")).toEqual({ inDays: 27, turning: 26, nextDate: "2026-02-28" });
    expect(birthdayInfo("2000-02-29", "2028-02-01")).toEqual({ inDays: 28, turning: 28, nextDate: "2028-02-29" });
  });

  it("is null for a missing or broken date", () => {
    expect(birthdayInfo(null, "2026-11-12")).toBeNull();
    expect(birthdayInfo("nope", "2026-11-12")).toBeNull();
  });
});
