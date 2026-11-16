/**
 * Finance › Overview, Expenses, Income and the entry sheet, at the HTTP layer
 * against a small stateful server (a refetch after a write sees the write).
 * Money arrives as strings, as the real server sends it. Invented data only.
 *
 * What this cannot see: a pixel, the swipe (PanResponder), the native modal,
 * whether a French amount fits 360 dp. Those are the device sweep's.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useFinanceUndo } from "@/stores/financeUndo.store";
import { todayKey } from "@/screens/calendar/dates";
import { router as mockedRouter } from "expo-router";
import { ExpensesTab } from "../tabs/Expenses";
import { IncomeTab } from "../tabs/Income";
import { OverviewTab } from "../tabs/Overview";
import Entry from "../../../../app/finance/entry";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams.current,
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock };
const B = "/api/v1/my_finance_app";
const EXIT = { timeout: 3000 };
const TODAY = todayKey();
let mock: MockAdapter;

const render_ = (el: ReactElement) => render(<QueryClientProvider client={testQueryClient()}>{el}</QueryClientProvider>);
const food = { id: 3, name: "Food", parent_id: null };
const groceries = { id: 4, name: "Groceries", parent_id: 3 };
const expense = (id: number, over: Record<string, unknown> = {}) => ({
  id, item: `Item ${id}`, description: null, amount: "12.5", currency: "eur", spent_at: `${TODAY}T00:00:00.000Z`, tag_id: 3, subcategory_id: null,
  recurring_expense_id: null, category: "Food", tag: food, subcategory: null, labels: [{ id: 3, name: "Food" }], label_ids: [3], ...over,
});

/** A small server: expenses and incomes live in `db`; every read answers from it. */
function serve() {
  const db = {
    expenses: [expense(1, { item: "Lunch" }), expense(2, { item: "Train", amount: "30.0", spent_at: "2026-11-10T00:00:00.000Z" }), expense(3, { item: "Book", amount: "9.0", currency: "usd" })],
    incomes: [{ id: 21, source: "Salary", description: null, amount: "2400.0", currency: "eur", received_at: `${TODAY}T00:00:00.000Z`, tag_id: null, status: "published", recurring_income_id: null, category: null, tag: null, labels: [], label_ids: [] }],
    pending: [{ id: 22, source: "Rent from flat", description: null, amount: "900.0", currency: "eur", received_at: "2026-11-30T00:00:00.000Z", tag_id: null, status: "pending", recurring_income_id: 2, category: null, tag: null, labels: [], label_ids: [] }],
    trashed: [] as number[],
    next: 100,
  };
  const page = (root: string, rows: { amount: string; currency: string }[]) => {
    const totals: Record<string, string> = {};
    for (const r of rows) totals[r.currency] = String(Number(totals[r.currency] ?? 0) + Number(r.amount));
    return [200, { [root]: rows, meta: { totals, pagy: { page: 1, pages: 1 }, total_count: rows.length } }];
  };
  mock.onGet(`${B}/expenses`).reply((cfg) => {
    const q = String(cfg.params?.search ?? "").toLowerCase();
    return page("expenses", db.expenses.filter((e) => !db.trashed.includes(e.id) && (!q || e.item.toLowerCase().includes(q)) && (!cfg.params?.tag_id || e.tag_id === cfg.params.tag_id)));
  });
  mock.onGet(`${B}/incomes`).reply(() => page("incomes", db.incomes));
  mock.onGet(`${B}/incomes/pending`).reply(() => [200, { incomes: db.pending }]);
  mock.onGet(`${B}/tags`).reply(200, { tags: [food, groceries, { id: 9, name: "Work", parent_id: null }], meta: { pagy: { page: 1, pages: 1 } } });
  mock.onDelete(/\/expenses\/\d+$/).reply((cfg) => {
    db.trashed.push(Number(cfg.url!.split("/").pop()));
    return [200, { id: 1, status: "trashed" }];
  });
  mock.onPut(/\/expenses\/\d+\/restore$/).reply((cfg) => {
    const id = Number(cfg.url!.split("/").slice(-2)[0]);
    db.trashed = db.trashed.filter((x) => x !== id);
    return [200, { id, status: "published" }];
  });
  mock.onPost(`${B}/expenses`).reply((cfg) => {
    const body = JSON.parse(cfg.data).expense;
    const made = expense(db.next++, { item: body.item, amount: String(body.amount), currency: body.currency, spent_at: `${body.spent_at}T00:00:00.000Z`, tag_id: body.tag_id, label_ids: body.label_ids });
    db.expenses.unshift(made);
    return [201, { expense: made }];
  });
  mock.onPut(/\/incomes\/\d+\/confirm$/).reply((cfg) => {
    const id = Number(cfg.url!.split("/").slice(-2)[0]);
    const p = db.pending.find((x) => x.id === id)!;
    db.pending = db.pending.filter((x) => x.id !== id);
    const made = { ...p, status: "published", amount: String(JSON.parse(cfg.data).income.amount) };
    db.incomes.unshift(made);
    return [200, { income: made }];
  });
  mock.onDelete(/\/incomes\/\d+\/destroy_permanently$/).reply((cfg) => {
    const id = Number(cfg.url!.split("/").slice(-2)[0]);
    db.pending = db.pending.filter((x) => x.id !== id);
    return [200, { income: {} }];
  });
  return db;
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockParams.current = {};
  router.push.mockClear();
  router.back.mockClear();
  useFinanceUndo.getState().clear();
  await i18n.changeLanguage("en");
});
afterEach(() => mock.restore());
const bodies = (m: "post" | "put", url: string | RegExp) => mock.history[m].filter((r) => (typeof url === "string" ? r.url === url : url.test(r.url ?? ""))).map((r) => (r.data ? JSON.parse(r.data) : null));

