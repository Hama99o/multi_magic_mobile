/**
 * The Finance app — `docs/design/finance/SPEC.md`.
 *
 * Every call the web's `pages/finance/**` makes against
 * `Api::V1::MyFinanceApp::*`, read 2026-11-16 at multi_magic 0986d1e4; the
 * full inventory is `docs/design/finance/WEB_INVENTORY.md`. Bodies use the
 * server's names; nothing here converts case.
 *
 * ── MONEY ARRIVES AS STRINGS ─────────────────────────────────────────────
 * The columns are decimals, which Rails sends as JSON strings ("12.5"), and a
 * few aggregates are the integer 0 (a loan with no payment, an empty month).
 * `money()` reads both, and refuses anything else rather than show NaN.
 *
 * ── CURRENCIES ARE NEVER ADDED ───────────────────────────────────────────
 * Each record has its own currency, and every total is a map per currency
 * (`Totals`). `formatTotals` shows "€12.00 · $5.00", as the web does.
 *
 * ── DAYS ARE UTC MIDNIGHT ────────────────────────────────────────────────
 * `spent_at` / `received_at` / `payment_date` are the picked day at UTC
 * midnight; the day is read as the date part (`day`), never through the
 * phone's time zone, which would shift it a day west of Greenwich.
 *
 * ── PAGE SIZE ────────────────────────────────────────────────────────────
 * Lists ask for 50 a page (`per_page`, multi_magic PR #28). A server without
 * that PR answers its own size (5 or 12) and says how many pages there are,
 * so paging still reaches everything, in more requests.
 */
import { File, Paths } from "expo-file-system";
import { authHeaders, BASE_URL, http } from "./http";
import { ApiShapeError, arr, id, obj, optStr, readableRows, str } from "./parse";

const B = "/api/v1/my_finance_app";
export const PER_PAGE = 50;

export const CURRENCIES = ["eur", "usd", "gbp", "afn", "pkr", "inr", "jpy", "cny"] as const;
export type Currency = (typeof CURRENCIES)[number];
/** The web's `CURRENCY_SYMBOLS`. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = { eur: "€", usd: "$", gbp: "£", afn: "؋", pkr: "₨", inr: "₹", jpy: "¥", cny: "¥" };
export type Totals = Partial<Record<Currency, number>>;

export type LoanType = "given" | "taken";
export type LoanStatus = "paid" | "unpaid" | "trashed";
export type IncomeStatus = "published" | "pending" | "trashed";
export type Frequency = "daily" | "weekly" | "monthly" | "yearly";
export const FREQUENCIES: readonly Frequency[] = ["daily", "weekly", "monthly", "yearly"];
export type BudgetPeriod = "monthly" | "yearly";

export interface Tag {
  id: number;
  name: string;
  /** null: a category; a number: a subcategory of that category. */
  parentId: number | null;
}
export interface Label {
  id: number;
  name: string;
}

export interface Expense {
  id: number;
  item: string;
  description: string | null;
  amount: number;
  currency: Currency;
  /** `YYYY-MM-DD`, or null when never set (the server then dates it by creation). */
  day: string | null;
  tagId: number | null;
  subcategoryId: number | null;
  tag: Tag | null;
  subcategory: Tag | null;
  labels: Label[];
  labelIds: number[];
  recurringId: number | null;
}

export interface Income {
  id: number;
  source: string;
  description: string | null;
  amount: number;
  currency: Currency;
  day: string | null;
  tagId: number | null;
  tag: Tag | null;
  labels: Label[];
  labelIds: number[];
  status: IncomeStatus;
  recurringIncomeId: number | null;
}

export interface LoanPayment {
  id: number;
  amount: number;
  day: string | null;
}

export interface Loan {
  id: number;
  contactName: string;
  description: string | null;
  type: LoanType;
  status: LoanStatus;
  amount: number;
  currency: Currency;
  dueDate: string | null;
  totalPaid: number;
  remaining: number;
  tagId: number | null;
  category: string | null;
  labels: Label[];
  labelIds: number[];
  payments: LoanPayment[];
}

