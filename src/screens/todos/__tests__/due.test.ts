/**
 * When a task is due, said the way a list says it (SPEC §D): the chip's tone,
 * its words, and the Today / Upcoming / Overdue grouping. Days are local
 * calendar days (`YYYY-MM-DD`), as the server's `due_date` is.
 */
import type { Todo } from "@/api/todos";
import { dueCounts, dueLabel, dueSections, dueTone } from "../due";

const TODAY = "2026-11-16"; // a Monday
const t = (id: number, dueDate: string | null, over: Partial<Todo> = {}): Todo => ({
  id, todoGroupId: 1, title: `T${id}`, notes: null, completed: false, position: id, dueDate, priority: "none",
  overdue: dueDate != null && dueDate < TODAY, remindAt: null, remindSupported: false, createdAt: "", ...over,
});
const words = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key);

describe("dueTone", () => {
  it("is overdue before today, soon from today to 2 days, later after, none without a date", () => {
    expect(dueTone("2026-11-15", false, TODAY)).toBe("overdue");
    expect(dueTone("2026-11-16", false, TODAY)).toBe("soon");
    expect(dueTone("2026-11-18", false, TODAY)).toBe("soon");
    expect(dueTone("2026-11-19", false, TODAY)).toBe("later");
    expect(dueTone(null, false, TODAY)).toBeNull();
  });

  it("a done task is never overdue", () => {
    expect(dueTone("2026-11-01", true, TODAY)).toBe("later");
  });
});

describe("dueLabel", () => {
  it("says Today, Tomorrow and Yesterday in words", () => {
    expect(dueLabel("2026-11-16", TODAY, "en", words)).toBe("todos.due.today");
    expect(dueLabel("2026-11-17", TODAY, "en", words)).toBe("todos.due.tomorrow");
    expect(dueLabel("2026-11-15", TODAY, "en", words)).toBe("todos.due.yesterday");
  });

  it("names the weekday within the week ahead, then the date", () => {
    expect(dueLabel("2026-11-20", TODAY, "en", words)).toBe("Friday");
    expect(dueLabel("2026-11-30", TODAY, "en", words)).toMatch(/30/);
    expect(dueLabel("2026-11-20", TODAY, "fr", words)).toBe("vendredi");
  });

  it("puts the year on a date in another year", () => {
    expect(dueLabel("2027-02-03", TODAY, "en", words)).toMatch(/2027/);
  });
});

describe("dueSections", () => {
  const tasks = [t(1, "2026-11-10"), t(2, TODAY), t(3, "2026-11-17"), t(4, "2026-11-25"), t(5, null), t(6, "2026-11-17"), t(7, "2026-11-14")];

  it("Today: overdue first (oldest first), then today", () => {
    expect(dueSections(tasks, "today", TODAY).map((s) => [s.key, s.tasks.map((x) => x.id)])).toEqual([
      ["overdue", [1, 7]],
      [TODAY, [2]],
    ]);
  });

  it("Upcoming: one section per future day, in date order, nothing undated", () => {
    expect(dueSections(tasks, "upcoming", TODAY).map((s) => [s.key, s.tasks.map((x) => x.id)])).toEqual([
      ["2026-11-17", [3, 6]],
      ["2026-11-25", [4]],
    ]);
  });

  it("Overdue: only what is past", () => {
    expect(dueSections(tasks, "overdue", TODAY).map((s) => s.tasks.map((x) => x.id))).toEqual([[1, 7]]);
  });

  it("leaves out an empty section", () => {
    expect(dueSections([t(5, null)], "today", TODAY)).toEqual([]);
  });
});

describe("dueCounts", () => {
  it("counts today, upcoming and overdue among pending tasks", () => {
    expect(dueCounts([t(1, "2026-11-10"), t(2, TODAY), t(3, "2026-11-17"), t(5, null)], TODAY)).toEqual({ today: 1, upcoming: 1, overdue: 1 });
  });
});
