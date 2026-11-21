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
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
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

/** Two taps in the same frame, before any re-render: what a double tap is (hidden-criteria sweep). */
const doubleTap = (el: Parameters<typeof fireEvent.press>[0]) => {
  fireEvent.press(el);
  fireEvent.press(el);
};

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

/**
 * Wait until `ready()` is true, each pause passing inside act(); then assert
 * with a real expect for the message.
 *
 * Why not waitFor(() => expect(row).toBeNull()): measured 2026-11-18, one
 * FAILED check costs ~2 s, because Jest pretty-prints the whole matched
 * element into its error message. So waitFor managed one or two checks in its
 * 3 s, these tests took 2.5–5.6 s each, and under load ("searches", "deletes
 * it, with Undo", "Discard") they ran out before the screen was checked again
 * — "Lunch" still on screen. A boolean check is free; pausing inside act lets
 * the mocked request's update through at once.
 */
async function until(ready: () => boolean, { timeout }: { timeout: number } = EXIT) {
  const end = Date.now() + timeout;
  while (!ready()) {
    if (Date.now() > end) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
}
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
    incomes: [{ id: 21, source: "Salary", description: null, amount: "2400.0", currency: "eur", received_at: `${TODAY}T00:00:00.000Z`, tag_id: null, status: "published", recurring_income_id: null as number | null, category: null, tag: null, labels: [], label_ids: [] }],
    pending: [{ id: 22, source: "Rent from flat", description: null, amount: "900.0", currency: "eur", received_at: "2026-11-30T00:00:00.000Z", tag_id: null, status: "pending", recurring_income_id: 2, category: null, tag: null, labels: [], label_ids: [] }],
    trashed: [] as number[],
    next: 100,
  };
  const page = (root: string, rows: { amount: string; currency: string }[]): [number, unknown] => {
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
  // The currency last used is remembered per phone (SPEC B7) in AsyncStorage,
  // whose jest mock lasts the whole file: after the USD income test the next
  // entry started in dollars ("$12.5", seed -1051049791). Each test starts
  // from no memory, i.e. euros.
  const storage = require("@react-native-async-storage/async-storage");
  await (storage.default ?? storage).removeItem("finance_last_currency");
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
    await until(() => !screen.queryByText("Lunch"));
    expect(screen.queryByText("Lunch")).toBeNull();
    expect(screen.getByText("Train")).toBeTruthy();
  });

  it("opens an expense and deletes it, with Undo that restores it", async () => {
    serve();
    render_(<ExpensesTab />);
    fireEvent.press(await screen.findByTestId("finance-expense-row-1"));
    expect(within(screen.getByTestId("finance-entry-sheet")).getByText("Lunch")).toBeTruthy();
    fireEvent.press(screen.getByTestId("finance-entry-sheet-delete"));
    await until(() => !screen.queryByText("Lunch") && Boolean(screen.queryByText("Expense deleted")));
    expect(screen.queryByText("Lunch")).toBeNull();
    expect(screen.getByText("Expense deleted")).toBeTruthy();
    fireEvent.press(screen.getByTestId("finance-undo-button"));
    await until(() => Boolean(screen.queryByText("Lunch")));
    expect(screen.getByText("Lunch")).toBeTruthy();
    expect(mock.history.put.some((r) => r.url === `${B}/expenses/1/restore`)).toBe(true);
  });

  it("edit opens the entry sheet on that expense", async () => {
    serve();
    render_(<ExpensesTab />);
    fireEvent.press(await screen.findByTestId("finance-expense-row-2"));
    fireEvent.press(screen.getByTestId("finance-entry-sheet-edit"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/finance/entry", params: { kind: "expense", id: "2" } });
  });

  it("steps into the months ahead, up to five years, for post-dated entries", async () => {
    serve();
    render_(<ExpensesTab />);
    await screen.findByText("Lunch");
    const now = new Date();
    fireEvent.press(screen.getByTestId("finance-expense-period-next"));
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await until(() => mock.history.get.some((r) => r.url === `${B}/expenses` && r.params?.month === next.getMonth() + 1));
    expect(mock.history.get.filter((r) => r.url === `${B}/expenses`).pop()!.params).toMatchObject({ year: next.getFullYear(), month: next.getMonth() + 1 });
    // The whole year, then on to the last year allowed: the arrow stops there.
    fireEvent.press(screen.getByTestId("finance-expense-period-mode"));
    for (let i = 0; i < 6; i++) fireEvent.press(screen.getByTestId("finance-expense-period-next"));
    expect(screen.getByTestId("finance-expense-period-label")).toHaveTextContent(String(now.getFullYear() + 5));
    expect(screen.getByTestId("finance-expense-period-next").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("All time lists every date: the server is asked with no year and no month", async () => {
    serve();
    render_(<ExpensesTab />);
    await screen.findByText("Lunch");
    fireEvent.press(screen.getByTestId("finance-expense-period-mode"));
    fireEvent.press(screen.getByTestId("finance-expense-period-mode"));
    expect(screen.getByTestId("finance-expense-period-label")).toHaveTextContent("All time");
    expect(screen.queryByTestId("finance-expense-period-prev")).toBeNull();
    await until(() => mock.history.get.some((r) => r.url === `${B}/expenses` && r.params?.year === undefined));
    const last = mock.history.get.filter((r) => r.url === `${B}/expenses`).pop()!.params;
    expect(last.year).toBeUndefined();
    expect(last.month).toBeUndefined();
    fireEvent.press(screen.getByTestId("finance-expense-period-mode"));
    expect(screen.getByTestId("finance-expense-period-label")).not.toHaveTextContent("All time");
  });

  it("a link to an expense opens the Expenses tab on that expense's sheet", async () => {
    serve();
    mock.onGet(`${B}/expenses/2`).reply(200, { expense: expense(2, { item: "Train", amount: "30.0", spent_at: "2026-11-10T00:00:00.000Z" }) });
    render_(<ExpensesTab openId={2} />);
    await until(() => Boolean(screen.queryByTestId("finance-entry-sheet")));
    expect(within(screen.getByTestId("finance-entry-sheet")).getByText("Train")).toBeTruthy();
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
    await until(() => !screen.queryByTestId("finance-pending") && bodies("put", `${B}/incomes/22/confirm`).length > 0);
    expect(screen.queryByTestId("finance-pending")).toBeNull();
    expect(bodies("put", `${B}/incomes/22/confirm`)).toEqual([{ income: { amount: 880 } }]);
    await until(() => Boolean(screen.queryByText("Rent from flat")));
    expect(screen.getByText("Rent from flat")).toBeTruthy();
  });

  it("Discard asks first, then deletes it for good", async () => {
    serve();
    const alert = jest.spyOn(Alert, "alert");
    render_(<IncomeTab />);
    fireEvent.press(await screen.findByTestId("finance-pending-discard-22"));
    expect(alert.mock.calls[0][0]).toBe("Discard “Rent from flat”?");
    act(() => alert.mock.calls[0][2]!.find((b) => b.style === "destructive")!.onPress!());
    await until(() => !screen.queryByTestId("finance-pending"));
    expect(screen.queryByTestId("finance-pending")).toBeNull();
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
    doubleTap(screen.getByTestId("finance-entry-save"));
    await until(() => router.back.mock.calls.length > 0);
    expect(router.back).toHaveBeenCalled();
    expect(bodies("post", `${B}/expenses`)).toEqual([
      { expense: { item: "Lunch out", amount: 12.5, currency: "eur", spent_at: TODAY, description: null, tag_id: 3, subcategory_id: 4, label_ids: [3, 4] } },
    ]);
    expect(useFinanceUndo.getState().offer?.message).toBe("Expense saved");
  });

  it("an expense can have no date, as on the web: No date sends spent_at null", async () => {
    serve();
    mockParams.current = { kind: "expense" };
    render_(<Entry />);
    for (const k of ["9"]) fireEvent.press(await screen.findByTestId(`finance-entry-pad-${k}`));
    fireEvent.changeText(screen.getByTestId("finance-entry-name"), "Old receipt");
    fireEvent.press(screen.getByTestId("finance-entry-day-none"));
    fireEvent.press(screen.getByTestId("finance-entry-save"));
    await until(() => router.back.mock.calls.length > 0);
    expect(bodies("post", `${B}/expenses`)[0].expense.spent_at).toBeNull();
  });

  it("editing an undated expense keeps it undated (it never becomes today)", async () => {
    serve();
    mock.onGet(`${B}/expenses/5`).reply(200, { expense: expense(5, { item: "Old receipt", spent_at: null }) });
    mock.onPut(`${B}/expenses/5`).reply((cfg) => [200, { expense: expense(5, JSON.parse(cfg.data).expense) }]);
    mockParams.current = { kind: "expense", id: "5" };
    render_(<Entry />);
    expect(await screen.findByDisplayValue("Old receipt")).toBeTruthy();
    expect(screen.getByTestId("finance-entry-day-none").props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId("finance-entry-save"));
    await until(() => router.back.mock.calls.length > 0);
    expect(bodies("put", `${B}/expenses/5`)[0].expense.spent_at).toBeNull();
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
    await until(() => bodies("post", `${B}/incomes`).length > 0);
    expect(bodies("post", `${B}/incomes`)).toHaveLength(1);
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
    await until(() => screen.queryByTestId("finance-overview-spent-amount")?.props.accessibilityLabel === "€42.50");
    expect(screen.getByTestId("finance-overview-spent-amount").props.accessibilityLabel).toBe("€42.50");
    expect(screen.getByText("and $9.00")).toBeTruthy();
    expect(await screen.findByText("€150.00")).toBeTruthy();
    expect(screen.getByText("€45.00 of €50.00")).toBeTruthy();
    expect(screen.getByText("€2,400.00")).toBeTruthy();
    fireEvent.press(screen.getByTestId("finance-overview-receive"));
    expect(onOpen).toHaveBeenCalledWith("loans");
  });
});

describe("Overview: active loans (the web's dashboard card)", () => {
  it("lists the unpaid loans, five at most, each with who, which way, what is left of what, and opens one", async () => {
    serve();
    mock.onGet(`${B}/expenses/pie_chart_data_by_tag`).reply(200, { chart_data: [], total_spend: {} });
    mock.onGet(`${B}/reports/summary`).reply(200, { totals: { expenses: {}, incomes: {}, net: {} }, by_tag: [] });
    mock.onGet(`${B}/budgets`).reply(200, { budgets: [] });
    mock.onGet(`${B}/reports/cash_flow`).reply(200, { currency: "eur", labels: [], expenses: [], incomes: [] });
    mock.onGet(`${B}/expenses/total_expenses_last_years_or_months`).reply(200, { labels: [], data: [] });
    const loans = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, contact_name: `Person ${i + 1}`, loan_type: i === 1 ? "taken" : "given", status: "unpaid", amount: "200.0", currency: "eur", total_paid: "50.0", remaining_amount: "150.0", due_date: i === 0 ? "2026-12-24" : null, loan_payments: [] }));
    mock.onGet(`${B}/loans`).reply(200, { loans, meta: { pagy: { page: 1, pages: 1 } } });
    render_(<OverviewTab onOpen={jest.fn()} />);
    await until(() => Boolean(screen.queryByTestId("finance-overview-loan-1")));
    const card = screen.getByTestId("finance-overview-loans");
    expect(within(card).getAllByTestId(/^finance-overview-loan-\d+$/)).toHaveLength(5);
    expect(within(card).queryByText("Person 6")).toBeNull();
    const first = within(card).getByTestId("finance-overview-loan-1");
    expect(within(first).getByText("Person 1")).toBeTruthy();
    expect(within(first).getByText(/^Lent/)).toBeTruthy();
    expect(within(first).getByText("€150.00 of €200.00")).toBeTruthy();
    expect(within(within(card).getByTestId("finance-overview-loan-2")).getByText(/^Borrowed/)).toBeTruthy();
    fireEvent.press(first);
    expect(router.push).toHaveBeenCalledWith({ pathname: "/finance/loan", params: { id: "1" } });
  });

  it("shows no card when nothing is owed either way", async () => {
    serve();
    mock.onGet(`${B}/expenses/pie_chart_data_by_tag`).reply(200, { chart_data: [], total_spend: {} });
    mock.onGet(`${B}/reports/summary`).reply(200, { totals: { expenses: {}, incomes: {}, net: {} }, by_tag: [] });
    mock.onGet(`${B}/budgets`).reply(200, { budgets: [] });
    mock.onGet(`${B}/reports/cash_flow`).reply(200, { currency: "eur", labels: [], expenses: [], incomes: [] });
    mock.onGet(`${B}/expenses/total_expenses_last_years_or_months`).reply(200, { labels: [], data: [] });
    mock.onGet(`${B}/loans`).reply(200, { loans: [], meta: { pagy: { page: 1, pages: 1 } } });
    render_(<OverviewTab onOpen={jest.fn()} />);
    await until(() => Boolean(screen.queryByTestId("finance-overview-budgets-empty")));
    expect(screen.queryByTestId("finance-overview-loans")).toBeNull();
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
