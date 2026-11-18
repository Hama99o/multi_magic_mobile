/**
 * The Finance app at the HTTP layer, in the server's own shapes
 * (`MyFinanceApp::*Serializer`, the controllers' params), read 2026-11-16 at
 * multi_magic 0986d1e4 (`docs/design/finance/WEB_INVENTORY.md`). The quirks
 * are the point: money arrives as STRINGS ("12.5") and sometimes as the
 * integer 0, totals are maps per currency, delete answers the raw record.
 * Invented data only: this repo is public.
 */
import MockAdapter from "axios-mock-adapter";
import { financeApi, formatMoney, formatTotals, money, __parse } from "../finance";
import { ApiShapeError } from "../parse";
import { __resetTokenCache, apiErrorMessage, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

const B = "/api/v1/my_finance_app";
let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
});
afterEach(() => mock.restore());

const tag = { id: 3, name: "Food", created_at: "x", parent_id: null, position: 0, description: null, color: "no_color" };
const sub = { ...tag, id: 4, name: "Groceries", parent_id: 3 };
const expense = {
  id: 11, item: "Lunch", description: null, amount: "12.5", currency: "eur", spent_at: "2026-11-14T00:00:00.000Z", deleted_at: null,
  tag_id: 3, subcategory_id: 4, recurring_expense_id: null, category: "Food", tag, subcategory: sub, amount_with_currency: "12.5 eur",
  labels: [{ id: 3, name: "Food" }, { id: 9, name: "Work" }], label_ids: [3, 4, 9],
};
const income = { id: 21, source: "Salary", description: "Nov", amount: "2400.0", currency: "eur", received_at: "2026-11-01T00:00:00.000Z", deleted_at: null, tag_id: null, status: "published", recurring_income_id: 2, category: null, tag: null, amount_with_currency: "2400.0 eur", labels: [], label_ids: [] };
const loan = {
  id: 31, description: "Rent help", due_date: "2026-12-01", amount: "200.0", contact_name: "Quinn QA", loan_type: "given", status: "unpaid", currency: "eur", tag_id: null,
  total_paid: "50.0", remaining_amount: "150.0", category: null,
  loan_payments: [{ id: 5, loan_id: 31, amount: "50.0", payment_date: "2026-11-10T00:00:00.000Z", created_at: "x", updated_at: "x" }],
  amount_with_currency: "200.0 eur", labels: [], label_ids: [],
};
const page = (root: string, rows: unknown[], over: Record<string, unknown> = {}) => ({ [root]: rows, meta: { totals: { eur: "12.5", usd: "3.0" }, pagy: { page: 1, pages: 2, count: 60 }, total_count: 60, ...over } });

describe("money", () => {
  it("reads the server's strings, its integer 0, and refuses what is not a number", () => {
    expect(money("12.5")).toBe(12.5);
    expect(money(0)).toBe(0);
    expect(money("0.0")).toBe(0);
    expect(money(null)).toBe(0);
    expect(() => money("abc")).toThrow(ApiShapeError);
  });

  it("formats like the web: symbol, the app's language, two decimals, the minus before the symbol", () => {
    expect(formatMoney(1234.5, "eur", "en")).toBe("€1,234.50");
    expect(formatMoney(-1.49, "usd", "en")).toBe("-$1.49");
    expect(formatMoney(1234.5, "eur", "fr").replace(/\s/g, " ")).toBe("€1 234,50");
    expect(formatMoney(3, "afn", "en")).toBe("؋3.00");
  });

  it("never adds currencies: a total is each currency, zeros dropped, the biggest first", () => {
    expect(formatTotals({ usd: 5, eur: 12, gbp: 0 }, "en")).toBe("€12.00 · $5.00");
    expect(formatTotals({}, "en")).toBe("");
  });
});

