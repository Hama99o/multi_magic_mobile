/**
 * THE CALENDAR'S DAY HEADING NAMES THE RIGHT DAY, IN EVERY ZONE (2026-09-25).
 *
 * `on` is a date-only string in the device's own day ("2026-09-22").
 * `headingFor` parses it as LOCAL midnight. Parsed as UTC midnight instead
 * (`new Date(on)`) it is the same day in Paris, and 20:00 the day BEFORE in
 * New York, where the heading would say Monday for Tuesday.
 *
 * Found by `qa/plants.py`: that exact bug passed BOTH runs, because nothing
 * in the western suites looked at a heading. So this test is in
 * `npm run test:west` too, and is the proof that the western run can see a
 * bug Paris cannot.
 */
import { headingFor } from "../calendar";

jest.mock("expo-router", () => require("@/__tests__/screenMocks").expoRouter);
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);

const t = (key: string) => ({ "calendar.today": "Today", "calendar.tomorrow": "Tomorrow" })[key] ?? key;

it("names Tuesday 22 September as a Tuesday", () => {
  const { label } = headingFor("2026-09-22", "2026-09-19", t, "en-GB");
  expect(label).toBe("Tue 22 Sept");
});

it("calls today Today, and the next day Tomorrow, with their own dates", () => {
  expect(headingFor("2026-09-22", "2026-09-22", t, "en-GB").label).toBe("Today · Tue 22 Sept");
  expect(headingFor("2026-09-23", "2026-09-22", t, "en-GB").label).toBe("Tomorrow · Wed 23 Sept");
});
