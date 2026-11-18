/**
 * Security (MANIFEST rows 6, 8, 9, 10): two-step sign-in on and off with the
 * password asked again, signed-in devices, trusted devices and the sign-in
 * history. Every destructive press asks first, a wrong password never signs
 * anybody out, and a refused request says why instead of pretending.
 */
import { Alert } from "react-native";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));

/** Lets a mutation that was started reach its API call before asserting none was. */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/* eslint-disable import/first */
import { profileApi, WrongCurrentPassword, type Profile } from "@/api/profile";
import { securityApi } from "@/api/security";
import Security from "../security";
import i18n from "@/i18n";

const me = (over: Partial<Profile> = {}): Profile => ({ id: 8, email: "qa@example.test", twoFactorEnabled: false, ...over }) as Profile;
const offline = () => Object.assign(new Error("Network Error"), { isAxiosError: true });

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <Security />
    </QueryClientProvider>,
  );
}

/** Presses the red button of the last Alert. */
function confirmLastAlert() {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { style?: string; onPress?: () => void }[];
  buttons.find((b) => b.style === "destructive")?.onPress?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(profileApi, "me").mockResolvedValue(me());
  jest.spyOn(securityApi, "sessions").mockResolvedValue([
    { id: 1, deviceLabel: "Pixel 8", ipAddress: "10.0.0.1", createdAt: "2026-11-17T08:00:00Z", expiresAt: null, isCurrent: true },
    { id: 2, deviceLabel: "Firefox on Linux", ipAddress: "10.0.0.2", createdAt: "2026-11-16T08:00:00Z", expiresAt: null, isCurrent: false },
  ]);
  jest.spyOn(securityApi, "trustedDevices").mockResolvedValue({ rows: [], unreadable: 0, page: 1, next: null, total: 0 });
  jest.spyOn(securityApi, "loginHistory").mockResolvedValue({ rows: [], unreadable: 0, page: 1, next: null, total: 0 });
});
afterEach(() => jest.restoreAllMocks());

describe("two-step sign-in", () => {
  it("asks for the password before turning it on, and says it is on afterwards", async () => {
    const set = jest.spyOn(securityApi, "setTwoFactor").mockResolvedValue();
    renderScreen();
    fireEvent.press(await screen.findByTestId("security-2fa-toggle"));
    expect(set).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId("security-2fa-password"), "the-password");
    fireEvent.press(screen.getByTestId("security-2fa-confirm"));
    await waitFor(() => expect(set).toHaveBeenCalledWith(true, "the-password"));
    await waitFor(() => expect(screen.getByTestId("security-2fa-state")).toHaveTextContent(/^On\./));
  });

  it("shows a wrong password against the field and stays where it is", async () => {
    jest.spyOn(profileApi, "me").mockResolvedValue(me({ twoFactorEnabled: true }));
    jest.spyOn(securityApi, "setTwoFactor").mockRejectedValue(new WrongCurrentPassword());
    renderScreen();
    fireEvent.press(await screen.findByTestId("security-2fa-toggle"));
    fireEvent.changeText(screen.getByTestId("security-2fa-password"), "typo");
    fireEvent.press(screen.getByTestId("security-2fa-confirm"));
    expect(await screen.findByTestId("security-2fa-error")).toHaveTextContent("That password is not right.");
    expect(screen.getByTestId("security-2fa-state")).toHaveTextContent(/^On\./);
  });

  it("cannot be confirmed with an empty password", async () => {
    renderScreen();
    fireEvent.press(await screen.findByTestId("security-2fa-toggle"));
    expect(screen.getByTestId("security-2fa-confirm")).toBeDisabled();
  });
});

describe("signed-in devices", () => {
  it("marks this phone and offers no sign-out for it", async () => {
    renderScreen();
    expect(await screen.findByTestId("security-session-current")).toHaveTextContent("This phone");
    expect(screen.queryByTestId("security-session-signout-1")).toBeNull();
    expect(screen.getByTestId("security-session-signout-2")).toBeTruthy();
  });

  it("asks before signing another device out, and signs nothing out until the red button", async () => {
    const out = jest.spyOn(securityApi, "signOutSession").mockResolvedValue();
    renderScreen();
    fireEvent.press(await screen.findByTestId("security-session-signout-2"));
    expect(Alert.alert).toHaveBeenCalledWith("Sign this device out?", "Firefox on Linux will have to sign in again.", expect.any(Array));
    await flush();
  expect(out).not.toHaveBeenCalled();
    confirmLastAlert();
    await waitFor(() => expect(out).toHaveBeenCalledWith(2));
  });

  it("says it could not reach the server when offline, and does not pretend", async () => {
    jest.spyOn(securityApi, "signOutSession").mockRejectedValue(offline());
    renderScreen();
    fireEvent.press(await screen.findByTestId("security-session-signout-2"));
    confirmLastAlert();
    expect(await screen.findByTestId("security-sessions-error")).toHaveTextContent("Could not reach MultiMagic.");
    expect(screen.getByTestId("security-session-2")).toBeTruthy();
  });
});

describe("trusted devices and history", () => {
  it("pages trusted devices, a page more per press", async () => {
    const pages = jest
      .spyOn(securityApi, "trustedDevices")
      .mockResolvedValueOnce({ rows: [{ id: 5, label: "iPad", lastUsedAt: null, expiresAt: null }], unreadable: 0, page: 1, next: 2, total: 2 })
      .mockResolvedValueOnce({ rows: [{ id: 6, label: "Mac", lastUsedAt: null, expiresAt: null }], unreadable: 0, page: 2, next: null, total: 2 });
    renderScreen();
    fireEvent.press(await screen.findByTestId("security-trusted-more"));
    expect(await screen.findByTestId("security-trusted-6")).toBeTruthy();
    expect(pages).toHaveBeenLastCalledWith(2);
    expect(screen.queryByTestId("security-trusted-more")).toBeNull();
  });

  it("asks before clearing the whole history", async () => {
    jest
      .spyOn(securityApi, "loginHistory")
      .mockResolvedValue({ rows: [{ id: 9, deviceLabel: "Pixel 8", ipAddress: null, createdAt: null }], unreadable: 0, page: 1, next: null, total: 1 });
    const clear = jest.spyOn(securityApi, "clearLoginHistory").mockResolvedValue();
    renderScreen();
    fireEvent.press(await screen.findByTestId("security-history-clear"));
    await flush();
  expect(clear).not.toHaveBeenCalled();
    confirmLastAlert();
    await waitFor(() => expect(clear).toHaveBeenCalled());
  });

  it("says so when a list is empty", async () => {
    renderScreen();
    expect(await screen.findByTestId("security-trusted-empty")).toHaveTextContent("No trusted devices.");
    expect(await screen.findByTestId("security-history-empty")).toBeTruthy();
  });
});

// Device QA 2026-11-17: the app's own session read "Unknown Browser on Unknown
// OS", in English on a French phone.
it("names an unknown device in the reader's language", async () => {
  await i18n.changeLanguage("fr");
  jest.spyOn(securityApi, "sessions").mockResolvedValue([
    { id: 7, deviceLabel: "Unknown Browser on Unknown OS", ipAddress: "10.0.0.7", createdAt: "2026-11-17T08:00:00Z", expiresAt: null, isCurrent: true },
  ]);
  try {
    render(
      <QueryClientProvider client={testQueryClient()}>
        <Security />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("security-session-7")).toHaveTextContent(/Appareil inconnu/);
    expect(screen.getByTestId("security-session-7")).not.toHaveTextContent(/Unknown/);
  } finally {
    await i18n.changeLanguage("en");
  }
});
