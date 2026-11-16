/**
 * Back to the app grid (owner's known issue, audit 2026-11-16): SafeZone,
 * Calendar and Contacts go Home the way Notes does. With Home behind, back
 * pops to it; opened with nothing behind (a link, a notification), back
 * replaces with Home instead of doing nothing; and Android's back at that
 * root goes Home rather than out of the app.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert, BackHandler } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import { useCalendarView } from "@/stores/calendarView.store";
import { useContactsCountry } from "@/stores/contactsCountry.store";
import SafeZone from "../safezone";
import Calendar from "../calendar";
import Contacts from "../contacts";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn() }),
  useFocusEffect: (cb: () => void) => jest.requireActual("react").useEffect(cb, [cb]),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);
jest.mock("expo-image-picker", () => require("@/__tests__/screenMocks").imagePicker);
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-contacts", () => ({
  Contact: { presentPicker: jest.fn(), getAllDetails: jest.fn(), presentCreateForm: jest.fn(async () => true), presentAccessPicker: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}));
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));

const { router } = jest.requireMock("expo-router") as { router: Record<"push" | "back" | "replace" | "canGoBack", jest.Mock> };
let mock: MockAdapter;
let handlers: (() => boolean | null | undefined)[];

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  router.back.mockClear();
  router.replace.mockClear();
  router.canGoBack.mockReturnValue(true);
  handlers = [];
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_name, handler) => {
    handlers.push(handler as unknown as () => boolean | null | undefined);
    return { remove: () => undefined };
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  useSafezoneLock.getState().reset();
  useCalendarView.setState({ view: "agenda", hydrated: true });
  useContactsCountry.setState({ country: "AF", hydrated: true });
  mock.onGet("/api/v1/safezone_app/pin").reply(200, { enabled: true, locked_out: false, locked_until: null, attempts_left: 5 });
  mock.onGet("/api/v1/calendar_app/events/upcoming").reply(200, { occurrences: [] });
  mock.onGet("/api/v1/contact_app/contacts").reply(200, { contacts: [], meta: { pagy: { page: 1, pages: 1 }, total_count: 0 } });
  mock.onGet("/api/v1/contact_app/contacts/upcoming_birthdays").reply(200, { birthdays: [] });
  mock.onGet(/\/ai\/conversation$/).reply(200, { conversation: { id: 1 } });
  mock.onGet(/\/ai\/sessions/).reply(200, { sessions: [] });
  await jest.requireMock("expo-secure-store").deleteItemAsync("safezone_unlock");
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const SCREENS: [string, () => ReactElement, string][] = [
  ["SafeZone", () => <SafeZone />, "safezone-back"],
  ["Calendar", () => <Calendar />, "calendar-back"],
  ["Contacts", () => <Contacts />, "contacts-back"],
];

describe.each(SCREENS)("%s goes back to Home", (_name, element, backId) => {
  const open = () => render(<QueryClientProvider client={testQueryClient()}>{element()}</QueryClientProvider>);

  it("with Home behind, the back key pops to it", async () => {
    open();
    fireEvent.press(await screen.findByTestId(backId));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("with nothing behind (a link, a notification), the back key replaces with Home", async () => {
    router.canGoBack.mockReturnValue(false);
    open();
    fireEvent.press(await screen.findByTestId(backId));
    expect(router.replace).toHaveBeenCalledWith("/home");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("Android back at this root with nothing behind goes Home instead of leaving the app", async () => {
    router.canGoBack.mockReturnValue(false);
    open();
    await screen.findByTestId(backId);
    let handled = false;
    act(() => {
      handled = handlers.some((h) => h() === true);
    });
    expect(handled).toBe(true);
    expect(router.replace).toHaveBeenCalledWith("/home");
  });

  it("Android back with history is left to the stack", async () => {
    open();
    await screen.findByTestId(backId);
    const answers = handlers.map((h) => h());
    expect(answers).not.toContain(true);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
