/**
 * Note reminders on THIS phone, through expo-notifications (local
 * notifications; Hello, 2026-11-13). reminders.ts decides what to schedule;
 * this talks to the OS.
 *
 * - One Android channel, "reminders", high importance.
 * - resyncReminders(): on app start, after sign-in, and after any change to a
 *   reminder, an archive or a delete: reads the server's notes that have a
 *   reminder and makes this phone's schedule match. A failed read changes
 *   nothing (a bad network must not wipe reminders).
 * - Tapping a notification opens its note (onReminderTap).
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { notesApi, type Note } from "@/api/notes";
import { syncReminders, type ReminderScheduler } from "./reminders";

const CHANNEL = "reminders";

export const expoScheduler: ReminderScheduler = {
  list: async () => (await Notifications.getAllScheduledNotificationsAsync()).map((r) => r.identifier),
  cancel: async (identifier) => {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  },
  schedule: async ({ identifier, content, trigger }) => {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content,
      trigger: { ...trigger, ...(Platform.OS === "android" ? { channelId: CHANNEL } : {}) } as Notifications.NotificationTriggerInput,
    });
  },
};

let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === "android") {
    void Notifications.setNotificationChannelAsync(CHANNEL, { name: "Reminders", importance: Notifications.AndroidImportance.HIGH }).catch(() => undefined);
  }
}

/** True when the phone may show reminders; asks once, never again after a "no". */
export async function ensureReminderPermission(): Promise<boolean> {
  configure();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.status !== "undetermined") return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Make this phone's schedule match the server's reminders. */
export async function resyncReminders(options: { untitled?: string } = {}): Promise<void> {
  configure();
  let notes: Note[] = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const res = await notesApi.list(page, undefined, undefined, "reminders");
      notes = notes.concat(res.notes);
      if (!res.hasMore) break;
    }
  } catch {
    return;
  }
  await syncReminders(notes, expoScheduler, new Date(), options);
}

/** Calls `open(noteId)` when a reminder is tapped, including the one that launched the app. */
export function onReminderTap(open: (noteId: number) => void): () => void {
  const idOf = (r: Notifications.NotificationResponse | null) => {
    const id = Number((r?.notification.request.content.data as { noteId?: unknown } | undefined)?.noteId);
    return Number.isFinite(id) && id > 0 ? id : null;
  };
  void Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      const id = idOf(r);
      if (id) open(id);
    })
    .catch(() => undefined);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const id = idOf(r);
    if (id) open(id);
  });
  return () => sub.remove();
}
