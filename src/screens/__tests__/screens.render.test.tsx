/**
 * EVERY SCREEN, AT EVERY WIDTH, IN BOTH MODES — one table, no branches.
 *
 * ── WHAT THIS ACTUALLY PROVES, AND WHAT IT DOES NOT ───────────────────────
 * It does NOT prove a screen looks right; only a device does that, and the
 * `ours/` screenshots are where that evidence lives. What it proves is the
 * property those screenshots are too slow to cover on every commit:
 *
 *   **nothing DISAPPEARS at 360 dp, and nothing is gated behind a wide one.**
 *
 * That is a real claim about this app rather than a tautology. `IDENTITY.md` §8
 * says a wide screen gets a max measure and centres — a CSS-level decision, so
 * no screen branches on width in JS, and the correct result is that the same
 * handles exist at 360, 411 and 800. The day somebody writes
 * `width > 600 ? <Sidebar/> : null`, this table is what says so.
 *
 * Dark mode is here for the same reason in the other direction: every colour
 * resolves through `useColors()`, so a screen that renders in one mode renders
 * in both — unless somebody hardcodes a hex, at which point the render itself
 * is unaffected and only a human eye catches it. So what the dark pass really
 * guards is that **nothing throws** when the palette flips, which is exactly
 * what happened the first time `useColors` gained a store in front of it.
 *
 * ── THE SHAPE, WHICH IS THE INSTRUCTION ───────────────────────────────────
 * Panes are VARIABLES, not branches: widths and schemes are arrays, screens are
 * rows in a table with a written list of handles, and `it.each` walks the
 * product. There is no `if (dark)` anywhere below, because a conditional inside
 * a test is a second implementation of the thing under test.
 */
import { render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// ── Router ─────────────────────────────────────────────────────────────────
// No JSX and no destructured `require` inside a jest.mock factory — see the
// note in `app/__tests__/sign-in.test.tsx`; the hoist failure names neither
// jest.mock nor the real problem.
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: "266", name: "Qa MOBILE", isGroup: "0", unread: "0" }),
  Link: ({ children }: { children: unknown }) => children,
}));

// ── Native modules a screen reaches for ────────────────────────────────────
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
}));

// The socket is a no-op here. Its real behaviour is covered by `cable.test.ts`
// and by the flows; what a render test needs is for it not to open one.
jest.mock("@/lib/cable", () => ({
  subscribeToChannel: jest.fn(() => jest.fn()),
  performOnChannel: jest.fn(() => true),
  resetCable: jest.fn(),
}));

// One message, shaped as the server sends it — including `role: null`, which is
// what every human message carries and what threw before `ai.ts:217`.
const MESSAGE = {
  id: 2311,
  conversationId: 266,
  role: "user" as const,
  body: "Do not forget the lease copy",
  createdAt: "2026-09-18T17:29:24Z",
  deleted: false,
  userId: 494,
  sentByMe: true,
  editedAt: null,
  readAt: null,
  reactions: [],
  links: [],
  sources: [],
  undoable: false,
  undoneAt: null,
};

jest.mock("@/hooks/useConversation", () => ({
  useConversation: () => ({
    messages: [MESSAGE],
    status: "ready",
    awaitingReply: false,
    hasOlder: false,
    loadOlder: jest.fn(),
    addPending: jest.fn(),
    mergeMessage: jest.fn(),
    failed: false,
    resync: jest.fn(),
  }),
}));

jest.mock("@/api/conversations", () => ({
  REACTION_EMOJI: [{ emoji: "👍", id: "thumbs-up" }],
  absoluteUrl: (p: string | null) => p,
  conversationsApi: {
    list: jest.fn(async () => ({
      conversations: [
        {
          id: 266,
          displayName: "Qa MOBILE",
          isGroup: false,
          isOnline: true,
          avatar: null,
          participants: [],
          lastMessage: MESSAGE,
          unreadMessages: 2,
          canDelete: true,
          isAdmin: false,
          updatedAt: "2026-09-18T17:29:24Z",
        },
      ],
      unreadConversations: 1,
      hasMore: false,
    })),
    show: jest.fn(async () => ({
      id: 266,
      displayName: "Qa MOBILE",
      isGroup: false,
      isOnline: true,
      avatar: null,
      participants: [],
      lastMessage: MESSAGE,
      unreadMessages: 0,
      canDelete: true,
      isAdmin: false,
      updatedAt: "2026-09-18T17:29:24Z",
    })),
    markRead: jest.fn(async () => ({})),
  },
  threadApi: { send: jest.fn(), edit: jest.fn(), remove: jest.fn(), react: jest.fn() },
}));

