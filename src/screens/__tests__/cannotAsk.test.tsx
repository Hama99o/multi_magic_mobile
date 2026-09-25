/**
 * WHAT EACH SCREEN SAYS WHEN IT COULD NOT ASK (2026-09-25).
 *
 * Every screen that loads something is put in four states and must say a
 * DIFFERENT thing in each:
 *
 *   offline   no response at all            → "Could not reach MultiMagic."
 *   5xx       Rails' own error page          → the screen's "Could not load …"
 *   429       too many requests              → the rate-limit sentence
 *   empty     a real answer with nothing     → the screen's empty sentence
 *
 * and, the point of the file, **no failure state may render the empty
 * sentence.** "No events today" with no network is a screen stating a fact it
 * never got.
 *
 * ── WHY IT FAILS REQUESTS, NOT THE REACHABILITY STORE ─────────────────────
 * `reachability.store.ts` starts TRUE, and only the assistant's composer reads
 * it; no screen's load reads it. So a test that set it false would change
 * nothing on these screens, and one that asserted "no offline notice" on a
 * fresh mount would pass on a screen with no offline handling at all. What a
 * screen actually meets offline is its own request failing with no response,
 * so that is what this does: at the HTTP layer (`axios-mock-adapter` on the
 * real `http`), through the real API functions, parsers, `useConversation`
 * and `failureMessage`. Every request fails the same way, because offline is
 * not selective.
 *
 * The empty bodies are the CAPTURED fixtures where the QA account really is
 * empty (notifications, calendar), and a captured body with its list emptied
 * where it is not.
 *
 * What it cannot see: a screen that already had data and then lost the
 * network (the refetch case), and anything a pixel would show.
 */
import fs from "fs";
import path from "path";
import MockAdapter from "axios-mock-adapter";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { testQueryClient } from "@/__tests__/queryClient";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { __resetReachability } from "@/stores/reachability.store";
import i18n, { t } from "@/i18n";
import Assistant from "../../../app/chat";
import Chats from "../../../app/chats";
import Thread from "../../../app/chat/[id]";
import Notifications from "../../../app/notifications";
import Calendar from "../../../app/calendar";
import Profile from "../../../app/profile";
import AiKeys from "../../../app/ai-keys";

// jest.mock is hoisted above every import, so these mocks are in place first.

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: "266", name: "Qa MOBILE", isGroup: "0", unread: "0" }),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock("@/lib/cable", () => ({
  subscribeToChannel: jest.fn(() => jest.fn()),
  performOnChannel: jest.fn(() => true),
  resetCable: jest.fn(),
}));


const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../api/__tests__/fixtures", `${name}.json`), "utf8")).body;

/** pagy's block from a list the QA account really has empty. */
const EMPTY_META = fixture("notifications_page1").meta;

/** Every request answered from a capture, for the EMPTY state; anything not
 *  listed is a 404, which no screen here reads as empty. */
function serveEmpty(mock: MockAdapter, overrides: [RegExp, unknown][]) {
  mock.onGet(/\/ai\/conversation$/).reply(200, fixture("ai_conversation"));
  mock.onGet(/\/ai\/sessions\/\d+\/documents/).reply(200, { documents: [] });
  mock.onGet(/\/ai\/sessions$/).reply(200, fixture("ai_sessions"));
  mock.onGet(/\/conversations\/\d+\/messages/).reply(200, { messages: [], meta: EMPTY_META });
  mock.onGet(/\/conversations\/unread_messages_count/).reply(200, fixture("conversations_unread"));
  mock.onGet(/\/conversations(\?|$)/).reply(200, { conversations: [], meta: EMPTY_META });
  mock.onGet(/\/notifications\/unread_count/).reply(200, fixture("notifications_unread"));
  mock.onGet(/\/notifications(\?|$)/).reply(200, fixture("notifications_page1"));
  mock.onGet(/\/calendar_app\/events\/upcoming/).reply(200, fixture("calendar_upcoming_7"));
  mock.onGet(/\/me\/summary/).reply(200, { counts: {}, stocked: [] });
  mock.onGet(/\/ai_keys/).reply(200, { ...fixture("ai_keys"), ai_keys: [], borrowed: [] });
  mock.onGet(/\/users\/connected_user/).reply(200, fixture("connected_user"));
  // LAST: the adapter REPLACES a handler whose regex has the same text, so
  // an override registered first was silently overwritten by the default.
  for (const [url, body] of overrides) mock.onGet(url).reply(200, body);
  mock.onAny().reply(404, { error: "Not found" });
}

