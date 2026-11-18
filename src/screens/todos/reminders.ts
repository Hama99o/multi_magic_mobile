/**
 * TASK REMINDERS — local notifications at a task's `remind_at` (SPEC B3,
 * multi_magic PR #27), the way note reminders work (`notes/reminders.ts`):
 * the time lives on the server, so the web and every phone agree, and each
 * phone schedules its own notification. Ours are `todo-<id>`; a sync cancels
 * every one of ours and schedules exactly what the server says, so a
 * reminder changed on the laptop moves here at the next sync.
 *
 * Done tasks and past times are not scheduled. Pure: the expo adapter is
 * `notes/reminderNotifications.ts`'s `expoScheduler`.
 */
import type { Todo } from "@/api/todos";
import type { ReminderScheduler } from "@/screens/notes/reminders";

const PREFIX = "todo-";
export const todoReminderId = (todoId: number) => `${PREFIX}${todoId}`;

export async function syncTodoReminders(tasks: Todo[], scheduler: ReminderScheduler, now: Date = new Date(), body?: (t: Todo) => string | undefined): Promise<void> {
  const wanted = tasks.filter((t) => !t.completed && t.remindAt && new Date(t.remindAt).getTime() > now.getTime());
  for (const id of await scheduler.list()) {
    if (id.startsWith(PREFIX)) await scheduler.cancel(id);
  }
  for (const t of wanted) {
    await scheduler.schedule({
      identifier: todoReminderId(t.id),
      content: { title: t.title, body: body?.(t), data: { todoId: t.id, groupId: t.todoGroupId } },
      trigger: { type: "date", date: new Date(t.remindAt!) },
    });
  }
}

/** The task a tapped notification is about, or null when it is not a task's. */
export function todoFromNotification(data: unknown): { todoId: number; groupId: number } | null {
  const d = (data ?? {}) as { todoId?: unknown; groupId?: unknown };
  const todoId = Number(d.todoId);
  const groupId = Number(d.groupId);
  return Number.isFinite(todoId) && todoId > 0 && Number.isFinite(groupId) && groupId > 0 ? { todoId, groupId } : null;
}
