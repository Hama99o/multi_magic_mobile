/**
 * SafeZone, screen by screen, at the HTTP layer (`docs/design/safezone/`):
 * the real API functions, the real lock store, a server that answers in
 * PLAINTEXT (as the deployed one does), and the rule that no secret reaches
 * the screen unless someone asked to see it.
 *
 * What this cannot see: FLAG_SECURE actually blacking a screenshot, the iOS
 * app-switcher snapshot, the system clipboard of a real phone. Those are for
 * the device pass (SECURITY.md §9).
 */
import MockAdapter from "axios-mock-adapter";
import { AppState, type AppStateStatus } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import { safezoneKeys } from "@/api/safezone";
import { clipboardGuard } from "../clipboardGuard";
import SafeZone from "../../../../app/safezone";
import SafeZoneItem from "../../../../app/safezone/item";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
}));
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);
jest.mock("expo-clipboard", () => {
  const board = { text: "" };
  return {
    __board: board,
    setStringAsync: jest.fn(async (v: string) => {
      board.text = v;
      return true;
    }),
    getStringAsync: jest.fn(async () => board.text),
  };
});
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));

const clip = jest.requireMock("expo-clipboard") as { __board: { text: string }; setStringAsync: jest.Mock };
const capture = jest.requireMock("expo-screen-capture") as Record<"preventScreenCaptureAsync" | "allowScreenCaptureAsync", jest.Mock>;
const BASE = "/api/v1/safezone_app";
const SECRET = "hunter2-very-secret";
let mock: MockAdapter;
let appState: ((s: AppStateStatus) => void)[] = [];
let client: QueryClient;

const status = (over: Record<string, unknown> = {}) => ({ enabled: true, locked_out: false, locked_until: null, attempts_left: 5, ...over });
const password = { id: 11, title: "Mail", username: "qa-user", email: "qa@example.test", link: "mail.example.test", updated_at: "2026-11-10T10:00:00Z", note: "work", password: SECRET };
const card = { id: 21, name: "Visa", card_type: "credit_card", card_number: "4111 1111 1111 4242", expiry_date: "12/29", cvv: "987", code: "5555", updated_at: "2026-11-09T10:00:00Z" };
const list = (root: string, rows: unknown[]) => ({ [root]: rows, meta: { pagy: { page: 1, pages: 1 } } });

