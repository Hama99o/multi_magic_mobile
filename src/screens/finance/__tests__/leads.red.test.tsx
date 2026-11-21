/**
 * Leads from ee's review of the Finance sweep, each one made red before it
 * was fixed: sign-out leaving an Undo behind for the next account, a cleared
 * amount confirming an income at 0, an Undo putting a row into lists it never
 * left, and the export ignoring "One-time". Invented data only.
 */
import MockAdapter from "axios-mock-adapter";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { financeKeys } from "@/api/keys";
import type { Expense, Page } from "@/api/finance";
import { endSession } from "@/lib/sessionEnd";
import { testQueryClient } from "@/__tests__/queryClient";
import { useFinanceUndo } from "@/stores/financeUndo.store";
import { todayKey } from "@/screens/calendar/dates";
import { ExpensesTab } from "../tabs/Expenses";
import { IncomeTab } from "../tabs/Income";
import { useDeleteEntry, useRestoreEntry } from "../useFinanceMutations";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    static downloadFileAsync = jest.fn(async (_url: string, target: { uri: string }) => target);
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
  }
  return { File, Directory, Paths: { cache: { uri: "file:///cache" }, document: { uri: "file:///docs" } } };
});

const files = jest.requireMock("expo-file-system") as { File: { downloadFileAsync: jest.Mock } };
const B = "/api/v1/my_finance_app";
const TODAY = todayKey();
let mock: MockAdapter;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const renderScreen = (el: ReactElement) => render(<QueryClientProvider client={client}>{el}</QueryClientProvider>);

function gated(status: number, body: unknown = {}) {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, reply: async () => (await opened, [status, body] as [number, unknown]) };
}
const expense = (id: number) => ({ id, item: `E${id}`, amount: 10, currency: "eur", day: "2026-11-14" }) as Expense;
const pageOf = <T,>(rows: T[]): InfiniteData<Page<T>> => ({ pages: [{ rows, unreadable: 0, page: 1, pages: 1, count: rows.length, totals: { eur: 10 * rows.length } }], pageParams: [1] });
const NOV = financeKeys.expenses("", null, 2026, 11, false);
const OCT = financeKeys.expenses("", null, 2026, 10, false);
const ids = (key: readonly unknown[]) => client.getQueryData<InfiniteData<Page<Expense>>>(key)!.pages.flatMap((p) => p.rows.map((e) => e.id));
const hookClient = () => testQueryClient({ queries: { gcTime: Infinity, retry: false, staleTime: Infinity }, mutations: { gcTime: Infinity } });

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  files.File.downloadFileAsync.mockClear();
  useFinanceUndo.getState().clear();
  client = hookClient();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  mock.restore();
  client.clear();
});

describe("lead 1: sign-out leaves nothing of Finance for the next account", () => {
  it("the Undo offer is gone after the session ends", () => {
    useFinanceUndo.getState().offerUndo("Expense deleted", () => undefined);
    endSession();
    expect(useFinanceUndo.getState().offer).toBeNull();
  });

  it("a row deleted before sign-out is not put into the next account's list by an Undo of the same id", async () => {
    client.setQueryData(NOV, pageOf([expense(1), expense(2)]));
    mock.onDelete(`${B}/expenses/1`).reply(204);
    const del = renderHook(() => useDeleteEntry("expense"), { wrapper });
    act(() => del.result.current.mutate(expense(1)));
    await waitFor(() => expect(del.result.current.isSuccess).toBe(true));
    del.unmount();

    endSession();
    client.clear();
    client = hookClient(); // the next account, same process
    client.setQueryData(NOV, pageOf([expense(5)]));
    const g = gated(200);
    mock.onPut(`${B}/expenses/1/restore`).reply(g.reply);
    const undo = renderHook(() => useRestoreEntry("expense"), { wrapper });
    act(() => undo.result.current.mutate(1));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(ids(NOV)).toEqual([5]);
    g.open();
    await waitFor(() => expect(undo.result.current.isSuccess).toBe(true));
  });
});