/** The three ways a screen can fail to ask. Rails' error page is its real
 *  body (`PublicExceptions`), which is what made "Internal Server Error" a
 *  sentence on screen until `apiErrorMessage` learned to ignore it. */
const FAILURES: { state: string; fail: (mock: MockAdapter) => void; says: () => string | null }[] = [
  { state: "offline", fail: (m) => void m.onAny().networkError(), says: () => t("failure.unreachable") },
  {
    state: "a 5xx",
    fail: (m) => void m.onAny().reply(500, { status: 500, error: "Internal Server Error" }),
    says: () => null, // the screen's own sentence, below
  },
  { state: "a 429", fail: (m) => void m.onAny().reply(429, {}), says: () => t("failure.rateLimited") },
];

/**
 * One WRITTEN row per screen the router mounts that loads something. The
 * other seven (`index`, `account`, `privacy`, `sign-in`, `sign-up`,
 * `forgot-password`, `two-factor`, `change-password`, `delete-account`) load
 * nothing on mount: their failures are to a submit, and their own tests own
 * those sentences.
 */
const SCREENS: {
  name: string;
  element: () => ReactElement;
  failedId: string;
  loadFailed: () => string;
  /** How the empty state is found, and null where there is none. */
  empty: { id?: string; text?: () => string } | null;
}[] = [
  { name: "assistant", element: () => <Assistant />, failedId: "chat-load-failed", loadFailed: () => t("chat.loadFailed"), empty: { id: "chat-empty" } },
  { name: "chats", element: () => <Chats />, failedId: "chats-load-failed", loadFailed: () => t("chats.loadFailed"), empty: { id: "chats-empty" } },
  { name: "thread", element: () => <Thread />, failedId: "thread-load-failed", loadFailed: () => t("thread.loadFailed"), empty: { text: () => t("thread.noMessages") } },
  { name: "notifications", element: () => <Notifications />, failedId: "notifications-load-failed", loadFailed: () => t("notifications.loadFailed"), empty: { id: "notifications-empty" } },
  { name: "calendar", element: () => <Calendar />, failedId: "calendar-load-failed", loadFailed: () => t("calendar.loadFailed"), empty: { id: "calendar-nothing-today" } },
  { name: "ai-keys", element: () => <AiKeys />, failedId: "ai-keys-load-failed", loadFailed: () => t("aiKeys.loadFailed"), empty: { id: "ai-keys-empty" } },
  // A profile has no empty state: an account always has one.
  { name: "profile", element: () => <Profile />, failedId: "profile-load-failed", loadFailed: () => t("profile.loadFailed"), empty: null },
];

let mock: MockAdapter;
beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  mock.restore();
  __resetReachability();
});

