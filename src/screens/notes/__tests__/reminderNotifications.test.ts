/**
 * The expo-notifications side of note reminders, with the module mocked: what
 * is scheduled (identifier, content, trigger, the Android channel), the
 * permission ask, and the sync from the server's notes with a reminder.
 */
jest.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => [{ identifier: "note-9" }, { identifier: "other" }]),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => "id"),
  getPermissionsAsync: jest.fn(async () => ({ status: "undetermined", granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted", granted: true })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock("@/api/notes", () => ({
  notesApi: {
    list: jest.fn(async () => ({
      notes: [{ id: 1, title: "Call", reminder: { at: new Date(Date.now() + 86_400_000), repeat: null } }],
      hasMore: false, unreadable: 0, total: 1,
    })),
  },
}));

/* eslint-disable import/first */
import { Platform } from "react-native";
import { notesApi } from "@/api/notes";
import { ensureReminderPermission, expoScheduler, resyncReminders } from "../reminderNotifications";

const mockN = jest.requireMock("expo-notifications") as Record<string, jest.Mock>;

beforeEach(() => jest.clearAllMocks());

it("schedules with the note's identifier, content and trigger, on the reminders channel on Android", async () => {
  Platform.OS = "android";
  const date = new Date(2026, 10, 20, 9, 0);
  await expoScheduler.schedule({ identifier: "note-1", content: { title: "Call", data: { noteId: 1 } }, trigger: { type: "date", date } });
  expect(mockN.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: "note-1",
    content: { title: "Call", data: { noteId: 1 } },
    trigger: { type: "date", date, channelId: "reminders" },
  });
});

it("lists and cancels by identifier", async () => {
  expect(await expoScheduler.list()).toEqual(["note-9", "other"]);
  await expoScheduler.cancel("note-9");
  expect(mockN.cancelScheduledNotificationAsync).toHaveBeenCalledWith("note-9");
});

it("asks for permission only when it was never answered", async () => {
  expect(await ensureReminderPermission()).toBe(true);
  expect(mockN.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  mockN.getPermissionsAsync.mockResolvedValueOnce({ status: "denied", granted: false });
  expect(await ensureReminderPermission()).toBe(false);
  expect(mockN.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

it("resync reads the server's notes with a reminder and schedules them, replacing ours", async () => {
  await resyncReminders();
  expect(notesApi.list).toHaveBeenCalledWith(1, undefined, undefined, "reminders");
  expect(mockN.cancelScheduledNotificationAsync).toHaveBeenCalledWith("note-9");
  expect(mockN.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith("other");
  expect(mockN.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ identifier: "note-1" }));
});

it("a failing server leaves what is scheduled alone (no wipe on a bad network)", async () => {
  (notesApi.list as jest.Mock).mockRejectedValueOnce(new Error("Network Error"));
  await resyncReminders();
  expect(mockN.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});
