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
import { fixture, journey, occurrenceToday, serveApi } from "@/__tests__/journey";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import i18n from "@/i18n";
import Assistant from "../../../app/chat";
import Chats from "../../../app/chats";
import Thread, { lastKnownMessages, SEED_MAX_AGE_MS } from "../../../app/chat/[id]";
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

/**
 * THE THREAD OPENS WITH WHAT THE APP ALREADY KNOWS (2026-09-25). The chats list
 * holds each conversation's last message; the thread used to open onto a
 * skeleton for about a second anyway (seen frame by frame on qa_phone4). It
 * is seeded now (`lastKnownMessages`, app/chat/[id].tsx). The claim is the
 * BEHAVIOUR, not the milliseconds: an emulator exaggerates the gap it closes.
 */
describe("a thread opened from the chats list", () => {
  const LAST = fixture("conversations_page1").conversations[0].last_message;
  const OLDER = { ...LAST, id: LAST.id - 1, body: "An older message", created_at: "2026-09-24T10:00:00.000Z" };

  /** The thread's own read, held until the test releases it. */
  function holdThread(): () => void {
    let release: () => void = () => undefined;
    const held = new Promise<[number, unknown]>((resolve) => {
      release = () => resolve([200, { messages: [LAST, OLDER], meta: fixture("notifications_page1").meta }]);
    });
    // The SAME regex text as serveApi's, so this REPLACES its handler. A
    // different one would lose to it (the first registered wins), the thread
    // would get the unheld fixture at once, and "before the server answers"
    // would never happen: exactly what this test's first draft did.
    mock.onGet(/\/conversations\/\d+\/messages/).reply(() => held);
    return () => release();
  }

  it("shows the list's last message at once, no skeleton, and keeps it when the read lands", async () => {
    serveApi(mock);
    j.visit(<Chats />);
    await screen.findByTestId("chats-list");
    const release = holdThread();
    j.visit(<Thread />);
    // BEFORE the server answers: the last message, and no skeleton. And the
    // server really has not answered: the older message is not there yet.
    expect(await screen.findByText(LAST.body)).toBeTruthy();
    expect(screen.queryByTestId("bubbles-skeleton")).toBeNull();
    expect(screen.queryByText("An older message")).toBeNull();
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 20));
    });
    // AFTER: the older message joins it, and the seeded one is there once.
    expect(await screen.findByText("An older message")).toBeTruthy();
    expect(screen.getAllByText(LAST.body)).toHaveLength(1);
  });

  it("still draws the unread divider, from the server's page and not from the seed", async () => {
    const router = jest.requireMock("expo-router");
    const params = router.useLocalSearchParams;
    router.useLocalSearchParams = () => ({ ...params(), unread: "1" });
    try {
      serveApi(mock);
      j.visit(<Chats />);
      await screen.findByTestId("chats-list");
      const release = holdThread();
      j.visit(<Thread />);
      await screen.findByText(LAST.body);
      expect(screen.queryByTestId("unread-divider")).toBeNull(); // not latched on the seed
      await act(async () => {
        release();
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(await screen.findByTestId("unread-divider")).toBeTruthy();
    } finally {
      router.useLocalSearchParams = params;
    }
  });
});

describe("lastKnownMessages", () => {
  it("seeds nothing from a stale list, or for a conversation it does not hold", async () => {
    serveApi(mock);
    j.visit(<Chats />);
    await screen.findByTestId("chats-list");
    const updatedAt = j.client.getQueryState(["conversations", "list"])!.dataUpdatedAt;
    expect(lastKnownMessages(j.client, 266, updatedAt + 1000)).toHaveLength(1);
    expect(lastKnownMessages(j.client, 266, updatedAt + SEED_MAX_AGE_MS + 1)).toBeUndefined();
    expect(lastKnownMessages(j.client, 999999, updatedAt + 1000)).toBeUndefined();
  });
});