function renderScreen(element: ReactElement) {
  client = testQueryClient();
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

function typePin(pin: string) {
  for (const d of pin) fireEvent.press(screen.getByTestId(`safezone-pin-key-${d}`));
}

/** No text node on screen holds, or contains, any of the plaintext secrets. */
function assertNoSecretOnScreen() {
  for (const s of [SECRET, "4111 1111 1111 4242", "987", "5555"]) {
    expect(screen.queryAllByText(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toHaveLength(0);
  }
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  useSafezoneLock.getState().reset();
  await clipboardGuard.clearNow();
  clip.__board.text = "";
  clip.setStringAsync.mockClear();
  capture.preventScreenCaptureAsync.mockClear();
  capture.allowScreenCaptureAsync.mockClear();
  mockParams.current = {};
  appState = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, fn) => {
    appState.push(fn as (s: AppStateStatus) => void);
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
  mock.onGet(`${BASE}/passwords`).reply(200, list("passwords", [password]));
  mock.onGet(`${BASE}/payment_cards`).reply(200, list("payment_cards", [card]));
  mock.onGet(`${BASE}/identities`).reply(200, list("identities", []));
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function unlockVault() {
  mock.onGet(`${BASE}/pin`).reply(200, status());
  mock.onPost(`${BASE}/pin/unlock`).reply(200, { unlock_token: "tok", expires_in: 120 });
  renderScreen(<SafeZone />);
  await screen.findByTestId("safezone-unlock");
  typePin("482913");
  await screen.findByTestId("safezone-row-passwords-11");
}

describe("the gate", () => {
  it("no PIN yet: the vault refuses to open and offers to set one", async () => {
    mock.onGet(`${BASE}/pin`).replyOnce(200, status({ enabled: false })).onGet(`${BASE}/pin`).reply(200, status());
    mock.onPost(`${BASE}/pin/enable`).reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({ current_password: "account-pw", pin: "246810", pin_confirmation: "246810" });
      return [200, status()];
    });
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-setup");
    expect(screen.queryByTestId("safezone-list")).toBeNull();
    fireEvent.changeText(screen.getByTestId("safezone-setup-pin"), "246810");
    fireEvent.changeText(screen.getByTestId("safezone-setup-again"), "246810");
    fireEvent.changeText(screen.getByTestId("safezone-setup-password"), "account-pw");
    fireEvent.press(screen.getByTestId("safezone-setup-save"));
    // The server sends no token on enable: the PIN is asked for next.
    await screen.findByTestId("safezone-unlock");
  });

  it("two different PINs are refused before anything is sent", async () => {
    mock.onGet(`${BASE}/pin`).reply(200, status({ enabled: false }));
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-setup");
    fireEvent.changeText(screen.getByTestId("safezone-setup-pin"), "246810");
    fireEvent.changeText(screen.getByTestId("safezone-setup-again"), "246811");
    fireEvent.changeText(screen.getByTestId("safezone-setup-password"), "pw");
    fireEvent.press(screen.getByTestId("safezone-setup-save"));
    expect(await screen.findByText("The two PINs are different.")).toBeTruthy();
    expect(mock.history.post).toHaveLength(0);
  });

  it("six digits unlock; the list shows no secret even from a plaintext server", async () => {
    await unlockVault();
    expect(JSON.parse(mock.history.post[0].data as string)).toEqual({ pin: "482913" });
    expect(mock.history.get.find((r) => r.url === `${BASE}/passwords`)?.params).toMatchObject({ masked: 1 });
    expect(screen.getByText("Mail")).toBeTruthy();
    expect(screen.getByText("qa-user")).toBeTruthy();
    // The module is in this build: no "cannot block" warning
    // (its absence is secureScreen.absent.test.tsx).
    expect(screen.queryByTestId("safezone-no-capture-block")).toBeNull();
    assertNoSecretOnScreen();
    fireEvent.press(screen.getByTestId("safezone-tab-payment_cards"));
    expect(await screen.findByText("•••• 4242")).toBeTruthy();
    assertNoSecretOnScreen();
  });

  it("the dots are cleared the moment the PIN is sent", async () => {
    mock.onGet(`${BASE}/pin`).reply(200, status());
    mock.onPost(`${BASE}/pin/unlock`).reply(403, { error: "wrong_pin", attempts_left: 3 });
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-unlock");
    typePin("12345");
    expect(screen.getByTestId("safezone-pin-dots").props.accessibilityLabel).toBe("5 of 6 digits entered");
    typePin("6");
    expect(screen.getByTestId("safezone-pin-dots").props.accessibilityLabel).toBe("0 of 6 digits entered");
    expect(await screen.findByText("Wrong PIN. 3 tries left.")).toBeTruthy();
  });

  it("a lockout disables the pad until the server's time", async () => {
    const until = new Date(Date.now() + 7 * 60_000).toISOString();
    mock.onGet(`${BASE}/pin`).reply(200, status());
    mock.onPost(`${BASE}/pin/unlock`).reply(423, { error: "pin_locked_out", locked_until: until });
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-unlock");
    typePin("111111");
    await screen.findByTestId("safezone-locked-out");
    expect(screen.getByTestId("safezone-locked-out-left").props.children).toMatch(/Try again in [67]:\d\d\./);
    typePin("222222");
    expect(mock.history.post).toHaveLength(1);
  });

  it("too many tries (429) says so and pauses the pad", async () => {
    mock.onGet(`${BASE}/pin`).reply(200, status());
    mock.onPost(`${BASE}/pin/unlock`).reply(429, {});
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-unlock");
    typePin("111111");
    expect(await screen.findByText("Too many tries. Wait a minute, then try again.")).toBeTruthy();
    typePin("222222");
    expect(mock.history.post).toHaveLength(1);
  });

  it("the server saying no PIN at unlock goes to Set a PIN", async () => {
    mock.onGet(`${BASE}/pin`).replyOnce(200, status());
    mock.onPost(`${BASE}/pin/unlock`).reply(422, { error: "pin_not_enabled" });
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-unlock");
    typePin("111111");
    await screen.findByTestId("safezone-setup");
  });

  it("the 429 pause lifts after 60 s and the pad works again", async () => {
    jest.useFakeTimers();
    mock.onGet(`${BASE}/pin`).reply(200, status());
    mock.onPost(`${BASE}/pin/unlock`).replyOnce(429, {}).onPost(`${BASE}/pin/unlock`).reply(200, { unlock_token: "tok", expires_in: 120 });
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-unlock");
    typePin("111111");
    await screen.findByTestId("safezone-pin-notice");
    act(() => jest.advanceTimersByTime(59_000));
    typePin("222222");
    expect(mock.history.post).toHaveLength(1);
    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.queryByTestId("safezone-pin-notice")).toBeNull();
    typePin("333333");
    await waitFor(() => expect(mock.history.post).toHaveLength(2));
    expect(JSON.parse(mock.history.post[1].data as string)).toEqual({ pin: "333333" });
  });

  it("the lockout counts down to 0, then asks the server again and gives the pad back", async () => {
    jest.useFakeTimers();
    const until = new Date(Date.now() + 3_000).toISOString();
    mock
      .onGet(`${BASE}/pin`).replyOnce(200, status({ locked_out: true, locked_until: until, attempts_left: 0 }))
      .onGet(`${BASE}/pin`).reply(200, status());
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-locked-out");
    expect(screen.getByTestId("safezone-locked-out-left").props.children).toBe("Too many wrong PINs. Try again in 0:03.");
    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByTestId("safezone-locked-out-left").props.children).toBe("Too many wrong PINs. Try again in 0:02.");
    act(() => jest.advanceTimersByTime(2_000));
    await screen.findByTestId("safezone-unlock");
    expect(mock.history.get.filter((r) => r.url === `${BASE}/pin`)).toHaveLength(2);
  });

  it("after the PIN is turned on, nothing on screen still holds it or the password", async () => {
    mock.onGet(`${BASE}/pin`).replyOnce(200, status({ enabled: false })).onGet(`${BASE}/pin`).reply(200, status());
    mock.onPost(`${BASE}/pin/enable`).reply(200, status());
    renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-setup");
    fireEvent.changeText(screen.getByTestId("safezone-setup-pin"), "246810");
    fireEvent.changeText(screen.getByTestId("safezone-setup-again"), "246810");
    fireEvent.changeText(screen.getByTestId("safezone-setup-password"), "account-pw");
    fireEvent.press(screen.getByTestId("safezone-setup-save"));
    await screen.findByTestId("safezone-unlock");
    // The form is gone (its state with it), and no field anywhere holds them.
    expect(screen.queryByTestId("safezone-setup")).toBeNull();
    expect(screen.queryByDisplayValue("246810")).toBeNull();
    expect(screen.queryByDisplayValue("account-pw")).toBeNull();
  });

  it("blocks screen capture while open, and allows it again on leaving", async () => {
    mock.onGet(`${BASE}/pin`).reply(200, status());
    const view = renderScreen(<SafeZone />);
    await screen.findByTestId("safezone-unlock");
    expect(capture.preventScreenCaptureAsync).toHaveBeenCalledWith("safezone");
    view.unmount();
    expect(capture.allowScreenCaptureAsync).toHaveBeenCalledWith("safezone");
  });
});

