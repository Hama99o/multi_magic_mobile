/** Connect Claude (MANIFEST rows 17, 18): the server's URL and the web's command, connections, activity, disconnect asked first. */
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
import { developerApi } from "@/api/developer";
import ConnectClaude from "../connect-claude";

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <ConnectClaude />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it("shows the URL from the server and the web's command, each copyable", async () => {
  jest.spyOn(developerApi, "mcp").mockResolvedValue({ connections: [], activity: [], endpoint: "https://mm.example.test/mcp" });
  renderScreen();
  expect(await screen.findByTestId("connect-claude-url")).toHaveTextContent("https://mm.example.test/mcp");
  expect(screen.getByTestId("connect-claude-command")).toHaveTextContent(
    'claude mcp add --transport http multimagic https://mm.example.test/mcp \\ --header "Authorization: Bearer YOUR_KEY"',
  );
  fireEvent.press(screen.getByTestId("connect-claude-url-copy"));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith("https://mm.example.test/mcp");
  expect(screen.getByTestId("connect-claude-empty")).toBeTruthy();
  expect(screen.getByTestId("connect-claude-activity-empty")).toBeTruthy();
});

it("asks before disconnecting an app", async () => {
  jest.spyOn(developerApi, "mcp").mockResolvedValue({
    connections: [{ id: 4, name: "Claude", scopes: ["read"], connectedAt: null, lastUsedAt: null }],
    activity: [{ id: 1, tool: "list_records", status: "ok", via: "Claude", createdAt: null }],
    endpoint: "https://mm.example.test/mcp",
  });
  const off = jest.spyOn(developerApi, "disconnectMcp").mockResolvedValue();
  renderScreen();
  expect(await screen.findByText("list_records by Claude")).toBeTruthy();
  fireEvent.press(screen.getByTestId("connect-claude-disconnect-4"));
  await flush();
  expect(off).not.toHaveBeenCalled();
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { style?: string; onPress?: () => void }[];
  buttons.find((b) => b.style === "destructive")?.onPress?.();
  await waitFor(() => expect(off).toHaveBeenCalledWith(4));
});
