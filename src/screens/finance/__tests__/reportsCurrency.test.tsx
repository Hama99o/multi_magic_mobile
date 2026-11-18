/**
 * One category spent in two currencies is two rows in Reports; each names its
 * currency, or the two read as a duplicate (device QA, 2026-11-16).
 */
import MockAdapter from "axios-mock-adapter";
import { render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import Reports from "../../../../app/finance/reports";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) }, useLocalSearchParams: () => ({}) }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

let mock: MockAdapter;
beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
});
afterEach(() => mock.restore());

const summary = (byTag: unknown[]) => ({ totals: { expenses: { eur: "85.1", usd: "19.99" }, incomes: {}, net: {} }, by_tag: byTag });

it("names the currency on each row when the categories span several", async () => {
  mock.onGet("/api/v1/my_finance_app/reports/summary").reply(200, summary([{ tag: "Food", currency: "eur", amount: "85.1" }, { tag: "Food", currency: "usd", amount: "19.99" }]));
  render(<QueryClientProvider client={testQueryClient()}><Reports /></QueryClientProvider>);
  expect(await screen.findByText("Food · EUR")).toBeTruthy();
  expect(screen.getByText("Food · USD")).toBeTruthy();
});

it("keeps the plain name when there is one currency", async () => {
  mock.onGet("/api/v1/my_finance_app/reports/summary").reply(200, summary([{ tag: "Food", currency: "eur", amount: "85.1" }]));
  render(<QueryClientProvider client={testQueryClient()}><Reports /></QueryClientProvider>);
  expect(await screen.findByText("Food")).toBeTruthy();
});