describe("expenses", () => {
  it("lists a page 50 at a time with filters, totals per currency and the count", async () => {
    mock.onGet(`${B}/expenses`, { params: { page: 2, per_page: 50, search: "lunch", tag_id: 3, year: 2026, month: 11, filter: "one_time" } }).reply(200, page("expenses", [expense]));
    const p = await financeApi.expenses.list({ page: 2, search: " lunch ", tagId: 3, year: 2026, month: 11, oneTime: true });
    expect(p.rows[0]).toMatchObject({ id: 11, item: "Lunch", amount: 12.5, currency: "eur", day: "2026-11-14", tagId: 3, subcategoryId: 4, labelIds: [3, 4, 9] });
    expect(p.rows[0].tag).toEqual({ id: 3, name: "Food", parentId: null });
    expect(p.rows[0].subcategory).toEqual({ id: 4, name: "Groceries", parentId: 3 });
    expect(p.totals).toEqual({ eur: 12.5, usd: 3 });
    expect([p.page, p.pages, p.count]).toEqual([1, 2, 60]);
  });

  it("creates with the web's tag logic: the sub's parent is the category, every picked tag a label", async () => {
    mock.onPost(`${B}/expenses`).reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ expense: { item: "Lunch", amount: 12.5, currency: "eur", spent_at: "2026-11-14", description: null, tag_id: 3, subcategory_id: 4, label_ids: [3, 4, 9] } });
      return [201, { expense }];
    });
    await financeApi.expenses.create({ name: "Lunch", amount: 12.5, currency: "eur", day: "2026-11-14", description: null, tags: [tag, sub, { id: 9, name: "Work", parentId: null }].map(__parse.parseTag) });
  });

  it("deletes to the trash (raw record answer) and restores", async () => {
    mock.onDelete(`${B}/expenses/11`).reply(200, { id: 11, status: "trashed", user_id: 1 });
    await financeApi.expenses.remove(11);
    mock.onPut(`${B}/expenses/11/restore`).reply(200, { id: 11, status: "published" });
    await financeApi.expenses.restore(11);
  });

  it("reads the category chart and the totals over time", async () => {
    mock.onGet(`${B}/expenses/pie_chart_data_by_tag`, { params: { year: 2026, month: 11 } }).reply(200, { chart_data: [{ category: "Food", currency: "eur", amount: "80.5" }], total_spend: { eur: "100.0" } });
    const pie = await financeApi.expenses.byCategory({ year: 2026, month: 11 });
    expect(pie).toEqual({ slices: [{ label: "Food", currency: "eur", amount: 80.5 }], total: { eur: 100 } });
    mock.onGet(`${B}/expenses/total_expenses_last_years_or_months`, { params: { chart_type: "months", currency: "eur" } }).reply(200, { labels: ["2026-10", "2026-11"], data: ["10.0", 0] });
    expect(await financeApi.expenses.overTime("months", "eur")).toEqual([{ label: "2026-10", amount: 10 }, { label: "2026-11", amount: 0 }]);
  });
});

describe("incomes", () => {
  it("lists, reads the pending ones, confirms with an amount, and discards for good", async () => {
    mock.onGet(`${B}/incomes`, { params: { page: 1, per_page: 50, year: 2026, month: 11 } }).reply(200, page("incomes", [income]));
    expect((await financeApi.incomes.list({ page: 1, year: 2026, month: 11 })).rows[0]).toMatchObject({ source: "Salary", amount: 2400, status: "published", recurringIncomeId: 2 });
    mock.onGet(`${B}/incomes/pending`).reply(200, { incomes: [{ ...income, id: 22, status: "pending" }] });
    expect((await financeApi.incomes.pending())[0].status).toBe("pending");
    mock.onPut(`${B}/incomes/22/confirm`).reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ income: { amount: 2350 } });
      return [200, { income: { ...income, id: 22 } }];
    });
    await financeApi.incomes.confirm(22, 2350);
    mock.onDelete(`${B}/incomes/22/destroy_permanently`).reply(200, { income: {} });
    await financeApi.incomes.destroyForever(22);
  });
});

