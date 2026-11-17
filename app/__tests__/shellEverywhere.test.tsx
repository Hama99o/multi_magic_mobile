/**
 * THE SAME HEADER ON EVERY APP (docs/design/app-shell/MANIFEST.md M1, M8, M9).
 *
 * Every app root renders the one `AppHeader`, with the same four buttons and
 * its own name; the focused surfaces (the assistant, a chat thread) render
 * none. The server answers 500 to anything not set up here on purpose: the
 * header must not wait on, or depend on, any app's own data.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert, BackHandler } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import { useCalendarView } from "@/stores/calendarView.store";
import { useContactsCountry } from "@/stores/contactsCountry.store";
import { useAuthStore } from "@/stores/auth.store";
import Home from "../home";
import Notes from "../notes";
import Pages from "../pages";
import Chats from "../chats";
import Calendar from "../calendar";
import Contacts from "../contacts";
import SafeZone from "../safezone";
import Todos from "../todos";
import Finance from "../finance";
import Notifications from "../notifications";
import Assistant from "../chat";
import Thread from "../chat/[id]";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => ({ id: "266", name: "Sam QA", isGroup: "0", unread: "0" }),
  usePathname: () => "/",
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn(), getState: () => ({ index: 0, routes: [{ name: "home" }] }), setOptions: jest.fn() }),
  useFocusEffect: (cb: () => void) => jest.requireActual("react").useEffect(cb, [cb]),
  useRouter: () => jest.requireMock("expo-router").router,
  Link: ({ children }: { children: unknown }) => children,
  Stack: { Screen: () => null },
}));
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);
jest.mock("expo-image-picker", () => require("@/__tests__/screenMocks").imagePicker);
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => undefined), isAvailableAsync: jest.fn(async () => true) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-contacts", () => ({
  Contact: { presentPicker: jest.fn(), getAllDetails: jest.fn(), presentCreateForm: jest.fn(async () => true), presentAccessPicker: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}));
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));

const { router } = jest.requireMock("expo-router") as { router: Record<string, jest.Mock> };
let mock: MockAdapter;

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  Object.values(router).forEach((fn) => fn.mockClear());
  router.canGoBack.mockReturnValue(true);
  jest.spyOn(BackHandler, "addEventListener").mockImplementation(() => ({ remove: () => undefined }));
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  useSafezoneLock.getState().reset();
  useCalendarView.setState({ view: "agenda", hydrated: true });
  useContactsCountry.setState({ country: "AF", hydrated: true });
  mock.onGet("/api/v1/conversations/unread_messages_count").reply(200, { unread_messages_count: 2, unread_messages_total: 5 });
  mock.onGet("/api/v1/notifications/unread_count").reply(200, { unread_count: 4 });
  mock.onGet(/users\/connected_user/).reply(200, { user: { id: 7, first_name: "Alex", last_name: "Martin", email: "alex@example.com" } });
  mock.onGet("/api/v1/safezone_app/pin").reply(200, { enabled: true, locked_out: false, locked_until: null, attempts_left: 5 });
  mock.onGet(/\/ai\/conversation$/).reply(200, { conversation: { id: 1 } });
  mock.onGet(/\/ai\/sessions/).reply(200, { sessions: [] });
  mock.onAny().reply(500);
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const wrap = (el: ReactElement) => render(<QueryClientProvider client={testQueryClient()}>{el}</QueryClientProvider>);

const ROOTS: [string, () => ReactElement, string][] = [
  ["Home", () => <Home />, "MultiMagic"],
  ["Notes", () => <Notes />, "Notes"],
  ["Pages", () => <Pages />, "Pages"],
  ["Chats", () => <Chats />, "Chats"],
  ["Calendar", () => <Calendar />, "Calendar"],
  ["Contacts", () => <Contacts />, "Contacts"],
  ["SafeZone", () => <SafeZone />, "SafeZone"],
  ["Tasks", () => <Todos />, "Tasks"],
  ["Finance", () => <Finance />, "Finance"],
  ["Notifications", () => <Notifications />, "Notifications"],
];

describe.each(ROOTS)("%s shows the one shared header (M1)", (_name, element, title) => {
  it("with the same four buttons, its own name, and no back arrow", async () => {
    wrap(element());
    const header = await screen.findByTestId("app-header");
    for (const id of ["header-home", "header-chats", "header-notifications", "header-ai", "header-apps", "header-profile"]) {
      expect(within(header).getByTestId(id)).toBeTruthy();
    }
    expect(within(header).getByTestId("header-title")).toHaveTextContent(title);
    expect(screen.queryByTestId("header-back")).toBeNull();
    expect(screen.getAllByTestId("app-header")).toHaveLength(1);
    // The old per-app AI pill is gone: the assistant is the header's AI button, once.
    expect(screen.queryByTestId("ai-button")).toBeNull();
    await act(async () => new Promise((r) => setTimeout(r, 0)));
  });
});

describe("focused surfaces keep their own chrome (M9)", () => {
  it.each([
    ["the assistant", () => <Assistant />],
    ["a chat thread", () => <Thread />],
  ])("%s has no shell header", async (_name, element) => {
    wrap(element());
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByTestId("app-header")).toBeNull();
  });
});

describe("Home, in a mobile style (M8)", () => {
  const upcoming = (occurrences: unknown[]) => mock.onGet("/api/v1/calendar_app/events/upcoming").reply(200, { occurrences });
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const event = (id: number, title: string) => ({
    id: `${id}:${ymd}`,
    on: ymd,
    starts_at: `${ymd}T18:30:00.000Z`,
    ends_at: null,
    all_day: false,
    event: { id, title, kind: "event", all_day: false, color: null, recurrence: "none", starts_at: `${ymd}T18:30:00.000Z`, ends_at: null, location: null, description: null },
  });

  beforeEach(() => mock.reset());
  beforeEach(() => {
    useAuthStore.setState({ status: "signedIn", user: { id: 7, email: "alex@example.com", firstName: "Alex", lastName: "Martin", fullName: "Alex Martin", avatar: null } });
    mock.onGet("/api/v1/conversations/unread_messages_count").reply(200, { unread_messages_count: 2, unread_messages_total: 5 });
    mock.onGet("/api/v1/notifications/unread_count").reply(200, { unread_count: 4 });
    mock.onGet(/users\/connected_user/).reply(200, { user: { id: 7, first_name: "Alex", last_name: "Martin", email: "alex@example.com" } });
  });

  it("greets, offers the assistant, shows what is coming, then every app", async () => {
    upcoming([event(5, "Dentist QA"), event(6, "Team call QA")]);
    wrap(<Home />);
    expect(await screen.findByText("Hello Alex. What do you need today?")).toBeTruthy();
    expect(await screen.findByText("Dentist QA")).toBeTruthy();
    const order = ["home-greeting", "home-ask", "home-upcoming", "home-apps"].map((id) => screen.getByTestId(id));
    expect(order).toHaveLength(4);
    for (const key of ["safezone", "notes", "todos", "pages", "finance", "chats", "contacts", "calendar", "ai", "notifications", "conversations"]) {
      expect(screen.getByTestId(`home-tile-${key}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("home-tile-home")).toBeNull();
    fireEvent.press(screen.getByTestId("home-ask"));
    expect(router.push).toHaveBeenCalledWith("/chat");
    fireEvent.press(screen.getByTestId("home-upcoming-open"));
    expect(router.push).toHaveBeenCalledWith("/calendar");
  });

  it("hides Coming up when nothing is coming, and when the calendar cannot be read", async () => {
    upcoming([]);
    const first = wrap(<Home />);
    await screen.findByTestId("home-apps");
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByTestId("home-upcoming")).toBeNull();
    first.unmount();

    mock.onGet("/api/v1/calendar_app/events/upcoming").reply(500);
    wrap(<Home />);
    await screen.findByTestId("home-apps");
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByTestId("home-upcoming")).toBeNull();
  });

  it("a tile opens its app, and the badges match the header's", async () => {
    upcoming([]);
    wrap(<Home />);
    fireEvent.press(await screen.findByTestId("home-tile-finance"));
    expect(router.push).toHaveBeenCalledWith("/finance");
    expect(await screen.findByTestId("home-tile-notifications-count")).toHaveTextContent("4");
    expect(await screen.findByTestId("home-tile-chats-count")).toHaveTextContent("2");
  });
});
