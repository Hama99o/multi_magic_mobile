/**
 * "just now", "12 min ago", "Yesterday", "3 Sep".
 *
 * Cleo puts relative time ABOVE the title in its history list, and it is right
 * to: what distinguishes two chats called "Money" is when you last talked in
 * one. The list is ordered by `updated_at`, so this is the field that explains
 * the order.
 *
 * Absolute dates past a week: "37 days ago" is arithmetic nobody asked for.
 */
import { t } from "@/i18n";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const delta = now.getTime() - then.getTime();
  // A clock that is slightly behind the server's should read "just now", not
  // "in 3 seconds".
  if (delta < MINUTE) return t("common.justNow");
  if (delta < HOUR) return t("common.minutesAgo", { count: Math.floor(delta / MINUTE) });
  if (delta < DAY) return t("common.hoursAgo", { count: Math.floor(delta / HOUR) });

  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysBack = Math.floor((midnight.getTime() - then.getTime()) / DAY);
  if (daysBack < 1) return t("common.yesterday");
  if (daysBack < 6) return t("common.daysAgo", { count: daysBack + 1 });

  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Today / Earlier — Notion's grouping, reduced to the two that carry meaning. */
export function isToday(iso: string, now: Date = new Date()): boolean {
  const then = new Date(iso);
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}