describe("lead 3: Undo puts the row back only into the lists it left", () => {
  it("another month's list does not gain the restored row", async () => {
    client.setQueryData(NOV, pageOf([expense(1), expense(2)]));
    client.setQueryData(OCT, pageOf([expense(7)]));
    mock.onDelete(`${B}/expenses/1`).reply(204);
    const g = gated(200);
    mock.onPut(`${B}/expenses/1/restore`).reply(g.reply);
    const del = renderHook(() => useDeleteEntry("expense"), { wrapper });
    act(() => del.result.current.mutate(expense(1)));
    await waitFor(() => expect(del.result.current.isSuccess).toBe(true));
    const undo = renderHook(() => useRestoreEntry("expense"), { wrapper });
    act(() => undo.result.current.mutate(1));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(ids(NOV)).toEqual([1, 2]);
    expect(ids(OCT)).toEqual([7]);
    expect(client.getQueryData<InfiniteData<Page<Expense>>>(OCT)!.pages[0].count).toBe(1);
    g.open();
    await waitFor(() => expect(undo.result.current.isSuccess).toBe(true));
  });
});

const tags = () => mock.onGet(`${B}/tags`).reply(200, { tags: [], meta: { pagy: { page: 1, pages: 1 } } });
const listPage = (root: string, rows: unknown[]) => [200, { [root]: rows, meta: { totals: { eur: "12.5" }, pagy: { page: 1, pages: 1 }, total_count: rows.length } }] as [number, unknown];

describe("lead 2: a cleared amount cannot confirm a pending income", () => {
  it("clearing the amount and tapping Confirm sends nothing", async () => {
    client = testQueryClient();
    tags();
    mock.onGet(`${B}/incomes`).reply(() => listPage("incomes", []));
    mock.onGet(`${B}/incomes/pending`).reply(200, {
      incomes: [{ id: 22, source: "Rent from flat", description: null, amount: "900.0", currency: "eur", received_at: "2026-11-30T00:00:00.000Z", tag_id: null, status: "pending", recurring_income_id: 2, category: null, tag: null, labels: [], label_ids: [] }],
    });
    mock.onPut(/\/incomes\/22\/confirm$/).reply(200, { income: {} });
    renderScreen(<IncomeTab />);
    fireEvent.changeText(await screen.findByTestId("finance-pending-amount-22"), "");
    fireEvent.press(screen.getByTestId("finance-pending-confirm-22"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(mock.history.put.map((r) => (r.data ? JSON.parse(r.data) : null))).toEqual([]);
  });
});

describe("lead 5: the export is the list on screen", () => {
  it("with One-time on, the export asks for one-time expenses too", async () => {
    client = testQueryClient();
    tags();
    const row = { id: 1, item: "Lunch", description: null, amount: "12.5", currency: "eur", spent_at: `${TODAY}T00:00:00.000Z`, tag_id: null, subcategory_id: null, recurring_expense_id: null, category: null, tag: null, subcategory: null, labels: [], label_ids: [] };
    mock.onGet(`${B}/expenses`).reply(() => listPage("expenses", [row]));
    renderScreen(<ExpensesTab />);
    await screen.findByText("Lunch");
    fireEvent.press(screen.getByTestId("finance-expense-filter-onetime"));
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/expenses` && r.params?.filter === "one_time")).toBe(true));
    await screen.findByText("Lunch");
    fireEvent.press(screen.getByTestId("finance-expense-export"));
    await waitFor(() => expect(files.File.downloadFileAsync).toHaveBeenCalledTimes(1));
    const [url] = files.File.downloadFileAsync.mock.calls[0] as [string];
    expect(url).toContain(`${B}/expenses/export?`);
    expect(new URL(url).searchParams.get("filter")).toBe("one_time");
  });
});