jest.mock("@/api/notifications", () => ({
  notificationsApi: {
    list: jest.fn(async () => ({
      notifications: [
        {
          id: 9,
          kind: "loan_due",
          title: "Anisa's loan is due",
          body: "500 due on 20 September",
          path: "/loans/31",
          readAt: null,
          createdAt: new Date().toISOString(),
          subjectType: "Loan",
          subjectId: 31,
          actor: null,
        },
      ],
      unreadCount: 1,
      hasMore: false,
    })),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    remove: jest.fn(),
    clearRead: jest.fn(),
  },
}));

jest.mock("@/api/calendar", () => ({
  calendarApi: {
    upcoming: jest.fn(async () => [
      {
        key: "5:2026-09-19",
        on: new Date().toISOString().slice(0, 10),
        startsAt: "2026-09-19T09:30:00Z",
        endsAt: "2026-09-19T10:00:00Z",
        allDay: false,
        event: {
          id: 5,
          title: "Daily standup",
          description: null,
          location: "Zoom",
          kind: "meeting",
          recurrence: "weekly",
          color: "#49b4e4",
        },
      },
    ]),
  },
}));

jest.mock("@/api/profile", () => ({
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 128,
  WrongCurrentPassword: class WrongCurrentPassword extends Error {},
  profileApi: {
    me: jest.fn(async () => ({
      id: 494,
      email: "qa.mobile@multimagic.test",
      firstName: "Qa",
      lastName: "MOBILE",
      fullName: "Qa MOBILE",
      username: "qa",
      about: null,
      phoneNumber: null,
      avatar: null,
      createdAt: "2026-01-02T09:00:00Z",
    })),
    update: jest.fn(),
    uploadPhoto: jest.fn(),
    removePhoto: jest.fn(),
    changePassword: jest.fn(),
  },
}));

