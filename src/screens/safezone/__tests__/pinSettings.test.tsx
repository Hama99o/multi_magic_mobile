/**
 * The PIN's life after it is set, as on the web (`SafezonePinSettings.tsx`,
 * `PinController`): change it with the account password and a code sent by
 * email (also the way back from a forgotten PIN), and turn it off with the
 * account password. Audit 2026-11-16, #7 and #27: the phone used to say
 * "change it on the web".
 *
 * The PIN, the code and the password live in the form's state only: they are
 * gone from the screen once the server answers, and no React Query mutation
 * keeps them as variables (rules.test.ts reads the source).
 */
import MockAdapter from "axios-mock-adapter";
import { AppState, type AppStateStatus } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import SafeZone from "../../../../app/safezone";
import SafeZoneSettings from "../../../../app/safezone/settings";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => jest.requireActual("react").useEffect(cb, [cb]),
}));
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: "success", Error: "error", Warning: "warning" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));

const { router } = jest.requireMock("expo-router") as { router: Record<"push" | "back" | "replace", jest.Mock> };
const BASE = "/api/v1/safezone_app";
let mock: MockAdapter;

const status = (over: Record<string, unknown> = {}) => ({ enabled: true, locked_out: false, locked_until: null, attempts_left: 5, ...over });

function renderScreen(element: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  useSafezoneLock.getState().reset();
  router.push.mockClear();
  router.back.mockClear();
  router.replace.mockClear();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, _fn: (s: AppStateStatus) => void) => ({ remove: () => undefined }) as ReturnType<typeof AppState.addEventListener>);
  mock.onGet(`${BASE}/pin`).reply(200, status());
  mock.onGet(`${BASE}/passwords`).reply(200, { passwords: [], meta: { pagy: { page: 1, pages: 1 } } });
  mock.onPost(`${BASE}/pin/refresh`).reply(200, { unlock_token: "tok-r", expires_in: 120 });
  await jest.requireMock("expo-secure-store").deleteItemAsync("safezone_unlock");
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const body = (url: string, method: "post" | "delete" = "post") => {
  const req = mock.history[method].find((r) => r.url === url);
  return req ? JSON.parse(req.data as string) : undefined;
};

/** Step 1 (the account password) → the code is emailed → step 2. */
async function askForCode(password = "account-pw") {
  fireEvent.changeText(await screen.findByTestId("safezone-change-password"), password);
  fireEvent.press(screen.getByTestId("safezone-change-send"));
}

function fillCodeStep(code: string, pin: string, again: string) {
  fireEvent.changeText(screen.getByTestId("safezone-change-code"), code);
  fireEvent.changeText(screen.getByTestId("safezone-change-pin"), pin);
  fireEvent.changeText(screen.getByTestId("safezone-change-again"), again);
  fireEvent.press(screen.getByTestId("safezone-change-confirm"));
}

