/**
 * THE SAME HEADER INSIDE EVERY APP (docs/design/app-shell/SPEC.md §C3,
 * src/components/shell/CLAUDE.md).
 *
 * A screen inside an app (a list, a loan, an event, a contact, a settings
 * page, a folder) draws the one `AppHeader` with a back chevron instead of
 * the app's badge, and names itself in the header's title. The server answers
 * 500 to anything not set up here on purpose, as in shellEverywhere.test.tsx.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert, BackHandler } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import TodoList from "../todos/list";
import Loan from "../finance/loan";
import EventDetail from "../calendar/event";
import ContactDetail from "../contacts/contact";
import SafeZoneSettings from "../safezone/settings";
import PagesFolder from "../pages/folder";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  usePathname: () => "/",
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn(), getState: () => ({ index: 1, routes: [{ name: "home" }, { name: "sub" }] }), setOptions: jest.fn() }),
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
jest.mock("@/screens/notes/reminderNotifications", () => ({
  ensureReminderPermission: jest.fn(async () => true),
  resyncTodoReminders: jest.fn(async () => undefined),
}));

const { router } = jest.requireMock("expo-router") as { router: Record<string, jest.Mock> };
let mock: MockAdapter;

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  mockParams.current = {};
  Object.values(router).forEach((fn) => fn.mockClear());
  router.canGoBack.mockReturnValue(true);
  jest.spyOn(BackHandler, "addEventListener").mockImplementation(() => ({ remove: () => undefined }));
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  useSafezoneLock.getState().reset();
  mock.onGet("/api/v1/conversations/unread_messages_count").reply(200, { unread_messages_count: 0, unread_messages_total: 0 });
  mock.onGet("/api/v1/notifications/unread_count").reply(200, { unread_count: 0 });
  mock.onGet(/users\/connected_user/).reply(200, { user: { id: 7, first_name: "Alex", last_name: "Martin", email: "alex@example.com" } });
  mock.onGet("/api/v1/safezone_app/pin").reply(200, { enabled: true, locked_out: false, locked_until: null, attempts_left: 5 });
  // Each screen's own record, with invented data.
  mock.onGet("/api/v1/todo_app/todo_groups/4").reply(200, {
    todo_group: { id: 4, name: "[qa] Groceries", position: 1, todos_count: 0, completed_count: 0, pending_count: 0, overdue_count: 0, created_at: "x", updated_at: "x", todos: [] },
  });
  mock.onGet("/api/v1/my_finance_app/loans/5").reply(200, {
    loan: {
      id: 5, description: null, due_date: null, amount: "200.0", contact_name: "Sam Lender", loan_type: "given", status: "unpaid", currency: "eur",
      tag_id: null, total_paid: 0, remaining_amount: "200.0", category: null, loan_payments: [], amount_with_currency: "200.0 eur", labels: [], label_ids: [],
    },
  });
  mock.onGet("/api/v1/calendar_app/events/41").reply(200, {
    event: {
      id: 41, title: "Dentist QA", description: null, location: null, kind: "appointment", all_day: false, starts_on: null, ends_on: null,
      starts_at: new Date(2026, 10, 12, 14, 30).toISOString(), ends_at: new Date(2026, 10, 12, 15, 30).toISOString(),
      recurrence: "none", recurrence_until: null, color: "green", owner: { id: 3, name: "Sam" }, current_user_permission: "owner",
      current_user_response: null, reminders: [], shares: [], guest_count: 0,
    },
  });
  mock.onGet("/api/v1/contact_app/contacts/7").reply(200, {
    contact: {
      id: 7, firstname: "Jamil", lastname: "Safi", nickname: null, company: null, job_title: null, favorite: false, birth_date: null, age: null,
      photo_url: null, email: null, phone: null, is_self: false, phones: [], emails: [], addresses: [], relations: [], documents: [], website: null, notes: null,
    },
  });
  mock.onAny().reply(500);
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const wrap = (el: ReactElement) => render(<QueryClientProvider client={testQueryClient()}>{el}</QueryClientProvider>);

const SUB_SCREENS: [string, Record<string, string>, () => ReactElement, string][] = [
  ["Tasks › a list", { id: "4" }, () => <TodoList />, "[qa] Groceries"],
  ["Finance › a loan", { id: "5" }, () => <Loan />, "Sam Lender"],
  ["Calendar › an event", { id: "41" }, () => <EventDetail />, "Dentist QA"],
  ["Contacts › a contact", { id: "7" }, () => <ContactDetail />, "Jamil Safi"],
  ["SafeZone › settings", {}, () => <SafeZoneSettings />, "SafeZone settings"],
  ["Pages › a folder", { spaceId: "3", title: "Invoices QA", trail: "Work" }, () => <PagesFolder />, "Invoices QA"],
];

describe.each(SUB_SCREENS)("%s shows the shared header with a back chevron", (_name, params, element, title) => {
  it("names the screen, has back, and no Home badge", async () => {
    mockParams.current = params;
    wrap(element());
    const header = await screen.findByTestId("app-header");
    await waitFor(() => expect(within(header).getByTestId("header-title")).toHaveTextContent(title));
    expect(within(header).getByTestId("header-back")).toBeTruthy();
    expect(screen.queryByTestId("header-home")).toBeNull();
    for (const id of ["header-chats", "header-notifications", "header-ai", "header-apps", "header-profile"]) {
      expect(within(header).getByTestId(id)).toBeTruthy();
    }
    expect(screen.getAllByTestId("app-header")).toHaveLength(1);
    // The old per-screen AI pill is gone: the header has AI.
    expect(screen.queryByTestId("ai-button")).toBeNull();
    await act(async () => new Promise((r) => setTimeout(r, 0)));
  });
});

it("the header's back goes back", async () => {
  mockParams.current = { id: "4" };
  wrap(<TodoList />);
  fireEvent.press(await screen.findByTestId("header-back"));
  expect(router.back).toHaveBeenCalled();
  await act(async () => new Promise((r) => setTimeout(r, 0)));
});
