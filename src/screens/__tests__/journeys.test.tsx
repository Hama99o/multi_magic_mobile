/**
 * WHAT A PERSON DOES, ON ONE CACHE (2026-09-25). See `src/__tests__/journey.tsx`
 * for why this exists: every other screen test isolates the cache, and the
 * first bug that lived between two screens (df9b1f2: calendar → back crashed
 * the assistant) was invisible to all of them.
 *
 * Each journey is the screens in order and what each must show. A render error
 * anywhere throws, so "the next screen appears" is also "nothing crashed on
 * the way". The data is the QA account's captures, served at the HTTP layer.
 */
import MockAdapter from "axios-mock-adapter";
import { act, screen } from "@testing-library/react-native";
import { journey, occurrenceToday, serveApi } from "@/__tests__/journey";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import i18n from "@/i18n";
import Assistant from "../../../app/chat";
import Chats from "../../../app/chats";
import Thread from "../../../app/chat/[id]";
import Notifications from "../../../app/notifications";
import Calendar from "../../../app/calendar";
import Profile from "../../../app/profile";

// jest.mock is hoisted above every import, so these mocks are in place first.

jest.mock("expo-router", () => require("@/__tests__/screenMocks").expoRouter);
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);
jest.mock("expo-haptics", () => require("@/__tests__/screenMocks").haptics);
jest.mock("expo-linking", () => require("@/__tests__/screenMocks").linking);
jest.mock("expo-image-picker", () => require("@/__tests__/screenMocks").imagePicker);
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);


let mock: MockAdapter;
let j: ReturnType<typeof journey>;
beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  j = journey();
});
afterEach(() => {
  j.end();
  mock.restore();
});

it("calendar, then back to the assistant: the suggestions read what the calendar stored", async () => {
  // The df9b1f2 crash, as it happened on the device. The conversation is
  // empty so the assistant builds its suggestions, one of them from the
  // calendar entry the calendar screen put in the shared cache.
  serveApi(mock, { mode: "empty", overrides: [[/\/calendar_app\/events\/upcoming/, { occurrences: [occurrenceToday("Dentist")] }]] });
  j.visit(<Calendar />);
  await screen.findByText("Dentist");
  j.leave();
  // The harness's own check: what the calendar stored survives LEAVING it,
  // across a real tick. With the test default gcTime of 0 it is collected on
  // that tick. (Measured 2026-09-25: this journey still caught the bug at
  // gcTime 0, because `visit` mounts the next screen in the same tick. A
  // journey that waits between screens would not, which is what this guards.)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(j.client.getQueryData(["calendar", "upcoming", 7])).toBeDefined();
  j.visit(<Assistant />);
  await screen.findByTestId("chat-empty", {}, { timeout: 3000 });
  expect(screen.queryByText(/Dentist/)).not.toBeNull();
});

it("chats, a thread, then back to the chats", async () => {
  serveApi(mock);
  j.visit(<Chats />);
  await screen.findByTestId("chats-list");
  const rows = (await screen.findAllByTestId(/^chat-row-/)).length;
  j.visit(<Thread />);
  await screen.findByTestId("thread-list");
  j.visit(<Chats />);
  // Back on the list, from the cache first: the same rows, nothing lost to
  // whatever the thread read or wrote.
  expect((await screen.findAllByTestId(/^chat-row-/)).length).toBe(rows);
  expect(screen.queryByTestId("chats-load-failed")).toBeNull();
});

it("the assistant, then what is new, then the calendar, then the assistant again", async () => {
  // The morning check: open the app, look at notifications and the day,
  // come back to ask something.
  serveApi(mock);
  j.visit(<Assistant />);
  await screen.findByTestId("composer-input");
  j.visit(<Notifications />);
  await screen.findByTestId("notifications-empty"); // the QA account has none
  j.visit(<Calendar />);
  await screen.findByTestId("calendar-list");
  j.visit(<Assistant />);
  await screen.findByTestId("composer-input");
  expect(screen.queryByTestId("chat-load-failed")).toBeNull();
});

it("the profile, then the assistant: a profile read does not disturb the conversation", async () => {
  serveApi(mock);
  j.visit(<Profile />);
  await screen.findByTestId("profile-firstname");
  j.visit(<Assistant />);
  await screen.findByTestId("composer-input");
  expect(screen.queryByTestId("chat-load-failed")).toBeNull();
});
