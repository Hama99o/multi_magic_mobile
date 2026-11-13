/**
 * Note reminders (Hello, 2026-11-13: LOCAL notifications; the reminder lives
 * on the note on the server, data.launch_time + repeat_frequency, multi_magic
 * PR #22). Pure: the trigger for expo-notifications, the sync of what the
 * phone has scheduled with what the server says, Keep's quick choices.
 */
import { quickChoices, reminderTrigger, syncReminders, type ReminderScheduler } from "../reminders";

describe("reminderTrigger (expo-notifications trigger inputs)", () => {
  const at = new Date(2026, 10, 20, 9, 30); // Fri 20 Nov 2026, 09:30 local

  it("once: a date trigger", () => {
    expect(reminderTrigger(at, null)).toEqual({ type: "date", date: at });
  });

  it("daily, weekly (Sunday = 1) and monthly keep the local hour and minute", () => {
    expect(reminderTrigger(at, "daily")).toEqual({ type: "daily", hour: 9, minute: 30 });
    expect(reminderTrigger(at, "weekly")).toEqual({ type: "weekly", weekday: 6, hour: 9, minute: 30 });
    expect(reminderTrigger(at, "monthly")).toEqual({ type: "monthly", day: 20, hour: 9, minute: 30 });
  });
});

describe("syncReminders", () => {
  function fakeScheduler(existing: string[] = []) {
    const scheduled = new Map(existing.map((id) => [id, {}]));
    const log: string[] = [];
    const s: ReminderScheduler = {
      list: async () => [...scheduled.keys()],
      cancel: async (id) => {
        scheduled.delete(id);
        log.push(`cancel ${id}`);
      },
      schedule: async (req) => {
        scheduled.set(req.identifier, req);
        log.push(`schedule ${req.identifier}`);
      },
    };
    return { s, scheduled, log };
  }
  const now = new Date(2026, 10, 13, 12, 0);
  const n = (id: number, at: string | null, repeat: "daily" | "weekly" | "monthly" | null = null, title = `Seed ${id}`) => ({
    id, title, reminder: at ? { at: new Date(at), repeat } : null,
  });

  it("schedules every upcoming reminder, one per note, opening that note", async () => {
    const { s, scheduled } = fakeScheduler();
    await syncReminders([n(1, "2026-11-20T09:00:00"), n(2, null)], s, now);
    expect([...scheduled.keys()]).toEqual(["note-1"]);
    expect(scheduled.get("note-1")).toMatchObject({ content: { title: "Seed 1", data: { noteId: 1 } } });
  });

  it("a one-off reminder already past is not scheduled; a repeating one is", async () => {
    const { s, scheduled } = fakeScheduler();
    await syncReminders([n(1, "2026-11-01T09:00:00"), n(2, "2026-11-01T09:00:00", "weekly")], s, now);
    expect([...scheduled.keys()]).toEqual(["note-2"]);
  });

  it("cancels reminders of notes that no longer have one (removed, archived, deleted)", async () => {
    const { s, scheduled } = fakeScheduler(["note-9", "note-1", "not-a-note"]);
    await syncReminders([n(1, "2026-11-20T09:00:00")], s, now);
    expect([...scheduled.keys()].sort()).toEqual(["not-a-note", "note-1"]);
  });

  it("an untitled note's notification still says what it is", async () => {
    const { s, scheduled } = fakeScheduler();
    await syncReminders([n(1, "2026-11-20T09:00:00", null, "")], s, now, { untitled: "Reminder" });
    expect(scheduled.get("note-1")).toMatchObject({ content: { title: "Reminder" } });
  });
});

describe("quickChoices (Keep: later today, tomorrow, next week)", () => {
  it("in the morning: later today 18:00, tomorrow 08:00, next Monday 08:00", () => {
    const choices = quickChoices(new Date(2026, 10, 13, 10, 0)); // Fri 13 Nov
    expect(choices.map((c) => [c.key, c.at.getDate(), c.at.getHours()])).toEqual([
      ["laterToday", 13, 18],
      ["tomorrow", 14, 8],
      ["nextWeek", 16, 8],
    ]);
  });

  it("in the evening, 'later today' is gone", () => {
    expect(quickChoices(new Date(2026, 10, 13, 19, 0)).map((c) => c.key)).toEqual(["tomorrow", "nextWeek"]);
  });
});
