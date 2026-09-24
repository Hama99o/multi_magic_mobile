/**
 * The people thread's day dividers. "Today" and "Yesterday" were English
 * literals until 2026-09-24. The French render sweep never drew them, because
 * its fixture message is not from today. So they are pinned here, in both
 * languages, with a fixed "now".
 */
import i18n from "@/i18n";
import { dayLabel } from "../DayDivider";

const NOW = new Date(2026, 8, 24, 15, 0);

afterEach(async () => {
  await i18n.changeLanguage("en");
});

it.each([
  ["en", "Today", "Yesterday"],
  ["fr", "Aujourd’hui", "Hier"],
])("reads today and yesterday in %s", async (language, today, yesterday) => {
  await i18n.changeLanguage(language);
  expect(dayLabel(new Date(2026, 8, 24, 9, 0).toISOString(), NOW)).toBe(today);
  expect(dayLabel(new Date(2026, 8, 23, 21, 0).toISOString(), NOW)).toBe(yesterday);
});
