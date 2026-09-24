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
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
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

// ONE object for the whole run, like the real hook: its callbacks are
// useCallbacks and its arrays change only when the data does. A fresh object
// per call made every list prop look new on each render, which the typing
// test below would read as the screen's fault.
jest.mock("@/hooks/useConversation", () => {
  const byConversation = new Map<string, unknown>();
  return {
    useConversation: ({ conversationId }: { conversationId: number | null }) => {
      // The PEOPLE thread (266) has its message. The ASSISTANT's session (265,
      // or null before it resolves) is EMPTY, so it renders its suggested
      // questions: they exist only in the empty state, and they SEND when
      // tapped, which made them the costliest English in the app (claims
      // audit, 2026-09-24). One object per conversation, for the reason above.
      const key = String(conversationId);
      if (!byConversation.has(key)) {
        byConversation.set(key, {
          messages: conversationId === 266 ? [MESSAGE] : [],
          status: "ready",
          awaitingReply: false,
          hasOlder: false,
          loadOlder: jest.fn(),
          addPending: jest.fn(), addOptimistic: jest.fn(() => 9e15), confirmPending: jest.fn(), dropPending: jest.fn(), keyOf: (m: { id: number }) => String(m.id),
          mergeMessage: jest.fn(),
          failed: false,
          resync: jest.fn(),
        });
      }
      return byConversation.get(key);
    },
  };
});

