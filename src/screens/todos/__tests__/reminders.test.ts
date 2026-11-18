import type { Todo } from "@/api/todos";
import type { ReminderScheduler } from "@/screens/notes/reminders";
import { syncTodoReminders, todoFromNotification } from "../reminders";

const NOW = new Date("2026-11-16T10:00:00Z");
const t = (id: number, remindAt: string | null, completed = false): Todo => ({
  id, todoGroupId: 4, title: `T${id}`, notes: null, completed, position: id, dueDate: null, priority: "none", overdue: false, remindAt, remindSupported: true, createdAt: "",
});

function fakeScheduler(existing: string[]) {
  const scheduled: Parameters<ReminderScheduler["schedule"]>[0][] = [];
  const cancelled: string[] = [];
  const s: ReminderScheduler = {
    list: async () => existing,
    cancel: async (id) => void cancelled.push(id),
    schedule: async (r) => void scheduled.push(r),
  };
  return { s, scheduled, cancelled };
}

it("schedules future reminders of open tasks only, and replaces all of ours", async () => {
  const { s, scheduled, cancelled } = fakeScheduler(["todo-1", "note-3", "todo-99"]);
  await syncTodoReminders([t(1, "2026-11-17T09:00:00Z"), t(2, "2026-11-15T09:00:00Z"), t(3, "2026-11-18T09:00:00Z", true), t(4, null)], s, NOW);
  expect(cancelled).toEqual(["todo-1", "todo-99"]);
  expect(scheduled).toEqual([
    { identifier: "todo-1", content: { title: "T1", body: undefined, data: { todoId: 1, groupId: 4 } }, trigger: { type: "date", date: new Date("2026-11-17T09:00:00Z") } },
  ]);
});

it("never touches a note's reminder", async () => {
  const { s, cancelled } = fakeScheduler(["note-3"]);
  await syncTodoReminders([], s, NOW);
  expect(cancelled).toEqual([]);
});

it("reads a tapped notification as a task, or not", () => {
  expect(todoFromNotification({ todoId: 7, groupId: 2 })).toEqual({ todoId: 7, groupId: 2 });
  expect(todoFromNotification({ noteId: 7 })).toBeNull();
  expect(todoFromNotification(undefined)).toBeNull();
});