describe("loans", () => {
  it("reads remaining, paid and the payments, money parsed", async () => {
    mock.onGet(`${B}/loans`, { params: { page: 1, per_page: 50, loan_type: "given" } }).reply(200, page("loans", [loan]));
    const l = (await financeApi.loans.list({ page: 1, type: "given" })).rows[0];
    expect(l).toMatchObject({ id: 31, contactName: "Quinn QA", type: "given", status: "unpaid", amount: 200, totalPaid: 50, remaining: 150, dueDate: "2026-12-01" });
    expect(l.payments).toEqual([{ id: 5, amount: 50, day: "2026-11-10" }]);
  });

  it("reads a loan with no payment, whose total_paid is the integer 0", () => {
    expect(__parse.parseLoan({ ...loan, total_paid: 0, remaining_amount: "200.0", loan_payments: [] })).toMatchObject({ totalPaid: 0, remaining: 200, payments: [] });
  });

  it("adds a payment (the loan comes back) and says why the server refused one", async () => {
    mock.onPost(`${B}/loans/31/create_payment`).replyOnce((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ loan_payment: { amount: 150, payment_date: "2026-11-16" } });
      return [200, { status: "success", loan: { ...loan, status: "paid", total_paid: "200.0", remaining_amount: "0.0" } }];
    });
    expect((await financeApi.loans.addPayment(31, 150, "2026-11-16")).status).toBe("paid");
    mock.onPost(`${B}/loans/31/create_payment`).replyOnce(422, { status: "error", errors: ["Amount must be less than or equal to 150.0"] });
    const refused = await financeApi.loans.addPayment(31, 999, "2026-11-16").catch((e: unknown) => e);
    expect(apiErrorMessage(refused)).toBe("Amount must be less than or equal to 150.0");
    mock.onDelete(`${B}/loan_payments/5`).reply(200, { message: "ok" });
    await financeApi.loans.removePayment(5);
  });

  it("sums To receive and To pay over EVERY unpaid loan, per currency (the web sums page 1 only)", async () => {
    mock.onGet(`${B}/loans`, { params: { page: 1, per_page: 100 } }).reply(200, { loans: [loan, { ...loan, id: 32, remaining_amount: "10.0", currency: "usd" }], meta: { pagy: { page: 1, pages: 2 } } });
    mock.onGet(`${B}/loans`, { params: { page: 2, per_page: 100 } }).reply(200, { loans: [{ ...loan, id: 33, loan_type: "taken", remaining_amount: "40.0" }], meta: { pagy: { page: 2, pages: 2 } } });
    expect(await financeApi.loans.outstanding()).toEqual({ receive: { eur: 150, usd: 10 }, pay: { eur: 40 }, receiveCount: 2, payCount: 1 });
  });
});

describe("budgets, recurring, tags, reports", () => {
  it("budgets: spent and remaining parsed, overall when no category", async () => {
    mock.onGet(`${B}/budgets`).reply(200, { budgets: [{ id: 1, amount: "300.0", currency: "eur", period: "monthly", tag_id: null, tag: null, spent: "120.0", remaining: "180.0" }] });
    expect((await financeApi.budgets.list())[0]).toEqual({ id: 1, amount: 300, currency: "eur", period: "monthly", tag: null, spent: 120, remaining: 180 });
  });

  it("recurring: frequency, interval, next date, paused; Run now for an income", async () => {
    mock.onGet(`${B}/recurring_expenses`).reply(200, { recurring_expenses: [{ id: 2, item: "Gym", description: null, amount: "30.0", currency: "eur", frequency: "monthly", interval_count: 1, start_date: "2026-01-05", next_occurrence_on: "2026-12-05", last_generated_on: "2026-11-05", active: false, tag_id: null, subcategory_id: null, tag: null, subcategory: null }] });
    expect((await financeApi.recurring.list("expense"))[0]).toMatchObject({ id: 2, name: "Gym", amount: 30, frequency: "monthly", intervalCount: 1, nextOn: "2026-12-05", active: false });
    mock.onPost(`${B}/recurring_incomes/3/run`).reply(201, { income });
    expect((await financeApi.recurring.runIncome(3)).source).toBe("Salary");
  });

  it("tags: every page of all=true, by name", async () => {
    mock.onGet(`${B}/tags`, { params: { all: true, page: 1 } }).reply(200, { tags: [tag], meta: { pagy: { page: 1, pages: 2 } } });
    mock.onGet(`${B}/tags`, { params: { all: true, page: 2 } }).reply(200, { tags: [sub], meta: { pagy: { page: 2, pages: 2 } } });
    expect(await financeApi.tags.all()).toEqual([{ id: 3, name: "Food", parentId: null }, { id: 4, name: "Groceries", parentId: 3 }]);
  });

  it("reports: totals per currency for a month, spend by category", async () => {
    mock.onGet(`${B}/reports/summary`, { params: { year: 2026, month: 11 } }).reply(200, { year: 2026, month: 11, totals: { expenses: { eur: "100.0" }, incomes: { eur: "2400.0" }, net: { eur: "2300.0" } }, by_tag: [{ tag: "Food", currency: "eur", amount: "80.0" }] });
    expect(await financeApi.reports.summary(2026, 11)).toEqual({ expenses: { eur: 100 }, incomes: { eur: 2400 }, net: { eur: 2300 }, byCategory: [{ label: "Food", currency: "eur", amount: 80 }] });
    mock.onGet(`${B}/reports/cash_flow`, { params: { currency: "eur" } }).reply(200, { currency: "eur", labels: ["2026-10", "2026-11"], expenses: [0, "100.0"], incomes: ["10.0", 0] });
    expect(await financeApi.reports.cashFlow("eur")).toEqual([{ label: "2026-10", expenses: 0, incomes: 10 }, { label: "2026-11", expenses: 100, incomes: 0 }]);
  });
});
