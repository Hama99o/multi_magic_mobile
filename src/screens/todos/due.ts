/**
 * When a task is due, in a list's words (`docs/design/todos/SPEC.md` §D):
 * the chip's tone, its label, and the Today / Upcoming / Overdue sections.
 *
 * Days are local calendar days, `YYYY-MM-DD`, the same as the server's
 * `due_date` and its `Date.current`. "Soon" is today to two days ahead, as on
 * the web (`GroupDrawer.tsx` `dueMeta`).
 */
import type { Todo } from "@/api/todos";
import { addDays, parseDay } from "@/screens/calendar/dates";

export type DueTone = "overdue" | "soon" | "later";
export type DueView = "today" | "upcoming" | "overdue";
export const DUE_VIEWS: readonly DueView[] = ["today", "upcoming", "overdue"];

export function dueTone(dueDate: string | null, completed: boolean, today: string): DueTone | null {
  if (!dueDate) return null;
  if (completed) return "later";
  if (dueDate < today) return "overdue";
  return dueDate <= addDays(today, 2) ? "soon" : "later";
}

type T = (key: string, opts?: Record<string, unknown>) => string;

export function dueLabel(dueDate: string, today: string, language: string, t: T): string {
  if (dueDate === today) return t("todos.due.today");
  if (dueDate === addDays(today, 1)) return t("todos.due.tomorrow");
  if (dueDate === addDays(today, -1)) return t("todos.due.yesterday");
  const day = parseDay(dueDate);
  if (dueDate > today && dueDate <= addDays(today, 6)) return day.toLocaleDateString(language, { weekday: "long" });
  const sameYear = dueDate.slice(0, 4) === today.slice(0, 4);
  return day.toLocaleDateString(language, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

export interface DueSection {
  /** "overdue", or the day (`YYYY-MM-DD`) the section holds. */
  key: string;
  tasks: Todo[];
}

const byDate = (a: Todo, b: Todo) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.id - b.id;

/** The sections a view shows, pending tasks only, never an empty one. */
export function dueSections(tasks: Todo[], view: DueView, today: string): DueSection[] {
  const open = tasks.filter((x) => !x.completed && x.dueDate);
  const overdue = open.filter((x) => x.dueDate! < today).sort(byDate);
  const sections: DueSection[] = [];
  if (view === "overdue" || view === "today") sections.push({ key: "overdue", tasks: overdue });
  if (view === "today") sections.push({ key: today, tasks: open.filter((x) => x.dueDate === today).sort(byDate) });
  if (view === "upcoming") {
    const days = new Map<string, Todo[]>();
    for (const x of open.filter((y) => y.dueDate! > today).sort(byDate)) days.set(x.dueDate!, [...(days.get(x.dueDate!) ?? []), x]);
    for (const [key, list] of days) sections.push({ key, tasks: list });
  }
  return sections.filter((s) => s.tasks.length > 0);
}

export function dueCounts(tasks: Todo[], today: string): Record<DueView, number> {
  const open = tasks.filter((x) => !x.completed && x.dueDate);
  return {
    today: open.filter((x) => x.dueDate === today).length,
    upcoming: open.filter((x) => x.dueDate! > today).length,
    overdue: open.filter((x) => x.dueDate! < today).length,
  };
}