export interface Budget {
  id: number;
  amount: number;
  currency: Currency;
  period: BudgetPeriod;
  tag: Tag | null;
  spent: number;
  remaining: number;
}

export interface Recurring {
  id: number;
  kind: "expense" | "income";
  /** The item (expense) or the source (income). */
  name: string;
  description: string | null;
  amount: number;
  currency: Currency;
  frequency: Frequency;
  intervalCount: number;
  startDate: string;
  nextOn: string | null;
  active: boolean;
  tag: Tag | null;
}

export interface Page<T> {
  rows: T[];
  unreadable: number;
  page: number;
  pages: number;
  count: number;
  totals: Totals;
}

export interface Slice {
  label: string;
  currency: Currency;
  amount: number;
}

// ── parsing ─────────────────────────────────────────────────────────────

/** A money value: the server's decimal string, or a plain number (its 0). */
export function money(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw new ApiShapeError("money", value);
  return n;
}

function currency(value: unknown): Currency {
  return CURRENCIES.includes(value as Currency) ? (value as Currency) : "eur";
}

function totals(value: unknown): Totals {
  const out: Totals = {};
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CURRENCIES.includes(k as Currency)) out[k as Currency] = money(v);
    }
  }
  return out;
}

/** The date part of an ISO time or a date: the picked day, never shifted. */
const day = (value: unknown): string | null => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);
const optId = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const ids = (value: unknown): number[] => (Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : []);

function parseTag(raw: unknown): Tag {
  const t = obj(raw, "tag");
  return { id: id(t.id, "tag.id"), name: str(t.name, "tag.name"), parentId: optId(t.parent_id) };
}
const optTag = (raw: unknown): Tag | null => (raw && typeof raw === "object" ? parseTag(raw) : null);

function labels(raw: unknown): Label[] {
  return Array.isArray(raw)
    ? raw.flatMap((l) => {
        const x = l as Record<string, unknown> | null;
        return typeof x?.id === "number" && typeof x?.name === "string" ? [{ id: x.id, name: x.name }] : [];
      })
    : [];
}

function parseExpense(raw: unknown): Expense {
  const e = obj(raw, "expense");
  return {
    id: id(e.id, "expense.id"),
    item: typeof e.item === "string" ? e.item : "",
    description: optStr(e.description) || null,
    amount: money(e.amount),
    currency: currency(e.currency),
    day: day(e.spent_at),
    tagId: optId(e.tag_id),
    subcategoryId: optId(e.subcategory_id),
    tag: optTag(e.tag),
    subcategory: optTag(e.subcategory),
    labels: labels(e.labels),
    labelIds: ids(e.label_ids),
    recurringId: optId(e.recurring_expense_id),
  };
}

function parseIncome(raw: unknown): Income {
  const i = obj(raw, "income");
  const status = i.status === "pending" || i.status === "trashed" ? i.status : "published";
  return {
    id: id(i.id, "income.id"),
    source: typeof i.source === "string" ? i.source : "",
    description: optStr(i.description) || null,
    amount: money(i.amount),
    currency: currency(i.currency),
    day: day(i.received_at),
    tagId: optId(i.tag_id),
    tag: optTag(i.tag),
    labels: labels(i.labels),
    labelIds: ids(i.label_ids),
    status,
    recurringIncomeId: optId(i.recurring_income_id),
  };
}

function parseLoan(raw: unknown): Loan {
  const l = obj(raw, "loan");
  const payments = Array.isArray(l.loan_payments)
    ? readableRows(l.loan_payments, (p) => {
        const x = obj(p, "loan_payment");
        return { id: id(x.id, "loan_payment.id"), amount: money(x.amount), day: day(x.payment_date) ?? day(x.created_at) };
      }).rows
    : [];
  return {
    id: id(l.id, "loan.id"),
    contactName: typeof l.contact_name === "string" ? l.contact_name : "",
    description: optStr(l.description) || null,
    type: l.loan_type === "taken" ? "taken" : "given",
    status: l.status === "paid" || l.status === "trashed" ? l.status : "unpaid",
    amount: money(l.amount),
    currency: currency(l.currency),
    dueDate: day(l.due_date),
    totalPaid: money(l.total_paid),
    remaining: money(l.remaining_amount),
    tagId: optId(l.tag_id),
    category: optStr(l.category),
    labels: labels(l.labels),
    labelIds: ids(l.label_ids),
    payments,
  };
}