describe("locking", () => {
  it("going to the background locks, and drops even the stripped list", async () => {
    await unlockVault();
    act(() => appState.forEach((fn) => fn("background")));
    await screen.findByTestId("safezone-unlock");
    expect(useSafezoneLock.getState().token).toBeNull();
    expect(client.getQueryCache().findAll({ queryKey: safezoneKeys.lists() })).toHaveLength(0);
  });

  it("the app switcher (inactive) covers the vault", async () => {
    await unlockVault();
    act(() => appState.forEach((fn) => fn("inactive")));
    expect(screen.getByTestId("safezone-cover")).toBeTruthy();
    act(() => appState.forEach((fn) => fn("active")));
    expect(screen.queryByTestId("safezone-cover")).toBeNull();
  });

  it("the padlock locks at once", async () => {
    await unlockVault();
    fireEvent.press(screen.getByTestId("safezone-lock"));
    await screen.findByTestId("safezone-unlock");
  });

  it("leaving SafeZone locks it, and drops even the stripped list", async () => {
    await unlockVault();
    expect(client.getQueryCache().findAll({ queryKey: safezoneKeys.lists() }).length).toBeGreaterThan(0);
    screen.unmount();
    expect(useSafezoneLock.getState()).toMatchObject({ token: null, status: { kind: "locked" } });
    expect(client.getQueryCache().findAll({ queryKey: safezoneKeys.lists() })).toHaveLength(0);
  });

  it("an expired token locks the open vault on the next tick", async () => {
    // Fake BEFORE the gate mounts: its 5 s interval is set up then.
    jest.useFakeTimers();
    await unlockVault();
    act(() => useSafezoneLock.setState({ expiresAt: Date.now() - 1 }));
    act(() => jest.advanceTimersByTime(5_000));
    expect(screen.getByTestId("safezone-unlock")).toBeTruthy();
  });

  it("a touch past half the token's life asks the server to slide it", async () => {
    mock.onPost(`${BASE}/pin/refresh`).reply((config) => {
      expect(config.headers?.["X-Safezone-Unlock"]).toBe("tok");
      return [200, { unlock_token: "tok-2", expires_in: 120 }];
    });
    await unlockVault();
    fireEvent(screen.getByTestId("safezone-list"), "touchStart");
    expect(mock.history.post.filter((r) => r.url?.endsWith("/pin/refresh"))).toHaveLength(0);
    act(() => useSafezoneLock.setState({ expiresAt: Date.now() + 30_000 }));
    fireEvent(screen.getByTestId("safezone-list"), "touchStart");
    await waitFor(() => expect(useSafezoneLock.getState().token).toBe("tok-2"));
  });

  it("back from the background, an overdue clipboard clear runs", async () => {
    await unlockVault();
    const due = jest.spyOn(clipboardGuard, "clearIfDue");
    act(() => appState.forEach((fn) => fn("active")));
    expect(due).toHaveBeenCalled();
  });

  it("the server saying locked mid-list locks the vault", async () => {
    mock.onGet(`${BASE}/identities`).reply(403, { error: "safezone_pin_locked" });
    await unlockVault();
    fireEvent.press(screen.getByTestId("safezone-tab-identities"));
    await screen.findByTestId("safezone-unlock");
  });
});

