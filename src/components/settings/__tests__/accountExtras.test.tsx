/** Lending a key and AI usage on the AI keys screen (MANIFEST rows 13, 14), and the theme saved to the account (row 21). */
import { Alert } from "react-native";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

/** Lets a mutation that was started reach its API call before asserting none was. */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/* eslint-disable import/first */
import { aiKeysApi, type AiKey, type AiKeyPayload } from "@/api/aiKeys";
import { developerApi } from "@/api/developer";
import { profileApi, type Profile } from "@/api/profile";
import { useAuthStore } from "@/stores/auth.store";
import { KeyLending, parseLimit } from "../KeyLending";
import { AiUsagePanel } from "../AiUsagePanel";
import { ThemeRow } from "../ThemeRow";

const wrap = (node: React.ReactElement) => render(<QueryClientProvider client={testQueryClient()}>{node}</QueryClientProvider>);
const aiKey = (over: Partial<AiKey> = {}): AiKey => ({
  id: 3,
  provider: "gemini",
  masked: "AIza…9f2a",
  active: true,
  verified: true,
  verifiedAt: null,
  verificationError: null,
  sharedWith: [],
  ...over,
});
const payload: AiKeyPayload = { keys: [aiKey()], providers: ["gemini"], borrowed: [] };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("lending", () => {
  it("reads the limit: blank is none, a number is kept, anything else is refused", () => {
    expect(parseLimit("")).toBeNull();
    expect(parseLimit(" 2,5 ")).toBe(2.5);
    expect(parseLimit("-1")).toBe("invalid");
    expect(parseLimit("lots")).toBe("invalid");
  });

  it("refuses a bad limit before asking the server", async () => {
    const lend = jest.spyOn(aiKeysApi, "lend");
    wrap(<KeyLending aiKey={aiKey()} />);
    fireEvent.changeText(screen.getByTestId("ai-key-lend-email-gemini"), "friend@example.test");
    fireEvent.changeText(screen.getByTestId("ai-key-lend-limit-gemini"), "-3");
    fireEvent.press(screen.getByTestId("ai-key-lend-gemini"));
    expect(await screen.findByTestId("ai-key-lend-limit-error-gemini")).toBeTruthy();
    expect(lend).not.toHaveBeenCalled();
  });

  it("lends with the limit, and asks before taking it back", async () => {
    const lend = jest.spyOn(aiKeysApi, "lend").mockResolvedValue(payload);
    const stop = jest.spyOn(aiKeysApi, "stopLending").mockResolvedValue(payload);
    wrap(<KeyLending aiKey={aiKey({ sharedWith: [{ email: "a@example.test", pending: false, monthlyCreditLimit: 5, spentThisMonth: 1 }] })} />);
    expect(screen.getByText("1 of 5 credits this month")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("ai-key-lend-email-gemini"), "friend@example.test");
    fireEvent.changeText(screen.getByTestId("ai-key-lend-limit-gemini"), "10");
    fireEvent.press(screen.getByTestId("ai-key-lend-gemini"));
    await waitFor(() => expect(lend).toHaveBeenCalledWith(3, "friend@example.test", 10));

    fireEvent.press(screen.getByTestId("ai-key-loan-stop-a@example.test"));
    await flush();
  expect(stop).not.toHaveBeenCalled();
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { style?: string; onPress?: () => void }[];
    buttons.find((b) => b.style === "destructive")?.onPress?.();
    await waitFor(() => expect(stop).toHaveBeenCalledWith(3, "a@example.test"));
  });
});

describe("usage", () => {
  it("asks for the period pressed, and says so when nothing was used", async () => {
    const usage = jest.spyOn(developerApi, "aiUsage").mockImplementation(async (period) => ({
      period,
      mine: { calls: period === "all" ? 12 : 0, credits: 0.5, tokens: 900, byProvider: [] },
      lent: null,
    }));
    wrap(<AiUsagePanel />);
    expect(await screen.findByTestId("ai-usage-nothing")).toBeTruthy();
    fireEvent.press(screen.getByTestId("ai-usage-period-all"));
    expect(await screen.findByText("Requests: 12")).toBeTruthy();
    expect(usage).toHaveBeenCalledWith("this_month");
    expect(usage).toHaveBeenCalledWith("all");
  });
});

describe("theme", () => {
  it("is saved to the account as well as applied", async () => {
    useAuthStore.setState({ status: "signedIn" } as never);
    jest.spyOn(profileApi, "me").mockResolvedValue({ id: 8 } as Profile);
    const update = jest.spyOn(profileApi, "update").mockResolvedValue({ id: 8, theme: "dark" } as Profile);
    wrap(<ThemeRow />);
    await waitFor(() => expect(profileApi.me).toHaveBeenCalled());
    await waitFor(() => {
      fireEvent.press(screen.getByTestId("theme-dark"));
      expect(update).toHaveBeenCalledWith(8, { theme: "dark" });
    });
  });
});