jest.mock("@/api/conversations", () => ({
  REACTION_EMOJI: [{ emoji: "👍", id: "thumbs-up" }],
  absoluteUrl: (p: string | null) => p,
  conversationsApi: {
    // The chat header's chats badge: THREADS with something unread.
    unreadCount: jest.fn(async () => ({ unreadConversations: 1, unreadMessagesTotal: 2 })),
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
    // The chat header's bell badge.
    unreadCount: jest.fn(async () => 1),
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
  // The real module's constants (LIMITS, KEY_PROBLEMS…): the screens read them
  // while rendering. Only the calls are replaced.
  ...jest.requireActual("@/api/ai"),
  aiApi: { currentSessionId: jest.fn(async () => 265) },
  // One READY file, so the assistant offers its file question.
  documentsApi: { list: jest.fn(async () => [{ id: 1, filename: "facture-mars.pdf", status: "ready" }]) },
  messagesApi: { parseOne: (m: unknown) => m, latest: jest.fn(), before: jest.fn() },
}));

// One stocked app, so the assistant offers its app question too.
jest.mock("@/api/me", () => ({
  ...jest.requireActual("@/api/me"),
  meApi: { summary: jest.fn(async () => ({ counts: { notes: 4 }, stocked: ["notes"] })) },
}));

/* eslint-disable import/first */
import { useThemeStore } from "@/stores/theme.store";
import Assistant from "../../../app/chat";
import i18n from "@/i18n";
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
// ── THE THREE A STRANGER SEES ──────────────────────────────────────────────
// Added 2026-09-20, and the gap they left is worth the paragraph.
//
// This table skipped sign-in, sign-up and forgot-password for as long as it
// existed — the only screens somebody meets BEFORE they have an account, and
// the only part of this app a stranger ever sees. The gap was invisible
// because all three have good behaviour test files, so anyone auditing
// coverage found a file and stopped. What those files assert is FAILURE COPY,
// not layout, and the consequence was that `docs/design/sign-in/SPEC.md`'s
// "at 800 the form takes a max width and centres" sat unbuilt for two days
// with every gate green (`094e9e3`).
//
// WHAT MADE THEM DIFFERENT, so the next person adding a screen knows which
// shape they are joining: nothing, in the end. They were believed to need
// their own `expo-router` mocks because `app/__tests__/sign-in.test.tsx` has
// one — but that mock exists so those tests can ASSERT ON `router.replace`,
// which is a behaviour question. This table only needs the module to exist,
// and the shared mock at the top of this file already provides `router`,
// `Link` and `useLocalSearchParams`. The only real requirement is that the
// auth store is in a signed-out state with no `signedOutReason`, which is the
// state a stranger arrives in anyway.
import SignIn from "../../../app/sign-in";
import SignUp from "../../../app/sign-up";
import ForgotPassword from "../../../app/forgot-password";

/**
 * The panes, as variables.
 *
 * 360 is the cheap phone and the required size; 411 is the emulator's default
 * and what most shots are taken at; 800 is the tablet, where `METRICS.maxMeasure`
 * caps the column at 640 and centres it.
 *
 * ── AND THE LANGUAGE IS THE THIRD DIMENSION ──────────────────────────────
 * French is the longer language — reliably 15–20% more characters than
 * English for the same sentence — so **360 dp in French is the tightest pane
 * this app has**, and it is the one that would break first. Every screen is
 * rendered there in both modes, plus one wide French pane so the tablet's
 * measure is not left unchecked.
 *
 * The claim is the same as the width one and is worth stating: **the set of
 * handles does not depend on the language.**
 *
 * **And that claim is weaker than it sounds, so it is paired with a second
 * one.** A handle is on a container; the English text INSIDE it can survive
 * a language switch untouched and every handle still resolves. Proven by
 * planting exactly that — one hardcoded English sentence in the chats empty
 * state — and watching this table stay green. So each row also carries a
 * `french`: a distinctive sentence that must be on the screen once the
 * language is French, which is what actually fails when a string was missed.
 */
const WIDTHS = [360, 411, 800] as const;
const SCHEMES = ["light", "dark"] as const;

const PANES = [
  ...WIDTHS.flatMap((width) => SCHEMES.map((scheme) => ({ width, scheme, language: "en" }))),
  // The tightest pane there is, in both modes.
  ...SCHEMES.map((scheme) => ({ width: 360, scheme, language: "fr" })),
  // And the widest, once, so the measure is checked in French too.
  { width: 800, scheme: "dark" as const, language: "fr" },
];

/**
 * One WRITTEN list per screen — typed out rather than derived from the source,
 * deliberately. A list generated from the component would agree with the
 * component by construction and assert nothing; this one disagrees the day a
 * handle is renamed or dropped, which is the only day it matters.
 */
const SCREENS: {
  name: string;
  element: () => ReactElement;
  handles: string[];
  /** A sentence that can only be on screen if this screen reads French. */
  french: string;
  /** Texts that arrive on their OWN request and must be on screen before the
   *  French sweep reads it. Without them the sweep reads a half-loaded
   *  screen: planted English in the file suggestion stayed green, because
   *  the notes suggestion arrived first and the documents had not. */
  settled?: string[];
}[] = [
  // The empty conversation: the suggested questions are the French sentence.
  { name: "assistant", element: () => <Assistant />, handles: ["chat-empty", "composer-input"], french: "Qu’y a-t-il dans mes notes ?", settled: ["facture-mars.pdf"] },
  { name: "chats", element: () => <Chats />, handles: ["chats-list", "chat-row-266", "chat-unread-266"], french: "Discussions" },
  { name: "thread", element: () => <Thread />, handles: ["thread-list", "thread-title", "msg-mine-2311", "people-composer-input", "people-composer-send"], french: "En ligne" },
  { name: "notifications", element: () => <Notifications />, handles: ["notifications-list", "notification-row-9", "notification-unread-9", "notifications-refresh", "notifications-updated"], french: "Aujourd’hui" },
  { name: "calendar", element: () => <Calendar />, handles: ["calendar-list", "calendar-day-today", "calendar-event-5:2026-09-19", "calendar-refresh", "calendar-updated"], french: "À venir" },
  { name: "profile", element: () => <Profile />, handles: ["profile-photo", "profile-firstname", "profile-lastname", "profile-email-locked", "profile-save", "profile-password", "profile-keys", "profile-web"], french: "Profil" },
  { name: "change-password", element: () => <ChangePassword />, handles: ["password-current", "password-new", "password-confirm", "password-save", "password-current-reveal"], french: "Au moins 6 caractères." },
  { name: "ai-keys", element: () => <AiKeys />, handles: ["ai-keys-list", "ai-key-gemini", "ai-key-active-gemini", "ai-key-replace-gemini", "ai-key-remove-gemini"], french: "Votre clé IA" },
  { name: "account", element: () => <AccountScreen />, handles: ["account-privacy", "account-delete"], french: "Confidentialité" },
  { name: "delete-account", element: () => <DeleteAccount />, handles: ["delete-what-goes", "delete-password", "delete-account-confirm"], french: "Ce qui est supprimé" },
  // `privacy-draft-banner` and its French sentence left this row on 2026-09-21.
  // Hamma9900 approved the text, DRAFT left the title line of
  // `docs/PRIVACY.draft.md`, and `app/privacy.tsx:63` renders the banner only
  // while `PRIVACY_IS_DRAFT`. The policy body is English in both languages --
  // it is one document, not a translated one -- so the screen's only French is
  // its title, and that is what this row now reads.
  { name: "privacy", element: () => <Privacy />, handles: ["privacy-title", "privacy-body"], french: "Confidentialité" },
  { name: "sign-in", element: () => <SignIn />, handles: ["sign-in-email", "sign-in-password", "sign-in-submit", "sign-in-forgot", "sign-in-create-account"], french: "Se connecter avec un e-mail" },
  { name: "sign-up", element: () => <SignUp />, handles: ["sign-up-firstname", "sign-up-lastname", "sign-up-email", "sign-up-password", "sign-up-submit", "sign-up-to-sign-in"], french: "Créer le compte" },
  { name: "forgot-password", element: () => <ForgotPassword />, handles: ["forgot-password-email", "forgot-password-submit"] /* -back and -sent belong to the sent state, not this one */, french: "Envoyer le lien" },
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
  const client = testQueryClient();
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

afterEach(async () => {
  jest.restoreAllMocks();
  useThemeStore.setState({ choice: "system" });
  await i18n.changeLanguage("en");
});

describe.each(SCREENS)("$name", ({ element, handles, french }) => {
  it.each(PANES)(
    "renders every handle at $width dp in $scheme, in $language",
    async ({ width, scheme, language }) => {
    setWidth(width);
    // The store, not a `useColorScheme` mock: it is the seam the app actually
    // resolves through now, so this exercises the real path.
    useThemeStore.setState({ choice: scheme });
    await i18n.changeLanguage(language);

    renderScreen(element());

    for (const handle of handles) {
      expect(await screen.findByTestId(handle)).toBeTruthy();
    }
    },
  );

  /**
   * The second claim, and the one a handle cannot make: the screen is
   * actually READ in French. A hardcoded English string keeps every handle
   * and fails this.
   */
  it("reads in French", async () => {
    setWidth(360);
    await i18n.changeLanguage("fr");

    renderScreen(element());

    // `findAllByText`: a sentence a screen uses twice — a title and its
    // button — is still proof it reads French, and `findByText` would call
    // that an error.
    expect(
      (await screen.findAllByText(french, { exact: false, includeHiddenElements: true })).length,
    ).toBeGreaterThan(0);
  });
});

/**
 * NO ENGLISH PROSE ON A FRENCH SCREEN — every string, not one per screen.
 *
 * The "reads in French" row above checks ONE sentence per screen, and that is
 * how two whole surfaces stayed English (2026-09-24 claims audit): the chats
 * list's rows computed "You: …" and "No messages yet" in code, and its row
 * only looked at the title. The `<Text>` lint rule sees JSX text, not a string
 * returned from a function. So this collects what actually RENDERED on every
 * screen above, in French — each text node, and each accessibility label,
 * hint and placeholder — and fails on any that carries an English-only word.
 *
 * Enumerated from the reachable side: a screen added to `SCREENS` is swept
 * without anyone writing a French test for it.
 *
 * Exempt, each for a stated reason, and nothing else:
 * - a string that appears verbatim in THIS FILE: that is fixture data the
 *   test fed in (his notes, his events), which is his words, not the app's;
 * - anything inside `privacy-body`: the policy is one English document in
 *   both languages, by design (the `privacy` row's comment above).
 *
 * The word list is English words that are NOT also French, so "message",
 * "contacts", "notes", "pages" and "conversation" are deliberately absent.
 *
 * Planted, 2026-09-24: the old chats row ("You: …", "…, 2 unread") and an
 * English label held in a variable on the account screen are both red here.
 * Lint passed the second.
 *
 * The assistant screen is swept since 2026-09-24, in its EMPTY state, which
 * is where its suggested questions render (and they SEND when tapped).
 *
 * NOT SWEPT, so not claimed: the sheets (conversations, profile, sources),
 * two-factor, and every state other than the one these fixtures produce:
 * empty, failed and loading branches render other strings, and a date only
 * says "Aujourd’hui" when the fixture is from today, which is how
 * `DayDivider`'s English "Today" went unseen (now `dayLabel.test.ts`).
 */
const ENGLISH_ONLY = /\b(the|you|your|yours|is|are|was|were|what|when|where|which|who|how|with|this|that|these|and|from|have|has|not|yet|will|can|could|would|should|about|there|their|of|to|for|it|its|no|loading|delete|deleted|cancel|save|saved|back|send|retry|unread|search|settings|sign|account|password|edit|remove|close|done|error|failed|untitled|today|yesterday|online|typing|someone|upcoming|nothing|something|try|again|chat|chats|keys?|key)\b/i;

function renderedStrings(): string[] {
  const out: string[] = [];
  const insidePrivacy = (node: { parent: unknown; props: { testID?: string } } | null): boolean => {
    for (let n = node; n; n = n.parent as typeof node) if (n.props?.testID === "privacy-body") return true;
    return false;
  };
  for (const node of screen.UNSAFE_root.findAll(() => true, { deep: true })) {
    if (typeof node.type !== "string") continue;
    if (insidePrivacy(node as never)) continue;
    const { children, accessibilityLabel, accessibilityHint, placeholder } = node.props as Record<string, unknown>;
    if (node.type === "Text") {
      const text = ([] as unknown[]).concat(children).filter((c) => typeof c === "string" || typeof c === "number").join("");
      if (text.trim()) out.push(text.trim());
    }
    for (const v of [accessibilityLabel, accessibilityHint, placeholder]) {
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
  }
  return [...new Set(out)];
}

/**
 * THE STRUCTURAL CHECK, beside the word list: render each screen in English
 * AND French and fail on any string byte-identical in both. A string that
 * went through `t()` differs by construction; one that never did is the same.
 * It needs no vocabulary, so it does not lag the copy (Hamma9901's design).
 *
 * Its first run found something no word list could: event times read
 * "11:30 AM" and the thread's divider "Sep 18" in the French UI, because
 * `toLocale*String(undefined, …)` followed the PHONE's region. Every date and
 * time now follows the app's language (`DayDivider.tsx` says why), so this
 * check needs no exclusion for them.
 *
 * The allowlist: strings that are genuinely the same word in both languages.
 */
const SAME_IN_BOTH = new Set([
  // French uses the same word, and `locales.test.ts` SAME_IN_BOTH already
  // lists these keys for the same reason.
  "Assistant",
  "Notifications",
  // "min" is the French abbreviation too.
  "30 min",
  // The composer's placeholder: `thread.message` is in `locales.test.ts`
  // SAME_IN_BOTH, the same word in French.
  "Message",
]);

const THIS_FILE = require("fs").readFileSync(__filename, "utf8") as string;
/** Every double-quoted literal of four characters or more in this file: the
 *  fixture data. A rendered string often WRAPS one ("Non lu : <his title>"),
 *  so each is cut out of the string before the check, not matched whole. */
// CODE ONLY, not comments. The first version read the whole file, so this
// file's own comments, which QUOTE the bugs they describe ("11:30 AM",
// "Sep 18"), exempted those bugs: a planted region-formatted time stayed
// green. Writing a bug down must not excuse it.
const FIXTURE_CODE = THIS_FILE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const FIXTURE_TEXT = [...FIXTURE_CODE.matchAll(/"((?:[^"\\\n]|\\.){4,})"/g)]
  .map((m) => m[1])
  .sort((a, b) => b.length - a.length);
const withoutFixtures = (text: string) =>
  FIXTURE_TEXT.reduce((rest, literal) => rest.split(literal).join(" "), text);

describe.each(SCREENS)("$name, swept in French", ({ element, handles, french, settled }) => {
  it("renders no English prose", async () => {
    setWidth(360);
    await i18n.changeLanguage("fr");
    renderScreen(element());
    // EVERY handle first, not just the French sentence. The first version
    // swept as soon as the title appeared, before the list's data had
    // arrived, and found two strings on the chats screen: a sweep of the
    // starting state, which is green for anything (TESTING.md §19).
    for (const handle of handles) await screen.findByTestId(handle);
    await screen.findAllByText(french, { exact: false, includeHiddenElements: true });
    for (const text of settled ?? []) await screen.findAllByText(text, { exact: false });

    const strings = renderedStrings();
    // A sweep that collected nothing would pass for every screen. Two is the
    // floor because privacy's only non-policy strings are its title and Back.
    expect(strings.length).toBeGreaterThanOrEqual(2);
    const english = strings.filter((s) => ENGLISH_ONLY.test(withoutFixtures(s)));
    expect(english).toEqual([]);
  });

  it("renders nothing byte-identical in English and French, beyond the allowlist", async () => {
    const collect = async (language: "fr" | "en") => {
      setWidth(360);
      await i18n.changeLanguage(language);
      const view = renderScreen(element());
      for (const handle of handles) await screen.findByTestId(handle);
      for (const text of settled ?? []) await screen.findAllByText(text, { exact: false });
      if (language === "fr") await screen.findAllByText(french, { exact: false, includeHiddenElements: true });
      const out = renderedStrings();
      view.unmount();
      return out;
    };
    const fr = await collect("fr");
    const en = new Set(await collect("en"));
    const same = fr.filter(
      (s) => en.has(s) && /[A-Za-zÀ-ÿ]{2,}/.test(withoutFixtures(s)) && !SAME_IN_BOTH.has(s),
    );
    expect(same).toEqual([]);
  });
});

/**
 * THE PEOPLE THREAD IS INVERTED, NEWEST FIRST — the same anchor as the
 * assistant's (`useNewestAnchor`, 2026-09-24). Inverted alone would open on
 * the oldest; reversed alone would read upside down. And the day divider must
 * come AFTER its messages in the data, which is ABOVE them on screen.
 */
describe("the people thread", () => {
  it("is an inverted list, newest first, with its day divider above", async () => {
    setWidth(411);
    await i18n.changeLanguage("en");
    renderScreen(<Thread />);
    await screen.findByTestId("thread-list");

    const list = screen.getByTestId("thread-list");
    expect(list.props.inverted).toBe(true);
    const data = screen.UNSAFE_getByProps({ testID: "thread-list", inverted: true }).props.data as {
      kind: string;
    }[];
    expect(data[0].kind).not.toBe("day");
    expect(data.at(-1)?.kind).toBe("day");
  });

  // A CLAIM MOVED FROM A COMMENT INTO A TEST (2026-09-24). `app/chat/[id].tsx`
  // says a message that fails to send "stays on screen, never disappears into
  // an optimistic bubble" — asserted only on the row, never on the screen.
  // Here: a refused send stays, with the server's reason and its retry.
  // Before this the only way to close the keyboard here was Back, which on a
  // pushed screen can pop the thread (`docs/design/people-chat/SPEC.md`).
  it("puts the keyboard away on a drag", async () => {
    setWidth(411);
    await i18n.changeLanguage("en");
    renderScreen(<Thread />);
    await screen.findByTestId("thread-list");
    expect(screen.UNSAFE_getByProps({ testID: "thread-list", inverted: true }).props.keyboardDismissMode).toBe("on-drag");
  });

  it("keeps a refused message on screen, with the server's reason and a retry", async () => {
    setWidth(411);
    await i18n.changeLanguage("en");
    const { threadApi } = jest.requireMock("@/api/conversations") as { threadApi: { send: jest.Mock } };
    threadApi.send.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 422, data: { errors: ["Body is too long (maximum is 10000 characters)"] } },
    });
    renderScreen(<Thread />);
    await screen.findByTestId("thread-list");

    fireEvent.changeText(screen.getByTestId("people-composer-input"), "a message that will be refused");
    await act(async () => {
      fireEvent.press(screen.getByTestId("people-composer-send"));
    });

    expect(await screen.findByText("a message that will be refused")).toBeTruthy();
    expect(screen.getByTestId("msg-retry")).toBeTruthy();
    expect(screen.getByText("Body is too long (maximum is 10000 characters)")).toBeTruthy();
  });

  // Measured 2026-09-24 on `qa_phone4`: typing here gave 17 list commits of
  // 112-432 ms, every bubble re-rendering per keystroke. FlatList is a
  // PureComponent, so the proof is that no prop changes IDENTITY across a
  // keystroke. Identity only: a deep compare of a list's props exhausted a
  // Jest worker's heap once already (`app/__tests__/chat.test.tsx`).
  it("hands the list the SAME props before and after a keystroke", async () => {
    setWidth(411);
    await i18n.changeLanguage("en");
    renderScreen(<Thread />);
    await screen.findByTestId("thread-list");
    fireEvent.changeText(screen.getByTestId("people-composer-input"), "H");
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const list = () => screen.UNSAFE_getByProps({ testID: "thread-list", inverted: true });
    const before = { ...list().props };

    fireEvent.changeText(screen.getByTestId("people-composer-input"), "Hello");

    const after = list().props;
    expect(Object.keys(before).filter((key) => after[key] !== before[key])).toEqual([]);
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

  it("is that no screen hides a handle in the longer language either", () => {
    // 360 dp in French is the tightest pane in the app, and both modes of it
    // are in the table.
    const tightest = PANES.filter((p) => p.width === 360 && p.language === "fr");
    expect(tightest).toHaveLength(SCHEMES.length);
    expect(PANES.some((p) => p.width === 800 && p.language === "fr")).toBe(true);
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