describe("the item: reveal and copy", () => {
  async function openItem(kind = "passwords", id = "11") {
    useSafezoneLock.getState().unlocked({ token: "tok", expiresIn: 120 });
    mockParams.current = { kind, id };
    mock.onGet(`${BASE}/passwords/11`).reply(200, password);
    mock.onGet(`${BASE}/payment_cards/21`).reply(200, card);
    renderScreen(<SafeZoneItem />);
    await screen.findByTestId("safezone-item-title");
  }

  it("shows the plain fields and masks the secret", async () => {
    await openItem();
    expect(screen.getByText("Mail")).toBeTruthy();
    expect(screen.getByText("qa-user")).toBeTruthy();
    expect(screen.getByTestId("safezone-field-password-value").props.children).toBe("••••••••");
    assertNoSecretOnScreen();
  });

  it("reveal fetches again, shows it, and hides it after 20 s", async () => {
    jest.useFakeTimers();
    await openItem();
    const before = mock.history.get.length;
    fireEvent.press(screen.getByTestId("safezone-field-password-reveal"));
    await waitFor(() => expect(screen.getByTestId("safezone-field-password-value").props.children).toBe(SECRET));
    expect(mock.history.get.length).toBe(before + 1);
    expect(mock.history.get.at(-1)?.headers?.["X-Safezone-Unlock"]).toBe("tok");
    act(() => jest.advanceTimersByTime(19_000));
    expect(screen.getByTestId("safezone-field-password-value").props.children).toBe(SECRET);
    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByTestId("safezone-field-password-value").props.children).toBe("••••••••");
    assertNoSecretOnScreen();
  });

  it("the countdown under a revealed secret runs down, then the value is masked", async () => {
    jest.useFakeTimers();
    await openItem();
    fireEvent.press(screen.getByTestId("safezone-field-password-reveal"));
    await waitFor(() => expect(screen.getByTestId("safezone-field-password-value").props.children).toBe(SECRET));
    const timer = () => screen.getByTestId("safezone-field-password-timer");
    expect(timer().props.accessibilityLabel).toBe("Hidden again in 20 seconds");
    act(() => jest.advanceTimersByTime(5_000));
    expect(timer().props.accessibilityLabel).toBe("Hidden again in 15 seconds");
    act(() => jest.advanceTimersByTime(10_000));
    expect(timer().props.accessibilityLabel).toBe("Hidden again in 5 seconds");
    act(() => jest.advanceTimersByTime(5_000));
    expect(screen.queryByTestId("safezone-field-password-timer")).toBeNull();
    expect(screen.getByTestId("safezone-field-password-value").props.children).toBe("••••••••");
  });

  it("copying a plain field is a plain copy: not fetched again, not cleared", async () => {
    jest.useFakeTimers();
    await openItem();
    const gets = mock.history.get.length;
    fireEvent.press(screen.getByTestId("safezone-field-username-copy"));
    await waitFor(() => expect(clip.__board.text).toBe("qa-user"));
    expect(await screen.findByText("Copied")).toBeTruthy();
    expect(mock.history.get.length).toBe(gets);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(clip.__board.text).toBe("qa-user");
  });

  it("one field at a time: revealing the CVV hides the number", async () => {
    await openItem("payment_cards", "21");
    fireEvent.press(screen.getByTestId("safezone-field-card_number-reveal"));
    await waitFor(() => expect(screen.getByTestId("safezone-field-card_number-value").props.children).toBe("4111 1111 1111 4242"));
    fireEvent.press(screen.getByTestId("safezone-field-cvv-reveal"));
    await waitFor(() => expect(screen.getByTestId("safezone-field-cvv-value").props.children).toBe("987"));
    expect(screen.getByTestId("safezone-field-card_number-value").props.children).toBe("••••••••");
  });

  it("copy puts the secret on the clipboard and takes it off after 30 s", async () => {
    jest.useFakeTimers();
    await openItem();
    fireEvent.press(screen.getByTestId("safezone-field-password-copy"));
    await waitFor(() => expect(clip.__board.text).toBe(SECRET));
    expect(await screen.findByText("Copied. Cleared from the clipboard in 30 s.")).toBeTruthy();
    assertNoSecretOnScreen();
    await act(async () => {
      jest.advanceTimersByTime(29_000);
    });
    expect(clip.__board.text).toBe(SECRET);
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    await act(async () => undefined);
    expect(clip.__board.text).toBe("");
  });

  it("locking wipes a revealed secret and clears the clipboard", async () => {
    await openItem("payment_cards", "21");
    fireEvent.press(screen.getByTestId("safezone-field-cvv-copy"));
    await waitFor(() => expect(clip.__board.text).toBe("987"));
    fireEvent.press(screen.getByTestId("safezone-field-card_number-reveal"));
    await waitFor(() => expect(screen.getByTestId("safezone-field-card_number-value").props.children).toBe("4111 1111 1111 4242"));
    act(() => useSafezoneLock.getState().lock());
    await screen.findByTestId("safezone-unlock");
    assertNoSecretOnScreen();
    await waitFor(() => expect(clip.__board.text).toBe(""));
  });

  it("an expired token asks for the PIN before revealing", async () => {
    await openItem();
    useSafezoneLock.setState({ expiresAt: Date.now() - 1 });
    fireEvent.press(screen.getByTestId("safezone-field-password-reveal"));
    await screen.findByTestId("safezone-unlock");
    assertNoSecretOnScreen();
  });

  it("the site opens in the browser, with https added", async () => {
    const { Linking } = jest.requireActual("react-native") as typeof import("react-native");
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await openItem();
    fireEvent.press(screen.getByTestId("safezone-field-link-open"));
    expect(open).toHaveBeenCalledWith("https://mail.example.test");
  });
});

it("French: the pad and the vault speak French", async () => {
  await i18n.changeLanguage("fr");
  mock.onGet(`${BASE}/pin`).reply(200, status());
  renderScreen(<SafeZone />);
  expect(await screen.findByText("Saisissez votre code SafeZone")).toBeTruthy();
  expect(screen.getByTestId("safezone-pin-dots").props.accessibilityLabel).toBe("0 chiffres saisis sur 6");
});