describe("Expenses", () => {
  it("shows the month's expenses by day with each day's total, the totals per currency and the count", async () => {
    serve();
    render_(<ExpensesTab />);
    expect(await screen.findByText("Lunch")).toBeTruthy();
    expect(screen.getByText("Train")).toBeTruthy();
    expect(within(screen.getByTestId("finance-expense-totals")).getByText("€42.50 · $9.00")).toBeTruthy();
    expect(screen.getByText("3 entries")).toBeTruthy();
    expect(screen.getByTestId(`finance-expense-day-${TODAY}`)).toBeTruthy();
    expect(screen.getByTestId("finance-expense-day-2026-11-10")).toBeTruthy();
    expect(screen.getAllByText("€30.00")).toHaveLength(2); // the row and its day's total
  });

  it("asks the server for the current month, 50 a page", async () => {
    serve();
    render_(<ExpensesTab />);
    await screen.findByText("Lunch");
    const now = new Date();
    expect(mock.history.get.find((r) => r.url === `${B}/expenses`)!.params).toMatchObject({ page: 1, per_page: 50, year: now.getFullYear(), month: now.getMonth() + 1 });
  });

  it("searches", async () => {
    serve();
    render_(<ExpensesTab />);
    await screen.findByText("Lunch");
    fireEvent.changeText(screen.getByTestId("finance-expense-search"), "trai");
    // The rows stay while the search loads, then only the match is left.
    expect(screen.getByText("Lunch")).toBeTruthy();
    // Let the 300 ms debounce and the request run outside waitFor's act.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    await waitFor(() => expect(screen.queryByText("Lunch")).toBeNull(), EXIT);
    expect(screen.getByText("Train")).toBeTruthy();
  });

  it("opens an expense and deletes it, with Undo that restores it", async () => {
    serve();
    render_(<ExpensesTab />);
    fireEvent.press(await screen.findByTestId("finance-expense-row-1"));
    expect(within(screen.getByTestId("finance-entry-sheet")).getByText("Lunch")).toBeTruthy();
    fireEvent.press(screen.getByTestId("finance-entry-sheet-delete"));
    await waitFor(() => {
      expect(screen.queryByText("Lunch")).toBeNull();
      expect(screen.getByText("Expense deleted")).toBeTruthy();
    }, EXIT);
    fireEvent.press(screen.getByTestId("finance-undo-button"));
    expect(await screen.findByText("Lunch")).toBeTruthy();
    expect(mock.history.put.some((r) => r.url === `${B}/expenses/1/restore`)).toBe(true);
  });

  it("edit opens the entry sheet on that expense", async () => {
    serve();
    render_(<ExpensesTab />);
    fireEvent.press(await screen.findByTestId("finance-expense-row-2"));
    fireEvent.press(screen.getByTestId("finance-entry-sheet-edit"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/finance/entry", params: { kind: "expense", id: "2" } });
  });

  it("with nothing spent, says so for the month", async () => {
    serve().expenses.length = 0;
    render_(<ExpensesTab />);
    expect(await screen.findByTestId("finance-expense-empty")).toBeTruthy();
  });
});

describe("Income", () => {
  it("pins the incomes to confirm above the list; Confirm sends the corrected amount", async () => {
    serve();
    render_(<IncomeTab />);
    expect(await screen.findByText("1 income to confirm")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("finance-pending-amount-22"), "880");
    fireEvent.press(screen.getByTestId("finance-pending-confirm-22"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await waitFor(() => {
      expect(screen.queryByTestId("finance-pending")).toBeNull();
      expect(bodies("put", `${B}/incomes/22/confirm`)).toEqual([{ income: { amount: 880 } }]);
    }, EXIT);
    expect(await screen.findByText("Rent from flat")).toBeTruthy();
  });

  it("Discard asks first, then deletes it for good", async () => {
    serve();
    const alert = jest.spyOn(Alert, "alert");
    render_(<IncomeTab />);
    fireEvent.press(await screen.findByTestId("finance-pending-discard-22"));
    expect(alert.mock.calls[0][0]).toBe("Discard “Rent from flat”?");
    act(() => alert.mock.calls[0][2]!.find((b) => b.style === "destructive")!.onPress!());
    await waitFor(() => expect(screen.queryByTestId("finance-pending")).toBeNull(), EXIT);
    expect(mock.history.delete.some((r) => r.url === `${B}/incomes/22/destroy_permanently`)).toBe(true);
    alert.mockRestore();
  });

  it("shows incomes as money in, with a plus", async () => {
    serve();
    render_(<IncomeTab />);
    expect(await screen.findByText("+€2,400.00")).toBeTruthy();
  });
});

describe("the entry sheet", () => {
  it("adds an expense: amount on the keypad, a name, a subcategory (its category comes too), today", async () => {
    serve();
    mockParams.current = { kind: "expense" };
    render_(<Entry />);
    for (const k of ["1", "2", "dot", "5"]) fireEvent.press(await screen.findByTestId(`finance-entry-pad-${k}`));
    expect(screen.getByTestId("finance-entry-amount-text")).toHaveTextContent("€12.5");
    fireEvent.changeText(screen.getByTestId("finance-entry-name"), "Lunch out");
    fireEvent.press(screen.getByTestId("finance-entry-all-tags"));
    fireEvent.press(await screen.findByTestId("finance-entry-tags-tag-4"));
    fireEvent.press(screen.getByTestId("finance-entry-tags-done"));
    fireEvent.press(screen.getByTestId("finance-entry-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(bodies("post", `${B}/expenses`)).toEqual([
      { expense: { item: "Lunch out", amount: 12.5, currency: "eur", spent_at: TODAY, description: null, tag_id: 3, subcategory_id: 4, label_ids: [3, 4] } },
    ]);
    expect(useFinanceUndo.getState().offer?.message).toBe("Expense saved");
  });

  it("will not save without an amount and a name", async () => {
    serve();
    mockParams.current = { kind: "expense" };
    render_(<Entry />);
    const save = await screen.findByTestId("finance-entry-save");
    expect(save.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(screen.getByTestId("finance-entry-pad-5"));
    expect(screen.getByTestId("finance-entry-save").props.accessibilityState?.disabled).toBe(true);
  });

  it("switches to an income and picks another currency", async () => {
    serve();
    mock.onPost(`${B}/incomes`).reply(201, { income: { id: 30, source: "Gift", amount: "50.0", currency: "usd", status: "published", labels: [], label_ids: [] } });
    mockParams.current = { kind: "expense" };
    render_(<Entry />);
    fireEvent.press(await screen.findByTestId("finance-entry-kind-income"));
    fireEvent.press(screen.getByTestId("finance-entry-pad-5"));
    fireEvent.press(screen.getByTestId("finance-entry-pad-0"));
    fireEvent.press(screen.getByTestId("finance-entry-currency"));
    fireEvent.press(screen.getByTestId("finance-entry-currencies-usd"));
    fireEvent.changeText(screen.getByTestId("finance-entry-name"), "Gift");
    fireEvent.press(screen.getByTestId("finance-entry-save"));
    await waitFor(() => expect(bodies("post", `${B}/incomes`)).toHaveLength(1));
    expect(bodies("post", `${B}/incomes`)[0].income).toMatchObject({ source: "Gift", amount: 50, currency: "usd", received_at: TODAY });
  });
});

describe("Overview", () => {
  it("leads with what was spent, says what people owe both ways, and the budgets nearest their limit", async () => {
    serve();
    mock.onGet(`${B}/expenses/pie_chart_data_by_tag`).reply(200, { chart_data: [{ category: "Food", currency: "eur", amount: "42.5" }], total_spend: { eur: "42.5", usd: "9.0" } });
    mock.onGet(`${B}/reports/summary`).reply(200, { totals: { expenses: { eur: "42.5" }, incomes: { eur: "2400.0" }, net: { eur: "2357.5" } }, by_tag: [] });
    mock.onGet(`${B}/loans`).reply(200, { loans: [{ id: 1, contact_name: "Quinn", loan_type: "given", status: "unpaid", amount: "200.0", currency: "eur", total_paid: "50.0", remaining_amount: "150.0", loan_payments: [] }], meta: { pagy: { page: 1, pages: 1 } } });
    mock.onGet(`${B}/budgets`).reply(200, { budgets: [{ id: 1, amount: "50.0", currency: "eur", period: "monthly", tag_id: 3, tag: food, spent: "45.0", remaining: "5.0" }] });
    mock.onGet(`${B}/reports/cash_flow`).reply(200, { currency: "eur", labels: ["2026-10", "2026-11"], expenses: [0, "42.5"], incomes: ["10.0", "2400.0"] });
    mock.onGet(`${B}/expenses/total_expenses_last_years_or_months`).reply(200, { labels: ["2026-11"], data: ["42.5"] });
    const onOpen = jest.fn();
    render_(<OverviewTab onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByTestId("finance-overview-spent-amount").props.accessibilityLabel).toBe("€42.50"));
    expect(screen.getByText("and $9.00")).toBeTruthy();
    expect(await screen.findByText("€150.00")).toBeTruthy();
    expect(screen.getByText("€45.00 of €50.00")).toBeTruthy();
    expect(screen.getByText("€2,400.00")).toBeTruthy();
    fireEvent.press(screen.getByTestId("finance-overview-receive"));
    expect(onOpen).toHaveBeenCalledWith("loans");
  });
});

describe("in French", () => {
  it("money and words follow the app's language", async () => {
    await i18n.changeLanguage("fr");
    serve();
    render_(<ExpensesTab />);
    expect(await screen.findByText("3 entrées")).toBeTruthy();
    expect(screen.getByText(/€42,50/)).toBeTruthy();
  });
});