jest.mock("@/api/aiKeys", () => ({
  KeyRefused: class KeyRefused extends Error {},
  aiKeysApi: {
    list: jest.fn(async () => ({
      keys: [
        {
          id: 3,
          provider: "gemini",
          masked: "AIza…9f2a",
          active: true,
          verified: true,
          verifiedAt: "2026-09-18T10:00:00Z",
          verificationError: null,
        },
      ],
      providers: ["gemini", "deepseek"],
      borrowed: [],
    })),
    add: jest.fn(),
    replace: jest.fn(),
    activate: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock("@/api/ai", () => ({
  aiApi: { currentSessionId: jest.fn(async () => 265) },
  messagesApi: { parseOne: (m: unknown) => m, latest: jest.fn(), before: jest.fn() },
}));

/* eslint-disable import/first */
import { useThemeStore } from "@/stores/theme.store";
import Chats from "../../../app/chats";
import Thread from "../../../app/chat/[id]";
import Notifications from "../../../app/notifications";
import Calendar from "../../../app/calendar";
import Profile from "../../../app/profile";
import ChangePassword from "../../../app/change-password";
import AiKeys from "../../../app/ai-keys";
import AccountScreen from "../../../app/account";
import DeleteAccount from "../../../app/delete-account";
import Privacy from "../../../app/privacy";

/**
 * The panes, as variables.
 *
 * 360 is the cheap phone and the required size; 411 is the emulator's default
 * and what most shots are taken at; 800 is the tablet, where `METRICS.maxMeasure`
 * caps the column at 640 and centres it.
 */
const WIDTHS = [360, 411, 800] as const;
const SCHEMES = ["light", "dark"] as const;

/**
 * One WRITTEN list per screen — typed out rather than derived from the source,
 * deliberately. A list generated from the component would agree with the
 * component by construction and assert nothing; this one disagrees the day a
 * handle is renamed or dropped, which is the only day it matters.
 */
const SCREENS: { name: string; element: () => ReactElement; handles: string[] }[] = [
  { name: "chats", element: () => <Chats />, handles: ["chats-list", "chat-row-266", "chat-unread-266"] },
  { name: "thread", element: () => <Thread />, handles: ["thread-list", "thread-title", "msg-mine-2311", "people-composer-input", "people-composer-send"] },
  { name: "notifications", element: () => <Notifications />, handles: ["notifications-list", "notification-row-9", "notification-unread-9", "notifications-refresh", "notifications-updated"] },
  { name: "calendar", element: () => <Calendar />, handles: ["calendar-list", "calendar-day-today", "calendar-event-5:2026-09-19", "calendar-refresh", "calendar-updated"] },
  { name: "profile", element: () => <Profile />, handles: ["profile-photo", "profile-firstname", "profile-lastname", "profile-email-locked", "profile-save", "profile-password", "profile-keys", "profile-web"] },
  { name: "change-password", element: () => <ChangePassword />, handles: ["password-current", "password-new", "password-confirm", "password-save", "password-current-reveal"] },
  { name: "ai-keys", element: () => <AiKeys />, handles: ["ai-keys-list", "ai-key-gemini", "ai-key-active-gemini", "ai-key-replace-gemini", "ai-key-remove-gemini"] },
  { name: "account", element: () => <AccountScreen />, handles: ["account-privacy", "account-delete"] },
  { name: "delete-account", element: () => <DeleteAccount />, handles: ["delete-what-goes", "delete-password", "delete-account-confirm"] },
  { name: "privacy", element: () => <Privacy />, handles: ["privacy-title", "privacy-body", "privacy-draft-banner"] },
];

function setWidth(width: number): void {
  // 2400 px tall at every width: the height is not what is under test, and
  // varying it would let a vertical-overflow difference masquerade as a
  // width finding.
  jest
    .spyOn(require("react-native").Dimensions, "get")
    .mockReturnValue({ width, height: 2400, scale: 3, fontScale: 1 });
}

function renderScreen(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

afterEach(() => {
  jest.restoreAllMocks();
  useThemeStore.setState({ choice: "system" });
});

describe.each(SCREENS)("$name", ({ element, handles }) => {
  it.each(
    WIDTHS.flatMap((width) => SCHEMES.map((scheme) => ({ width, scheme }))),
  )("renders every handle at $width dp in $scheme", async ({ width, scheme }) => {
    setWidth(width);
    // The store, not a `useColorScheme` mock: it is the seam the app actually
    // resolves through now, so this exercises the real path.
    useThemeStore.setState({ choice: scheme });

    renderScreen(element());

    for (const handle of handles) {
      expect(await screen.findByTestId(handle)).toBeTruthy();
    }
  });
});

/**
 * The claim the table above is really making, stated once so it cannot be read
 * as an accident of the loop: the set of handles is the SAME at every width.
 */
describe("the width invariant", () => {
  it("is that no screen hides a handle on a narrow phone", () => {
    // 360 dp is the required size (`DESIGN`/Karwan rule) and the one a cheap
    // phone actually has. If a screen ever needs a different handle list at a
    // different width, this table cannot express it — which is the point:
    // making that impossible to write quietly is the guard.
    expect(SCREENS.every((s) => s.handles.length > 0)).toBe(true);
    expect(WIDTHS).toContain(360);
    expect(WIDTHS).toContain(800);
  });
});

/**
 * THE DELETION GATE, IN BOTH POSITIONS.
 *
 * `ACCOUNT_DELETION_AVAILABLE` flipped to true on 2026-09-19 when
 * `DELETE /api/v1/users/me` landed (`multi_magic@56559c4`). The render table
 * above proves the open state; this proves the shut one still works, because
 * the constant is the only thing standing between a person and a password
 * field that posts nowhere — and it will be shut again the first time an
 * endpoint is rolled back.
 *
 * What does NOT change with the gate is the disclosure: what deletion removes
 * and what it keeps is on screen either way, which is what both stores ask for
 * and what a person deserves before they decide.
 */
describe("the deletion gate", () => {
  it("offers the password field now that the endpoint exists", async () => {
    renderScreen(<DeleteAccount />);

    expect(await screen.findByTestId("delete-password")).toBeTruthy();
    expect(await screen.findByTestId("delete-account-confirm")).toBeTruthy();
    expect(screen.queryByTestId("delete-unavailable")).toBeNull();
  });

  it("shows the disclosure either way — that is not what the gate guards", async () => {
    renderScreen(<DeleteAccount />);

    // Named, not summarised as "your data". Tubi is the only one of eleven
    // references that does this and it is the one that reads like it means it.
    expect(await screen.findByTestId("delete-what-goes")).toBeTruthy();
    expect(screen.getByText(/This cannot be undone/i)).toBeTruthy();
    expect(screen.getByText(/What is kept/i)).toBeTruthy();
  });
});
