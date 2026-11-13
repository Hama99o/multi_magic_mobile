/**
 * NOTE REMINDERS — Keep's "remind me", as LOCAL notifications (Hello,
 * 2026-11-13). The reminder lives on the note on the server
 * (data.launch_time + data.repeat_frequency, multi_magic PR #22) so every
 * device and the web see it; each phone schedules its own notification.
 *
 * Limits, by design (KEEP.md): a reminder fires only on a phone that has
 * opened the app since it was set; the server sends no email or push.
 *
 * Pure: the trigger, the sync, the quick choices. The expo-notifications
 * adapter is reminderNotifications.ts.
 */
export type ReminderRepeat = "daily" | "weekly" | "monthly";

export interface NoteReminder {
  at: Date;
  repeat: ReminderRepeat | null;
}

/** expo-notifications trigger inputs (SchedulableTriggerInputTypes values). */
export type ReminderTrigger =
  | { type: "date"; date: Date }
  | { type: "daily"; hour: number; minute: number }
  | { type: "weekly"; weekday: number; hour: number; minute: number }
  | { type: "monthly"; day: number; hour: number; minute: number };

export interface ReminderScheduler {
  /** Identifiers of what is scheduled now. */
  list(): Promise<string[]>;
  cancel(identifier: string): Promise<void>;
  schedule(request: { identifier: string; content: { title: string; body?: string; data: { noteId: number } }; trigger: ReminderTrigger }): Promise<void>;
}

const PREFIX = "note-";
export const reminderId = (noteId: number) => `${PREFIX}${noteId}`;

export function reminderTrigger(at: Date, repeat: ReminderRepeat | null): ReminderTrigger {
  const hour = at.getHours();
  const minute = at.getMinutes();
  switch (repeat) {
    case "daily":
      return { type: "daily", hour, minute };
    case "weekly":
      return { type: "weekly", weekday: at.getDay() + 1, hour, minute }; // expo: 1 = Sunday
    case "monthly":
      return { type: "monthly", day: at.getDate(), hour, minute };
    default:
      return { type: "date", date: at };
  }
}

export async function syncReminders(
  notes: { id: number; title: string; reminder: NoteReminder | null }[],
  scheduler: ReminderScheduler,
  now: Date = new Date(),
  options: { untitled?: string } = {},
): Promise<void> {
  const wanted = notes.filter((n) => n.reminder && (n.reminder.repeat || n.reminder.at.getTime() > now.getTime()));
  // Ours only (note-*): every one goes, stale or about to be rescheduled, so
  // the phone ends up with exactly what the server says.
  for (const id of await scheduler.list()) {
    if (id.startsWith(PREFIX)) await scheduler.cancel(id);
  }
  for (const n of wanted) {
    const r = n.reminder!;
    await scheduler.schedule({
      identifier: reminderId(n.id),
      content: { title: n.title.trim() || options.untitled || "Reminder", data: { noteId: n.id } },
      trigger: reminderTrigger(r.at, r.repeat),
    });
  }
}

/** Keep's quick choices: later today 18:00 (before 17:00), tomorrow 08:00, next Monday 08:00. */
export function quickChoices(now: Date = new Date()): { key: "laterToday" | "tomorrow" | "nextWeek"; at: Date }[] {
  const at = (days: number, hour: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0, 0, 0);
    return d;
  };
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  const out: { key: "laterToday" | "tomorrow" | "nextWeek"; at: Date }[] = [];
  if (now.getHours() < 17) out.push({ key: "laterToday", at: at(0, 18) });
  out.push({ key: "tomorrow", at: at(1, 8) });
  out.push({ key: "nextWeek", at: at(daysToMonday, 8) });
  return out;
}
