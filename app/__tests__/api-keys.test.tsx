/**
 * Personal API keys (MANIFEST row 16). The token is shown once: never in
 * React Query's cache, never logged, gone when the screen goes. Deleting asks
 * first.
 */
import { Alert } from "react-native";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

/** Lets a mutation that was started reach its API call before asserting none was. */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/* eslint-disable import/first */
import * as Clipboard from "expo-clipboard";
import { developerApi, type ApiKey } from "@/api/developer";
import ApiKeys from "../api-keys";

const TOKEN = "fa_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const key = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: 3,
  name: "Claude Agent",
  scopes: ["read"],
  masked: "fa_••••cdef",
  active: true,
  lastUsedAt: null,
  expiresAt: null,
  createdAt: "2026-11-17T08:00:00Z",
  ...over,
});

function renderScreen(client = testQueryClient()) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ApiKeys />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(developerApi, "apiKeys").mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

it("refuses a key with no name before asking the server", async () => {
  const create = jest.spyOn(developerApi, "createApiKey");
  renderScreen();
  fireEvent.press(await screen.findByTestId("api-key-create"));
  expect(screen.getByTestId("api-key-name-error")).toHaveTextContent("Give the key a name.");
  expect(create).not.toHaveBeenCalled();
});

it("shows the new token once, copies it, and keeps it out of the cache and the logs", async () => {
  const logs = (["log", "info", "warn", "error", "debug"] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  jest.spyOn(developerApi, "createApiKey").mockResolvedValue({ key: key(), token: TOKEN });
  const { client } = renderScreen();
  fireEvent.changeText(await screen.findByTestId("api-key-name"), "Claude Agent");
  fireEvent.press(screen.getByTestId("api-key-scope-write"));
  fireEvent.press(screen.getByTestId("api-key-create"));

  expect(await screen.findByTestId("api-key-token")).toHaveTextContent(TOKEN);
  expect(developerApi.createApiKey).toHaveBeenCalledWith("Claude Agent", ["read", "write"], null);
  fireEvent.press(screen.getByTestId("api-key-copy"));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(TOKEN);

  const cached = JSON.stringify([
    client.getQueryCache().getAll().map((q) => q.state),
    client.getMutationCache().getAll().map((m) => m.state),
  ]);
  expect(cached).not.toContain(TOKEN);
  for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);

  fireEvent.press(screen.getByTestId("api-key-dismiss"));
  expect(screen.queryByTestId("api-key-token")).toBeNull();
});

it("forgets the token when the screen goes", async () => {
  jest.spyOn(developerApi, "createApiKey").mockResolvedValue({ key: key(), token: TOKEN });
  const client = testQueryClient();
  const first = renderScreen(client);
  fireEvent.changeText(await screen.findByTestId("api-key-name"), "Claude Agent");
  fireEvent.press(screen.getByTestId("api-key-create"));
  await screen.findByTestId("api-key-token");
  first.unmount();

  renderScreen(client);
  await screen.findByTestId("api-key-create");
  expect(screen.queryByTestId("api-key-token")).toBeNull();
});

it("lists keys masked, and asks before deleting one", async () => {
  jest.spyOn(developerApi, "apiKeys").mockResolvedValue([key()]);
  const del = jest.spyOn(developerApi, "deleteApiKey").mockResolvedValue();
  renderScreen();
  expect(await screen.findByTestId("api-key-3")).toHaveTextContent(/fa_••••cdef/);
  fireEvent.press(screen.getByTestId("api-key-delete-3"));
  await flush();
  expect(del).not.toHaveBeenCalled();
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { style?: string; onPress?: () => void }[];
  buttons.find((b) => b.style === "destructive")?.onPress?.();
  await waitFor(() => expect(del).toHaveBeenCalledWith(3));
});

// Device QA 2026-11-17: a key made "In 30 days" listed as "Expires just now",
// because the past-only relative formatter clamps every future date to "just now".
it("shows a future expiry as its date and a past one as expired", async () => {
  const later = new Date(Date.now() + 30 * 86_400_000);
  jest.spyOn(developerApi, "apiKeys").mockResolvedValue([
    key({ expiresAt: later.toISOString() }),
    key({ id: 4, name: "Old bot", expiresAt: new Date(Date.now() - 86_400_000).toISOString() }),
  ]);
  renderScreen();
  const row = await screen.findByTestId("api-key-3");
  expect(row).not.toHaveTextContent(/just now/);
  expect(row).toHaveTextContent(new RegExp(`Expires .*${later.getDate()}.*${later.getFullYear()}`));
  expect(screen.getByTestId("api-key-4")).toHaveTextContent(/Expired/);
});

it("says why a create failed when offline", async () => {
  jest.spyOn(developerApi, "createApiKey").mockRejectedValue(Object.assign(new Error("Network Error"), { isAxiosError: true }));
  renderScreen();
  fireEvent.changeText(await screen.findByTestId("api-key-name"), "x");
  fireEvent.press(screen.getByTestId("api-key-create"));
  expect(await screen.findByTestId("api-keys-error")).toHaveTextContent("Could not reach MultiMagic.");
});
