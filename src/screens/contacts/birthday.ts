/**
 * The next birthday from a stored `birth_date`, in the phone's calendar days.
 * Feb 29 → Feb 28 in a common year, the server's own rule
 * (`upcoming_birthdays_service.rb:7`), so the detail and the "soon" strip
 * never disagree about the day.
 */
import { addDays } from "@/screens/calendar/dates";

function onYear(month: number, day: number, year: number): string {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const d = month === 2 && day === 29 && !leap ? 28 : day;
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function birthdayInfo(birthDate: string | null, today: string): { inDays: number; turning: number; nextDate: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? "");
  if (!m) return null;
  const [born, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const year = Number(today.slice(0, 4));
  let next = onYear(month, day, year);
  if (next < today) next = onYear(month, day, year + 1);
  // Counted in calendar days, not milliseconds: a DST change in between makes
  // a day 23 or 25 hours long.
  let inDays = 0;
  while (addDays(today, inDays) !== next && inDays < 367) inDays += 1;
  return { inDays, turning: Number(next.slice(0, 4)) - born, nextDate: next };
}