describe("Forgot your PIN? (on the PIN pad)", () => {
  async function openForgot() {
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-unlock");
    fireEvent.press(screen.getByTestId("safezone-forgot"));
  }

  it("no longer sends you to the web", async () => {
    await openForgot();
    expect(screen.queryByText(/on the web/i)).toBeNull();
    expect(await screen.findByTestId("safezone-change-password")).toBeTruthy();
  });

  it("password → emailed code → new PIN, then the pad asks for the new PIN, and nothing typed stays", async () => {
    mock.onPost(`${BASE}/pin/request_change`).reply(200, { message: "Verification code sent", expires_in_minutes: 15 });
    mock.onPost(`${BASE}/pin/confirm_change`).reply(200, status());
    await openForgot();
    await askForCode();
    expect(await screen.findByTestId("safezone-change-code")).toBeTruthy();
    expect(screen.getByText(/sent a 6-digit code to your email/i)).toBeTruthy();
    expect(body(`${BASE}/pin/request_change`)).toEqual({ current_password: "account-pw" });
    fillCodeStep("123456", "135790", "135790");
    expect(await screen.findByTestId("safezone-pin-changed")).toBeTruthy();
    expect(screen.getByTestId("safezone-pin-key-1")).toBeTruthy();
    expect(body(`${BASE}/pin/confirm_change`)).toEqual({ code: "123456", pin: "135790", pin_confirmation: "135790" });
    for (const typed of ["account-pw", "123456", "135790"]) expect(screen.queryByDisplayValue(typed)).toBeNull();
  });

  it("a wrong account password is said, and no code is sent", async () => {
    mock.onPost(`${BASE}/pin/request_change`).reply(403, { error: "invalid_password" });
    await openForgot();
    await askForCode("nope");
    expect(await screen.findByText("That account password is wrong.")).toBeTruthy();
    expect(screen.queryByTestId("safezone-change-code")).toBeNull();
  });

  it("a wrong or expired code is said, and the code step stays", async () => {
    mock.onPost(`${BASE}/pin/request_change`).reply(200, { expires_in_minutes: 15 });
    mock.onPost(`${BASE}/pin/confirm_change`).reply(403, { error: "invalid_code" });
    await openForgot();
    await askForCode();
    await screen.findByTestId("safezone-change-code");
    fillCodeStep("000000", "135790", "135790");
    expect(await screen.findByText("That code is wrong or has expired.")).toBeTruthy();
    expect(screen.getByTestId("safezone-change-code")).toBeTruthy();
  });

  it("two different PINs are refused before anything is sent; the server's own refusals are said too", async () => {
    mock.onPost(`${BASE}/pin/request_change`).reply(200, { expires_in_minutes: 15 });
    mock.onPost(`${BASE}/pin/confirm_change`).replyOnce(422, { error: "invalid_pin_format" }).onPost(`${BASE}/pin/confirm_change`).reply(422, { error: "pin_mismatch" });
    await openForgot();
    await askForCode();
    await screen.findByTestId("safezone-change-code");
    fillCodeStep("123456", "135790", "135791");
    expect(await screen.findByText("The two PINs are different.")).toBeTruthy();
    expect(mock.history.post.filter((r) => r.url === `${BASE}/pin/confirm_change`)).toHaveLength(0);
    fillCodeStep("123456", "135790", "135790");
    expect(await screen.findByText("The PIN must be exactly 6 digits.")).toBeTruthy();
    fillCodeStep("123456", "135790", "135790");
    expect(await screen.findByText("The two PINs are different.")).toBeTruthy();
  });

  it("too many codes asked for (429) says to wait", async () => {
    mock.onPost(`${BASE}/pin/request_change`).reply(429, {});
    await openForgot();
    await askForCode();
    expect(await screen.findByTestId("safezone-change-error")).toHaveTextContent(/Too many tries/);
  });

  it("Cancel goes back to the pad", async () => {
    await openForgot();
    fireEvent.changeText(await screen.findByTestId("safezone-change-password"), "account-pw");
    fireEvent.press(screen.getByTestId("safezone-change-cancel"));
    expect(await screen.findByTestId("safezone-pin-key-1")).toBeTruthy();
    expect(screen.queryByDisplayValue("account-pw")).toBeNull();
  });
});

describe("SafeZone settings: change the PIN, turn it off", () => {
  it("the open vault's header has a settings key that opens them", async () => {
    useSafezoneLock.getState().unlocked({ token: "tok", expiresIn: 120 });
    renderScreen(<SafeZone />);
    fireEvent.press(await screen.findByTestId("safezone-settings"));
    expect(router.push).toHaveBeenCalledWith("/safezone/settings");
  });

  async function openSettings() {
    useSafezoneLock.getState().unlocked({ token: "tok", expiresIn: 120 });
    renderScreen(<SafeZoneSettings />);
    await screen.findByTestId("safezone-settings-screen");
  }

  it("change: the same emailed-code flow; then the vault locks and goes back, to ask for the new PIN", async () => {
    mock.onPost(`${BASE}/pin/request_change`).reply(200, { expires_in_minutes: 15 });
    mock.onPost(`${BASE}/pin/confirm_change`).reply(200, status());
    await openSettings();
    fireEvent.press(screen.getByTestId("safezone-settings-change"));
    await askForCode();
    await screen.findByTestId("safezone-change-code");
    fillCodeStep("123456", "135790", "135790");
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(useSafezoneLock.getState().status.kind).toBe("locked");
    expect(useSafezoneLock.getState().token).toBeNull();
  });

  it("turn off: the account password, DELETE /pin/disable, then back to SafeZone, which asks for a new PIN", async () => {
    mock.onDelete(`${BASE}/pin/disable`).reply(() => {
      mock.onGet(`${BASE}/pin`).reply(200, status({ enabled: false })); // the server's truth from now on
      return [200, status({ enabled: false })];
    });
    await openSettings();
    fireEvent.press(screen.getByTestId("safezone-settings-disable"));
    expect(screen.getByTestId("safezone-disable-body")).toHaveTextContent(/this phone/i);
    fireEvent.changeText(screen.getByTestId("safezone-disable-password"), "account-pw");
    fireEvent.press(screen.getByTestId("safezone-disable-confirm"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(body(`${BASE}/pin/disable`, "delete")).toEqual({ current_password: "account-pw" });
    expect(useSafezoneLock.getState().status.kind).toBe("notEnabled");
    expect(useSafezoneLock.getState().token).toBeNull();
  });

  it("turn off with a wrong password says so and keeps the PIN", async () => {
    mock.onDelete(`${BASE}/pin/disable`).reply(403, { error: "invalid_password" });
    await openSettings();
    fireEvent.press(screen.getByTestId("safezone-settings-disable"));
    fireEvent.changeText(screen.getByTestId("safezone-disable-password"), "nope");
    fireEvent.press(screen.getByTestId("safezone-disable-confirm"));
    expect(await screen.findByText("That account password is wrong.")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(useSafezoneLock.getState().status.kind).toBe("unlocked");
  });
});
