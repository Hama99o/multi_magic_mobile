/**
 * A BINARY WITHOUT `expo-screen-capture` (SECURITY.md §7). Its own file,
 * because the case is a `require` that THROWS, and only a file-level
 * `jest.mock` makes one do that reliably (`readAloud.absent.test.ts`).
 *
 * Every binary built before this branch is that binary: SafeZone must still
 * open, and must SAY it cannot block screenshots rather than pretend.
 */
jest.mock("expo-screen-capture", () => {
  throw new Error("Cannot find native module 'ExpoScreenCapture'");
});
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: jest.fn(async () => "") }));

/* eslint-disable import/first */
import MockAdapter from "axios-mock-adapter";
import { render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { http } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import { secureScreen } from "../secureScreen";
import SafeZone from "../../../../app/safezone";

const BASE = "/api/v1/safezone_app";

it("says it is not available, and blocking is a no-op that reports false", async () => {
  expect(secureScreen.available()).toBe(false);
  await expect(secureScreen.prevent("safezone")).resolves.toBe(false);
  await expect(secureScreen.allow("safezone")).resolves.toBeUndefined();
});

it("the vault still opens, and warns that this build cannot block screenshots", async () => {
  await i18n.changeLanguage("en");
  const mock = new MockAdapter(http);
  mock.onGet(`${BASE}/pin`).reply(200, { enabled: true, locked_out: false, locked_until: null, attempts_left: 5 });
  mock.onGet(`${BASE}/passwords`).reply(200, { passwords: [], meta: { pagy: { pages: 1 } } });
  useSafezoneLock.getState().unlocked({ token: "tok", expiresIn: 120 });
  render(
    <QueryClientProvider client={testQueryClient()}>
      <SafeZone />
    </QueryClientProvider>,
  );
  expect(await screen.findByTestId("safezone-no-capture-block")).toBeTruthy();
  expect(screen.getByText("This version of the app can’t block screenshots here. Update the app.")).toBeTruthy();
  mock.restore();
});