function renderScreen(element: ReactElement, client = testQueryClient()) {
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

function emptyShown(empty: (typeof SCREENS)[number]["empty"]): boolean {
  if (!empty) return false;
  if (empty.id) return screen.queryByTestId(empty.id) !== null;
  return screen.queryByText(empty.text!()) !== null;
}

describe.each(SCREENS)("$name", ({ element, failedId, loadFailed, empty }) => {
  it.each(FAILURES)("says why when it could not ask: $state", async ({ fail, says }) => {
    fail(mock);
    renderScreen(element());
    const failed = await screen.findByTestId(failedId, {}, { timeout: 3000 });
    const expected = says() ?? loadFailed();
    expect(screen.getByText(expected)).toBeTruthy();
    // Rails' phrase must never be what the screen says.
    expect(screen.queryByText("Internal Server Error")).toBeNull();
    // And never the empty state, which would claim an answer nobody got.
    expect(emptyShown(empty)).toBe(false);
    expect(failed).toBeTruthy();
  });

  if (empty) {
    it("says it is empty when the answer was empty, and nothing about failing", async () => {
      serveEmpty(mock, []);
      renderScreen(element());
      await waitFor(() => expect(emptyShown(empty)).toBe(true), { timeout: 3000 });
      expect(screen.queryByTestId(failedId)).toBeNull();
    });
  }
});

it("the four states are four different sentences on every screen", () => {
  for (const s of SCREENS) {
    const sentences = [t("failure.unreachable"), s.loadFailed(), t("failure.rateLimited")];
    expect(new Set(sentences).size).toBe(3);
  }
});

/**
 * HAD CONTENT, THEN THE REFRESH FAILED. A different question from the one
 * above: the screen already showed a real answer. What every reference that
 * shows this case does (Starlink, Docusign, Perplexity; states/SPEC.md) is
 * keep the content and mark it. The calendar used to CLEAR it, throwing away
 * an agenda that was right a minute ago; it keeps it now, under the error
 * line and its "updated" line.
 *
 * Notifications is not here: the QA account has none to capture, and a
 * hand-written notification is what the contract fixtures replaced.
 */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const REFRESHES: { name: string; element: () => ReactElement; failedId: string; kept: () => boolean }[] = [
  {
    name: "calendar",
    element: () => <Calendar />,
    failedId: "calendar-load-failed",
    kept: () => screen.queryByText("Dentist") !== null,
  },
  {
    name: "chats",
    element: () => <Chats />,
    failedId: "chats-load-failed",
    kept: () => screen.queryAllByTestId(/^chat-row-/).length > 0,
  },
  {
    name: "profile",
    element: () => <Profile />,
    failedId: "profile-load-failed",
    kept: () => screen.queryByTestId("profile-firstname") !== null,
  },
];

describe.each(REFRESHES)("$name, when a refresh fails after a real answer", ({ element, failedId, kept }) => {
  it("keeps what it had, and says it could not refresh", async () => {
    const on = todayIso();
    serveEmpty(mock, [
      [
        /\/calendar_app\/events\/upcoming/,
        {
          occurrences: [
            {
              id: `7:${on}`, on, starts_at: `${on}T09:00:00Z`, ends_at: `${on}T09:30:00Z`, all_day: false,
              event: { id: 7, title: "Dentist", description: null, location: null, kind: "appointment", all_day: false, recurrence: null, color: null },
            },
          ],
        },
      ],
      [/\/conversations(\?|$)/, fixture("conversations_page1")],
    ]);
    const client = testQueryClient();
    renderScreen(element(), client);
    await waitFor(() => expect(kept()).toBe(true), { timeout: 3000 });

    mock.reset();
    mock.onAny().networkError();
    await act(async () => {
      await client.refetchQueries();
    });

    expect(await screen.findByTestId(failedId)).toBeTruthy();
    expect(screen.getByText(t("failure.unreachable"))).toBeTruthy();
    expect(kept()).toBe(true);
    // And the calendar's "Nothing today" never stands beside its error.
    expect(screen.queryByTestId("calendar-nothing-today")).toBeNull();
  });
});

/**
 * ONE CACHE, TWO SCREENS (2026-09-25). df9b1f2 made the calendar screen store
 * a PAGE (`{ occurrences, unreadable }`) under `["calendar","upcoming",7]`,
 * the key the assistant's starter prompts read as a bare ARRAY. Every test
 * gave each screen its own client, so nothing here could see it. On a
 * device, opening the calendar and going back crashed the assistant:
 * "(events ?? []).flatMap is not a function". So the two screens share one
 * client here, in the order a person uses them.
 */
it("the assistant survives the calendar having filled the shared cache", async () => {
  const on = todayIso();
  serveEmpty(mock, [
    [
      /\/calendar_app\/events\/upcoming/,
      {
        occurrences: [
          {
            id: `7:${on}`, on, starts_at: `${on}T09:00:00Z`, ends_at: `${on}T09:30:00Z`, all_day: false,
            event: { id: 7, title: "Dentist", description: null, location: null, kind: "appointment", all_day: false, recurrence: null, color: null },
          },
        ],
      },
    ],
  ]);
  const client = testQueryClient({ queries: { gcTime: 60_000 } });
  const calendar = renderScreen(<Calendar />, client);
  await screen.findByText("Dentist");
  calendar.unmount();

  renderScreen(<Assistant />, client);
  // The empty conversation builds its suggestions from the calendar: the
  // event is offered as a question, and nothing throws on the way.
  await screen.findByTestId("chat-empty", {}, { timeout: 3000 });
  expect(screen.queryByText(/Dentist/)).not.toBeNull();
  client.clear();
});