function parseBudget(raw: unknown): Budget {
  const b = obj(raw, "budget");
  return {
    id: id(b.id, "budget.id"),
    amount: money(b.amount),
    currency: currency(b.currency),
    period: b.period === "yearly" ? "yearly" : "monthly",
    tag: optTag(b.tag),
    spent: money(b.spent),
    remaining: money(b.remaining),
  };
}

function parseRecurring(kind: "expense" | "income") {
  return (raw: unknown): Recurring => {
    const r = obj(raw, `recurring_${kind}`);
    return {
      id: id(r.id, "recurring.id"),
      kind,
      name: typeof (kind === "expense" ? r.item : r.source) === "string" ? String(kind === "expense" ? r.item : r.source) : "",
      description: optStr(r.description) || null,
      amount: money(r.amount),
      currency: currency(r.currency),
      frequency: FREQUENCIES.includes(r.frequency as Frequency) ? (r.frequency as Frequency) : "monthly",
      intervalCount: typeof r.interval_count === "number" && r.interval_count > 0 ? r.interval_count : 1,
      startDate: day(r.start_date) ?? "",
      nextOn: day(r.next_occurrence_on),
      active: r.active !== false,
      tag: optTag(r.tag),
    };
  };
}

function slices(raw: unknown): Slice[] {
  return readableRows(arr(raw, "chart_data"), (s) => {
    const x = obj(s, "slice");
    return { label: typeof x.category === "string" ? x.category : typeof x.tag === "string" ? x.tag : "", currency: currency(x.currency), amount: money(x.amount) };
  }).rows;
}

function pageOf<T>(data: unknown, root: string, parse: (raw: unknown) => T, asked: number): Page<T> {
  const body = obj(data, root);
  const { rows, unreadable } = readableRows(arr(body[root], root), parse);
  const meta = (body.meta ?? {}) as { totals?: unknown; total_count?: unknown; pagy?: { page?: unknown; pages?: unknown; count?: unknown } };
  const pagy = meta.pagy ?? {};
  return {
    rows,
    unreadable,
    page: typeof pagy.page === "number" ? pagy.page : asked,
    pages: typeof pagy.pages === "number" ? pagy.pages : 1,
    count: typeof meta.total_count === "number" ? meta.total_count : typeof pagy.count === "number" ? pagy.count : rows.length,
    totals: totals(meta.totals),
  };
}

// ── formatting ──────────────────────────────────────────────────────────

/** The web's `formatMoney`: sign, symbol, the app's language, two decimals. */
export function formatMoney(amount: number, cur: Currency, language: string): string {
  const sign = amount < 0 ? "-" : "";
  const n = Math.abs(amount).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${CURRENCY_SYMBOLS[cur]}${n}`;
}

/** Each currency on its own, the biggest first, zeros left out ("€12.00 · $5.00"). */
export function formatTotals(t: Totals, language: string): string {
  return (Object.entries(t) as [Currency, number][])
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([c, v]) => formatMoney(v, c, language))
    .join(" · ");
}

/** The currency spent most, for single-currency charts (the web's "dominant currency"). */
export function dominantCurrency(t: Totals): Currency {
  const top = (Object.entries(t) as [Currency, number][]).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top[0] : "eur";
}

// ── inputs ──────────────────────────────────────────────────────────────

export interface EntryInput {
  /** The item (expense) or the source (income). */
  name: string;
  amount: number;
  currency: Currency;
  day: string | null;
  description: string | null;
  /** Every picked tag, categories and subcategories (the web's one multi-select). */
  tags: Tag[];
}

/**
 * The web's `ExpenseDrawer.onSubmit`: the first picked subcategory is the
 * subcategory, its parent the category (else the first picked tag), and
 * EVERY picked tag a label, the category and subcategory included.
 */
export function expenseTags(tags: Tag[]): { tag_id: number | null; subcategory_id: number | null; label_ids: number[] } {
  const sub = tags.find((t) => t.parentId != null) ?? null;
  const labelIds = [...new Set(tags.map((t) => t.id))];
  return { tag_id: sub?.parentId ?? labelIds[0] ?? null, subcategory_id: sub?.id ?? null, label_ids: labelIds };
}

/** Incomes and loans: the first picked tag is the category, every one a label. */
function plainTags(tags: Tag[]): { tag_id: number | null; label_ids: number[] } {
  const labelIds = [...new Set(tags.map((t) => t.id))];
  return { tag_id: labelIds[0] ?? null, label_ids: labelIds };
}

export interface LoanInput {
  type: LoanType;
  contactName: string;
  amount: number;
  currency: Currency;
  dueDate: string | null;
  description: string | null;
  tags: Tag[];
}

export interface BudgetInput {
  amount: number;
  currency: Currency;
  period: BudgetPeriod;
  tagId: number | null;
}

export interface RecurringInput {
  name: string;
  amount: number;
  currency: Currency;
  frequency: Frequency;
  intervalCount: number;
  startDate: string;
  description: string | null;
  tagId: number | null;
  active?: boolean;
}

// ── calls ───────────────────────────────────────────────────────────────

interface ListFilters {
  page: number;
  search?: string;
  tagId?: number | null;
  year?: number;
  month?: number;
}

function listParams(f: ListFilters, perPage = PER_PAGE): Record<string, unknown> {
  const p: Record<string, unknown> = { page: f.page, per_page: perPage };
  const term = f.search?.trim();
  if (term) p.search = term;
  if (f.tagId) p.tag_id = f.tagId;
  if (f.year) p.year = f.year;
  if (f.year && f.month) p.month = f.month;
  return p;
}

const period = (f: { year?: number; month?: number }) => (f.year ? (f.month ? { year: f.year, month: f.month } : { year: f.year }) : {});

/** Download an export (an authenticated binary) into the cache; returns its uri. */
async function download(path: string, params: Record<string, string>, name: string): Promise<string> {
  const url = `${BASE_URL}${path}?${new URLSearchParams(params).toString()}`;
  const target = new File(Paths.cache, `${Date.now()}-${name}`);
  const file = await File.downloadFileAsync(url, target, { headers: await authHeaders(), idempotent: true });
  return file.uri;
}

export type ExportFormat = "csv" | "xlsx" | "pdf";
const EXT: Record<ExportFormat, string> = { csv: "csv", xlsx: "xlsx", pdf: "pdf" };

export const financeApi = {
  expenses: {
    list: async (f: ListFilters & { oneTime?: boolean }): Promise<Page<Expense>> => {
      const params = listParams(f);
      if (f.oneTime) params.filter = "one_time";
      return pageOf((await http.get(`${B}/expenses`, { params })).data, "expenses", parseExpense, f.page);
    },
    trash: async (page: number): Promise<Page<Expense>> => pageOf((await http.get(`${B}/expenses/trashes`, { params: { page, per_page: PER_PAGE } })).data, "expenses", parseExpense, page),
    show: async (expenseId: number): Promise<Expense> => parseExpense(obj((await http.get(`${B}/expenses/${expenseId}`)).data, "show").expense),
    create: async (input: EntryInput): Promise<Expense> =>
      parseExpense(obj((await http.post(`${B}/expenses`, { expense: expenseBody(input) })).data, "create").expense),
    update: async (expenseId: number, input: EntryInput): Promise<Expense> =>
      parseExpense(obj((await http.put(`${B}/expenses/${expenseId}`, { expense: expenseBody(input) })).data, "update").expense),
    remove: async (expenseId: number): Promise<void> => void (await http.delete(`${B}/expenses/${expenseId}`)),
    restore: async (expenseId: number): Promise<void> => void (await http.put(`${B}/expenses/${expenseId}/restore`)),
    destroyForever: async (expenseId: number): Promise<void> => void (await http.delete(`${B}/expenses/${expenseId}/destroy_permanently`)),
    byCategory: async (f: { year?: number; month?: number }): Promise<{ slices: Slice[]; total: Totals }> => {
      const body = obj((await http.get(`${B}/expenses/pie_chart_data_by_tag`, { params: period(f) })).data, "pie");
      return { slices: slices(body.chart_data), total: totals(body.total_spend) };
    },
    bySubcategory: async (tagId: number, f: { year?: number; month?: number }): Promise<{ slices: Slice[]; total: Totals }> => {
      const body = obj((await http.get(`${B}/expenses/pie_chart_data_by_subcategories`, { params: { tag_id: tagId, ...period(f) } })).data, "pie");
      return { slices: slices(body.chart_data), total: totals(body.total_spend) };
    },
    overTime: async (kind: "months" | "years", cur: Currency): Promise<{ label: string; amount: number }[]> => {
      const body = obj((await http.get(`${B}/expenses/total_expenses_last_years_or_months`, { params: { chart_type: kind, currency: cur } })).data, "over_time");
      const data = arr(body.data, "data");
      return arr(body.labels, "labels").map((label, i) => ({ label: String(label), amount: money(data[i]) }));
    },
    export: (f: ListFilters, name: string): Promise<string> => {
      const params = Object.fromEntries(Object.entries({ ...listParams(f), file_format: "xlsx" }).filter(([k]) => k !== "page" && k !== "per_page").map(([k, v]) => [k, String(v)]));
      return download(`${B}/expenses/export`, params, `${name}.xlsx`);
    },
  },

  incomes: {
    list: async (f: ListFilters): Promise<Page<Income>> => pageOf((await http.get(`${B}/incomes`, { params: listParams(f) })).data, "incomes", parseIncome, f.page),
    pending: async (): Promise<Income[]> => readableRows(arr(obj((await http.get(`${B}/incomes/pending`)).data, "pending").incomes, "incomes"), parseIncome).rows,
    trash: async (page: number): Promise<Page<Income>> => pageOf((await http.get(`${B}/incomes/trashes`, { params: { page, per_page: PER_PAGE } })).data, "incomes", parseIncome, page),
    create: async (input: EntryInput): Promise<Income> => parseIncome(obj((await http.post(`${B}/incomes`, { income: incomeBody(input) })).data, "create").income),
    update: async (incomeId: number, input: EntryInput): Promise<Income> =>
      parseIncome(obj((await http.put(`${B}/incomes/${incomeId}`, { income: incomeBody(input) })).data, "update").income),
    confirm: async (incomeId: number, amount: number): Promise<Income> =>
      parseIncome(obj((await http.put(`${B}/incomes/${incomeId}/confirm`, { income: { amount } })).data, "confirm").income),
    remove: async (incomeId: number): Promise<void> => void (await http.delete(`${B}/incomes/${incomeId}`)),
    restore: async (incomeId: number): Promise<void> => void (await http.put(`${B}/incomes/${incomeId}/restore`)),
    destroyForever: async (incomeId: number): Promise<void> => void (await http.delete(`${B}/incomes/${incomeId}/destroy_permanently`)),
  },

  loans: {
    list: async (f: { page: number; search?: string; type?: LoanType | null; tagId?: number | null; paid?: boolean }): Promise<Page<Loan>> => {
      const params: Record<string, unknown> = { page: f.page, per_page: PER_PAGE };
      const term = f.search?.trim();
      if (term) params.search = term;
      if (f.type) params.loan_type = f.type;
      if (f.tagId) params.tag_id = f.tagId;
      return pageOf((await http.get(`${B}/loans${f.paid ? "/paid" : ""}`, { params })).data, "loans", parseLoan, f.page);
    },
    trash: async (page: number): Promise<Page<Loan>> => pageOf((await http.get(`${B}/loans/trashes`, { params: { page, per_page: PER_PAGE } })).data, "loans", parseLoan, page),
    show: async (loanId: number): Promise<Loan> => parseLoan(obj((await http.get(`${B}/loans/${loanId}`)).data, "show").loan),
    create: async (input: LoanInput): Promise<Loan> => parseLoan(obj((await http.post(`${B}/loans`, { loan: loanBody(input) })).data, "create").loan),
    update: async (loanId: number, input: LoanInput): Promise<Loan> => parseLoan(obj((await http.put(`${B}/loans/${loanId}`, { loan: loanBody(input) })).data, "update").loan),
    remove: async (loanId: number): Promise<void> => void (await http.delete(`${B}/loans/${loanId}`)),
    restore: async (loanId: number): Promise<void> => void (await http.put(`${B}/loans/${loanId}/restore`)),
    destroyForever: async (loanId: number): Promise<void> => void (await http.delete(`${B}/loans/${loanId}/destroy_permanently`)),
    /** The loan comes back with its new status (paid once nothing remains). An overpayment is refused (422, `apiErrorMessage`). */
    addPayment: async (loanId: number, amount: number, onDay: string): Promise<Loan> =>
      parseLoan(obj((await http.post(`${B}/loans/${loanId}/create_payment`, { loan_payment: { amount, payment_date: onDay } })).data, "payment").loan),
    removePayment: async (paymentId: number): Promise<void> => void (await http.delete(`${B}/loan_payments/${paymentId}`)),
    /**
     * What is still owed both ways, per currency, over EVERY unpaid loan (the
     * web's dashboard sums its first page only, 5 loans: a web bug).
     */
    outstanding: async (): Promise<{ receive: Totals; pay: Totals; receiveCount: number; payCount: number }> => {
      const all: Loan[] = [];
      for (let page = 1; page <= 50; page++) {
        const p = pageOf((await http.get(`${B}/loans`, { params: { page, per_page: 100 } })).data, "loans", parseLoan, page);
        all.push(...p.rows);
        if (page >= p.pages) break;
      }
      const sum = (type: LoanType) =>
        all.filter((l) => l.type === type).reduce<Totals>((t, l) => ({ ...t, [l.currency]: Math.round(((t[l.currency] ?? 0) + l.remaining) * 100) / 100 }), {});
      return { receive: sum("given"), pay: sum("taken"), receiveCount: all.filter((l) => l.type === "given").length, payCount: all.filter((l) => l.type === "taken").length };
    },
  },

  budgets: {
    list: async (): Promise<Budget[]> => readableRows(arr(obj((await http.get(`${B}/budgets`)).data, "budgets").budgets, "budgets"), parseBudget).rows,
    create: async (input: BudgetInput): Promise<Budget> => parseBudget(obj((await http.post(`${B}/budgets`, { budget: budgetBody(input) })).data, "create").budget),
    update: async (budgetId: number, input: BudgetInput): Promise<Budget> =>
      parseBudget(obj((await http.put(`${B}/budgets/${budgetId}`, { budget: budgetBody(input) })).data, "update").budget),
    remove: async (budgetId: number): Promise<void> => void (await http.delete(`${B}/budgets/${budgetId}`)),
  },

  recurring: {
    list: async (kind: "expense" | "income"): Promise<Recurring[]> => {
      const root = `recurring_${kind}s`;
      return readableRows(arr(obj((await http.get(`${B}/${root}`)).data, root)[root], root), parseRecurring(kind)).rows;
    },
    create: async (kind: "expense" | "income", input: RecurringInput): Promise<Recurring> => {
      const res = await http.post(`${B}/recurring_${kind}s`, { [`recurring_${kind}`]: recurringBody(kind, input) });
      return parseRecurring(kind)(obj(res.data, "create")[`recurring_${kind}`]);
    },
    update: async (kind: "expense" | "income", recurringId: number, input: Partial<RecurringInput>): Promise<Recurring> => {
      const res = await http.put(`${B}/recurring_${kind}s/${recurringId}`, { [`recurring_${kind}`]: recurringBody(kind, input) });
      return parseRecurring(kind)(obj(res.data, "update")[`recurring_${kind}`]);
    },
    remove: async (kind: "expense" | "income", recurringId: number): Promise<void> => void (await http.delete(`${B}/recurring_${kind}s/${recurringId}`)),
    /** One income now, dated today; the schedule is untouched. */
    runIncome: async (recurringId: number): Promise<Income> => parseIncome(obj((await http.post(`${B}/recurring_incomes/${recurringId}/run`)).data, "run").income),
  },

  tags: {
    /** Every tag, categories and subcategories, by name (the web's `listAll`). */
    all: async (): Promise<Tag[]> => {
      const out: Tag[] = [];
      for (let page = 1; page <= 50; page++) {
        const body = obj((await http.get(`${B}/tags`, { params: { all: true, page } })).data, "tags");
        out.push(...readableRows(arr(body.tags, "tags"), parseTag).rows);
        const pages = ((body.meta ?? {}) as { pagy?: { pages?: unknown } }).pagy?.pages;
        if (typeof pages !== "number" || page >= pages) break;
      }
      return out;
    },
    create: async (name: string, parentId: number | null): Promise<Tag> => parseTag(obj((await http.post(`${B}/tags`, { tag: { name, parent_id: parentId } })).data, "create").tag),
    rename: async (tagId: number, name: string): Promise<Tag> => parseTag(obj((await http.put(`${B}/tags/${tagId}`, { tag: { name } })).data, "rename").tag),
    /** Its subcategories and budgets go with it; records keep no category. */
    remove: async (tagId: number): Promise<void> => void (await http.delete(`${B}/tags/${tagId}`)),
  },

  reports: {
    summary: async (year: number, month: number | null): Promise<{ expenses: Totals; incomes: Totals; net: Totals; byCategory: Slice[] }> => {
      const body = obj((await http.get(`${B}/reports/summary`, { params: month ? { year, month } : { year } })).data, "summary");
      const t = obj(body.totals, "summary.totals");
      return { expenses: totals(t.expenses), incomes: totals(t.incomes), net: totals(t.net), byCategory: slices(body.by_tag) };
    },
    cashFlow: async (cur: Currency): Promise<{ label: string; expenses: number; incomes: number }[]> => {
      const body = obj((await http.get(`${B}/reports/cash_flow`, { params: { currency: cur } })).data, "cash_flow");
      const ex = arr(body.expenses, "expenses");
      const inc = arr(body.incomes, "incomes");
      return arr(body.labels, "labels").map((label, i) => ({ label: String(label), expenses: money(ex[i]), incomes: money(inc[i]) }));
    },
    /** `file_format`, not `format` (Rails reserves it); the range applies when both days are given. */
    export: (resource: "expenses" | "incomes" | "loans", format: ExportFormat, from: string, to: string): Promise<string> =>
      download(`${B}/reports/export`, { resource, file_format: format, from, to }, `${resource}-${from}-${to}.${EXT[format]}`),
  },
};

function expenseBody(input: EntryInput) {
  return { item: input.name, amount: input.amount, currency: input.currency, spent_at: input.day, description: input.description, ...expenseTags(input.tags) };
}
function incomeBody(input: EntryInput) {
  return { source: input.name, amount: input.amount, currency: input.currency, received_at: input.day, description: input.description, ...plainTags(input.tags) };
}
function loanBody(input: LoanInput) {
  return { loan_type: input.type, contact_name: input.contactName, amount: input.amount, currency: input.currency, due_date: input.dueDate, description: input.description, ...plainTags(input.tags) };
}
function budgetBody(input: BudgetInput) {
  return { amount: input.amount, currency: input.currency, period: input.period, tag_id: input.tagId };
}
function recurringBody(kind: "expense" | "income", input: Partial<RecurringInput>) {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body[kind === "expense" ? "item" : "source"] = input.name;
  if (input.amount !== undefined) body.amount = input.amount;
  if (input.currency !== undefined) body.currency = input.currency;
  if (input.frequency !== undefined) body.frequency = input.frequency;
  if (input.intervalCount !== undefined) body.interval_count = input.intervalCount;
  if (input.startDate !== undefined) body.start_date = input.startDate;
  if (input.description !== undefined) body.description = input.description;
  if (input.tagId !== undefined) body.tag_id = input.tagId;
  if (input.active !== undefined) body.active = input.active;
  return body;
}

export const __parse = { parseTag, parseExpense, parseIncome, parseLoan, parseBudget, parseRecurring };
