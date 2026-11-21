/**
 * Finance › Budgets, Recurring, Categories, Reports and Trash, screen by
 * screen, at the HTTP layer: the real API functions and parsers run against
 * a small stateful server (every write changes `db`, every read answers from
 * it, so the refetch after a write shows what the write did), and every write
 * is asserted by the body it sends, in the server's names.
 *
 * Shapes are the server's (`MyFinanceApp::*Serializer`, read at multi_magic
 * 0986d1e4): money as STRINGS, snake_case. Invented data only.
 *
 * What this cannot see: a pixel, the native share sheet, a real download, the
 * Modal on a device, and whether a French string fits 360 dp.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useFinanceUndo } from "@/stores/financeUndo.store";
import { TOKENS } from "@/theme/tokens";
import { addDays, parseDay, startOfMonth, addMonths, todayKey } from "@/screens/calendar/dates";
import { MONEY_IN, MONEY_OWED } from "@/screens/finance/parts";
import { BudgetsTab } from "@/screens/finance/tabs/Budgets";
import { router as mockedRouter } from "expo-router";
import Recurring from "../../../../app/finance/recurring";
import RecurringEdit from "../../../../app/finance/recurring-edit";
import Categories from "../../../../app/finance/categories";
import Reports from "../../../../app/finance/reports";
import Trash from "../../../../app/finance/trash";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams.current,
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => undefined), isAvailableAsync: jest.fn(async () => true) }));
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

const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock; replace: jest.Mock };
const sharing = jest.requireMock("expo-sharing") as { shareAsync: jest.Mock };
const files = jest.requireMock("expo-file-system") as { File: { downloadFileAsync: jest.Mock } };
const B = "/api/v1/my_finance_app";
const TODAY = todayKey();
const DANGER = [TOKENS.light.danger, TOKENS.dark.danger];
let mock: MockAdapter;

function renderScreen(element: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
}
const bodies = (method: "post" | "put" | "delete", url: string) => mock.history[method].filter((r) => r.url === url).map((r) => (r.data ? JSON.parse(r.data) : null));
const colorOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style).color as string;
const confirmAlert = (alert: jest.SpyInstance) => act(() => (alert.mock.calls.at(-1)![2] as { style?: string; onPress?: () => void }[]).find((b) => b.style === "destructive")!.onPress!());

// ── the server's shapes ─────────────────────────────────────────────────
const tag = (id: number, name: string, parent_id: number | null = null) => ({ id, name, created_at: "2026-11-01T09:00:00Z", parent_id, position: 0, description: null, color: "no_color" });
const FOOD = tag(3, "Food");
const budget = (id: number, over: Record<string, unknown> = {}) => ({ id, amount: "300.0", currency: "eur", period: "monthly", tag_id: 3, tag: FOOD, spent: "120.0", remaining: "180.0", ...over });
const rexpense = (id: number, over: Record<string, unknown> = {}) => ({
  id, item: `Rule ${id}`, description: null, amount: "30.0", currency: "eur", frequency: "monthly", interval_count: 1, start_date: "2026-01-05",
  next_occurrence_on: "2026-12-05", last_generated_on: "2026-11-05", active: true, tag_id: null, subcategory_id: null, tag: null, subcategory: null, ...over,
});
const rincome = (id: number, over: Record<string, unknown> = {}) => {
  const { item: _item, subcategory_id: _s, subcategory: _sub, ...rest } = rexpense(id, over);
  return { ...rest, source: `Source ${id}`, ...over };
};
const expense = (id: number, over: Record<string, unknown> = {}) => ({
  id, item: `Expense ${id}`, description: null, amount: "12.5", currency: "eur", spent_at: "2026-11-14T00:00:00.000Z", deleted_at: "2026-11-15T10:00:00.000Z",
  tag_id: null, subcategory_id: null, recurring_expense_id: null, category: null, tag: null, subcategory: null, amount_with_currency: "12.5 eur", labels: [], label_ids: [], ...over,
});
const income = (id: number, over: Record<string, unknown> = {}) => ({
  id, source: `Income ${id}`, description: null, amount: "2400.0", currency: "eur", received_at: `${TODAY}T00:00:00.000Z`, deleted_at: null, tag_id: null, status: "published",
  recurring_income_id: 3, category: null, tag: null, amount_with_currency: "2400.0 eur", labels: [], label_ids: [], ...over,
});
const loan = (id: number, over: Record<string, unknown> = {}) => ({
  id, description: null, due_date: "2026-12-01", amount: "200.0", contact_name: "Quinn QA", loan_type: "given", status: "trashed", currency: "eur", tag_id: null,
  total_paid: 0, remaining_amount: "200.0", category: null, loan_payments: [], amount_with_currency: "200.0 eur", labels: [], label_ids: [], ...over,
});
const paged = (root: string, rows: unknown[]) => ({ [root]: rows, meta: { pagy: { page: 1, pages: 1, count: rows.length }, total_count: rows.length } });

type Json = Record<string, unknown>;
/** One fake server for every manage screen. */
function serve(seed: { budgets?: Json[]; tags?: Json[]; rexpenses?: Json[]; rincomes?: Json[]; trash?: { expenses?: Json[]; incomes?: Json[]; loans?: Json[] } } = {}) {
  const db = {
    budgets: [...(seed.budgets ?? [])],
    tags: [...(seed.tags ?? [FOOD])],
    rexpenses: [...(seed.rexpenses ?? [])],
    rincomes: [...(seed.rincomes ?? [])],
    trash: { expenses: [...(seed.trash?.expenses ?? [])], incomes: [...(seed.trash?.incomes ?? [])], loans: [...(seed.trash?.loans ?? [])] },
    nextId: 100,
  };
  const idIn = (url: string | undefined, re: RegExp) => Number(url?.match(re)?.[1]);
  const tagOf = (id: unknown) => db.tags.find((t) => t.id === id) ?? null;

  mock.onGet(`${B}/tags`).reply(() => [200, { tags: [...db.tags].sort((a, b) => String(a.name).localeCompare(String(b.name))), meta: { pagy: { page: 1, pages: 1 } } }]);
  mock.onPost(`${B}/tags`).reply((cfg) => {
    const { name, parent_id } = JSON.parse(cfg.data).tag;
    if (db.tags.some((t) => String(t.name).toLowerCase() === String(name).toLowerCase() && t.parent_id === parent_id)) return [422, { error: "Failed to create tag" }];
    const t = tag(db.nextId++, name, parent_id);
    db.tags.push(t);
    return [200, { tag: t }];
  });
  mock.onPut(/\/tags\/\d+$/).reply((cfg) => {
    const t = db.tags.find((x) => x.id === idIn(cfg.url, /tags\/(\d+)/))!;
    t.name = JSON.parse(cfg.data).tag.name;
    return [200, { tag: t }];
  });
  mock.onDelete(/\/tags\/\d+$/).reply((cfg) => {
    const id = idIn(cfg.url, /tags\/(\d+)/);
    db.tags = db.tags.filter((t) => t.id !== id && t.parent_id !== id);
    db.budgets = db.budgets.filter((b) => b.tag_id !== id);
    return [200, { tag: { id } }];
  });

  mock.onGet(`${B}/budgets`).reply(() => [200, { budgets: db.budgets }]);
  mock.onPost(`${B}/budgets`).reply((cfg) => {
    const b = JSON.parse(cfg.data).budget;
    if (db.budgets.some((x) => x.tag_id === b.tag_id && x.period === b.period && x.currency === b.currency)) return [422, { tag_id: ["has already been taken"] }];
    const row = budget(db.nextId++, { ...b, amount: String(b.amount), tag: tagOf(b.tag_id), spent: "0.0", remaining: String(b.amount) });
    db.budgets.push(row);
    return [201, { budget: row }];
  });
  mock.onDelete(/\/budgets\/\d+$/).reply((cfg) => {
    db.budgets = db.budgets.filter((b) => b.id !== idIn(cfg.url, /budgets\/(\d+)/));
    return [200, { budget: {} }];
  });

  for (const [root, rows] of [["recurring_expenses", "rexpenses"], ["recurring_incomes", "rincomes"]] as const) {
    const one = root.slice(0, -1);
    mock.onGet(`${B}/${root}`).reply(() => [200, { [root]: db[rows] }]);
    mock.onPost(`${B}/${root}`).reply((cfg) => {
      const r = JSON.parse(cfg.data)[one];
      const row = { ...(rows === "rexpenses" ? rexpense(db.nextId++) : rincome(db.nextId++)), ...r, amount: String(r.amount), tag: tagOf(r.tag_id) };
      db[rows].push(row);
      return [201, { [one]: row }];
    });
    mock.onPut(new RegExp(`${root}/\\d+$`)).reply((cfg) => {
      const row = db[rows].find((x) => x.id === idIn(cfg.url, /\/(\d+)$/))!;
      Object.assign(row, JSON.parse(cfg.data)[one]);
      return [200, { [one]: row }];
    });
    mock.onDelete(new RegExp(`${root}/\\d+$`)).reply((cfg) => {
      db[rows] = db[rows].filter((x) => x.id !== idIn(cfg.url, /\/(\d+)$/));
      return [200, { [one]: {} }];
    });
  }
  mock.onPost(/recurring_incomes\/\d+\/run$/).reply(() => [201, { income: income(db.nextId++) }]);

  for (const kind of ["expenses", "incomes", "loans"] as const) {
    mock.onGet(`${B}/${kind}/trashes`).reply(() => [200, paged(kind, db.trash[kind])]);
    mock.onPut(new RegExp(`${kind}/\\d+/restore$`)).reply((cfg) => {
      db.trash[kind] = db.trash[kind].filter((x) => x.id !== idIn(cfg.url, /\/(\d+)\/restore/));
      return [200, { status: "published" }];
    });
    mock.onDelete(new RegExp(`${kind}/\\d+/destroy_permanently$`)).reply((cfg) => {
      db.trash[kind] = db.trash[kind].filter((x) => x.id !== idIn(cfg.url, /\/(\d+)\/destroy_permanently/));
      return [200, {}];
    });
  }
  return db;
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockParams.current = {};
  router.push.mockClear();
  router.back.mockClear();
  router.replace.mockClear();
  sharing.shareAsync.mockClear();
  files.File.downloadFileAsync.mockClear();
  useFinanceUndo.getState().clear();
  await i18n.changeLanguage("en");
});
afterEach(() => mock.restore());

// ── Budgets ─────────────────────────────────────────────────────────────
describe("budgets", () => {
  it("shows each one newest first: X of Y, its state colour, and what is left or over", async () => {
    serve({
      budgets: [
        budget(1),
        budget(2, { tag_id: null, tag: null, spent: "250.0", remaining: "50.0", period: "yearly" }),
        budget(3, { tag_id: 6, tag: tag(6, "Rent"), spent: "320.0", remaining: "-20.0" }),
      ],
    });
    renderScreen(<BudgetsTab />);
    expect(await screen.findByText("Food")).toBeTruthy();
    expect(screen.getAllByTestId(/^finance-budget-\d+$/).map((n) => n.props.testID)).toEqual(["finance-budget-3", "finance-budget-2", "finance-budget-1"]);
    expect(screen.getByTestId("finance-budget-of-1")).toHaveTextContent("€120.00 of €300.00");
    expect(screen.getByTestId("finance-budget-percent-1")).toHaveTextContent("40%");
    expect(colorOf("finance-budget-percent-1")).toBe(MONEY_IN);
    expect(screen.getByTestId("finance-budget-rest-1")).toHaveTextContent("€180.00 left");

    expect(within(screen.getByTestId("finance-budget-2")).getByText("Overall budget")).toBeTruthy();
    expect(within(screen.getByTestId("finance-budget-2")).getByText("Yearly")).toBeTruthy();
    expect(colorOf("finance-budget-percent-2")).toBe(MONEY_OWED);

    expect(screen.getByTestId("finance-budget-percent-3")).toHaveTextContent("107%");
    expect(DANGER).toContain(colorOf("finance-budget-percent-3"));
    expect(screen.getByTestId("finance-budget-rest-3")).toHaveTextContent("€20.00 over");
    expect(DANGER).toContain(colorOf("finance-budget-rest-3"));
  });

  it("sorts oldest first on request, and back", async () => {
    serve({ budgets: [budget(1), budget(2, { tag_id: null, tag: null }), budget(3, { tag_id: 6, tag: tag(6, "Rent") })] });
    renderScreen(<BudgetsTab />);
    expect(await screen.findByText("Food")).toBeTruthy();
    const order = () => screen.getAllByTestId(/^finance-budget-\d+$/).map((n) => n.props.testID);
    expect(screen.getByTestId("finance-budgets-sort")).toHaveTextContent("Newest first");
    fireEvent.press(screen.getByTestId("finance-budgets-sort"));
    expect(screen.getByTestId("finance-budgets-sort")).toHaveTextContent("Oldest first");
    expect(order()).toEqual(["finance-budget-1", "finance-budget-2", "finance-budget-3"]);
    fireEvent.press(screen.getByTestId("finance-budgets-sort"));
    expect(order()).toEqual(["finance-budget-3", "finance-budget-2", "finance-budget-1"]);
  });

  it("with none, says to set a monthly limit", async () => {
    serve();
    renderScreen(<BudgetsTab />);
    expect(await screen.findByText("Set a monthly limit")).toBeTruthy();
  });

  it("makes one: a category, the amount on the keypad (above zero), the currency and the period", async () => {
    serve({ tags: [FOOD, tag(4, "Groceries", 3)] });
    renderScreen(<BudgetsTab />);
    await screen.findByText("Set a monthly limit");
    fireEvent.press(screen.getByTestId("finance-budgets-new"));
    expect(screen.getByText("Leave it empty for an overall budget across all categories.")).toBeTruthy();
    expect(screen.getByTestId("finance-budget-save")).toBeDisabled();
    fireEvent.press(screen.getByTestId("finance-budget-amount-pad-0"));
    expect(screen.getByText("Enter an amount above zero.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("finance-budget-amount-pad-del"));
    for (const k of ["2", "5", "0"]) fireEvent.press(screen.getByTestId(`finance-budget-amount-pad-${k}`));
    fireEvent.press(screen.getByTestId("finance-budget-category"));
    // Categories only: a subcategory cannot carry a budget.
    await waitFor(() => expect(screen.getByTestId("finance-budget-tags-tag-3")).toBeTruthy());
    expect(screen.queryByTestId("finance-budget-tags-tag-4")).toBeNull();
    fireEvent.press(screen.getByTestId("finance-budget-tags-tag-3"));
    fireEvent.press(screen.getByTestId("finance-budget-amount-currency"));
    fireEvent.press(screen.getByTestId("finance-budget-currencies-usd"));
    fireEvent.press(screen.getByTestId("finance-budget-period-yearly"));
    fireEvent.press(screen.getByTestId("finance-budget-save"));
    expect(await screen.findByText("$0.00 of $250.00")).toBeTruthy();
    expect(screen.queryByTestId("finance-budget-sheet")).toBeNull();
    expect(bodies("post", `${B}/budgets`)).toEqual([{ budget: { amount: 250, currency: "usd", period: "yearly", tag_id: 3 } }]);
  });

  it("says why the server refused one: one budget per category, period and currency (Rails' bare errors hash)", async () => {
    serve({ budgets: [budget(1)] });
    renderScreen(<BudgetsTab />);
    await screen.findByText("Food");
    fireEvent.press(screen.getByTestId("finance-budgets-new"));
    fireEvent.press(screen.getByTestId("finance-budget-category"));
    fireEvent.press(await screen.findByTestId("finance-budget-tags-tag-3"));
    for (const k of ["9", "9"]) fireEvent.press(screen.getByTestId(`finance-budget-amount-pad-${k}`));
    fireEvent.press(screen.getByTestId("finance-budget-save"));
    expect(await screen.findByTestId("finance-budget-error")).toHaveTextContent("You already have a budget for this category, period and currency.");
    expect(screen.getByTestId("finance-budget-sheet")).toBeTruthy();
  });

  it("any other refusal is shown in the server's words", async () => {
    serve();
    // Registered after the server's: the adapter keeps the last handler for a route.
    mock.onPost(`${B}/budgets`).reply(422, { message: ["'chf' is not a valid currency"] });
    renderScreen(<BudgetsTab />);
    await screen.findByText("Set a monthly limit");
    fireEvent.press(screen.getByTestId("finance-budgets-new"));
    fireEvent.press(screen.getByTestId("finance-budget-amount-pad-5"));
    fireEvent.press(screen.getByTestId("finance-budget-save"));
    expect(await screen.findByTestId("finance-budget-error")).toHaveTextContent("'chf' is not a valid currency");
  });

  it("edits one with its values in place, and deletes it after asking", async () => {
    const alert = jest.spyOn(Alert, "alert");
    serve({ budgets: [budget(1)] });
    renderScreen(<BudgetsTab />);
    fireEvent.press(await screen.findByTestId("finance-budget-1"));
    expect(screen.getByTestId("finance-budget-amount-value")).toHaveTextContent("€300");
    fireEvent.press(screen.getByTestId("finance-budget-delete"));
    expect(alert.mock.calls[0][0]).toBe("Delete this budget?");
    confirmAlert(alert);
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toContain(`${B}/budgets/1`));
    expect(await screen.findByText("Set a monthly limit")).toBeTruthy();
    alert.mockRestore();
  });
});

// ── Recurring ───────────────────────────────────────────────────────────
describe("recurring", () => {
  const nextLabel = (day: string) => `Next on ${parseDay(day).toLocaleDateString("en", { day: "numeric", month: "short" })}`;

  it("lists expenses with how often and when next, Paused dimmed, and their total and count; then incomes", async () => {
    serve({
      rexpenses: [rexpense(1, { item: "Gym" }), rexpense(2, { item: "Insurance", amount: "90.0", interval_count: 3, active: false }), rexpense(4, { item: "VPN", currency: "usd", amount: "5.0", frequency: "yearly" })],
      rincomes: [rincome(3, { source: "Salary", amount: "2400.0" })],
    });
    renderScreen(<Recurring />);
    expect(await screen.findByText("Gym")).toBeTruthy();
    expect(within(screen.getByTestId("finance-recurring-1")).getByText("Every month")).toBeTruthy();
    expect(screen.getByTestId("finance-recurring-when-1")).toHaveTextContent(nextLabel("2026-12-05"));
    expect(within(screen.getByTestId("finance-recurring-2")).getByText("Every 3 months")).toBeTruthy();
    expect(screen.getByTestId("finance-recurring-when-2")).toHaveTextContent("Paused");
    expect(StyleSheet.flatten(screen.getByTestId("finance-recurring-open-2").props.style).opacity).toBeLessThan(1);
    expect(screen.getByTestId("finance-recurring-toggle-2")).toHaveTextContent("Resume");
    expect(within(screen.getByTestId("finance-recurring-4")).getByText("Every year")).toBeTruthy();
    expect(screen.getByTestId("finance-recurring-total")).toHaveTextContent("€120.00 · $5.00");
    expect(screen.getByTestId("finance-recurring-count")).toHaveTextContent("3 entries");
    expect(screen.queryByTestId("finance-recurring-run-1")).toBeNull();

    fireEvent.press(screen.getByTestId("finance-recurring-kind-income"));
    expect(await screen.findByText("Salary")).toBeTruthy();
    expect(screen.getByTestId("finance-recurring-run-3")).toBeTruthy();
    expect(screen.getByTestId("finance-recurring-count")).toHaveTextContent("1 entry");
  });

  it("lists the newest rule first; Next due puts them in the server's order, soonest first", async () => {
    serve({ rexpenses: [rexpense(1, { item: "Gym" }), rexpense(2, { item: "Insurance" }), rexpense(4, { item: "VPN" })] });
    renderScreen(<Recurring />);
    expect(await screen.findByText("Gym")).toBeTruthy();
    const order = () => screen.getAllByTestId(/^finance-recurring-\d+$/).map((n) => n.props.testID);
    expect(order()).toEqual(["finance-recurring-4", "finance-recurring-2", "finance-recurring-1"]);
    expect(screen.getByTestId("finance-recurring-sort")).toHaveTextContent("Newest first");
    fireEvent.press(screen.getByTestId("finance-recurring-sort"));
    expect(screen.getByTestId("finance-recurring-sort")).toHaveTextContent("Next due");
    expect(order()).toEqual(["finance-recurring-1", "finance-recurring-2", "finance-recurring-4"]);
  });

  it("pauses a rule at once and tells the server {active: false}", async () => {
    serve({ rexpenses: [rexpense(1, { item: "Gym" })] });
    renderScreen(<Recurring />);
    await screen.findByText("Gym");
    fireEvent.press(screen.getByTestId("finance-recurring-toggle-1"));
    expect(await screen.findByText("Paused")).toBeTruthy();
    await waitFor(() => expect(bodies("put", `${B}/recurring_expenses/1`)).toEqual([{ recurring_expense: { active: false } }]));
    expect(screen.getByTestId("finance-recurring-toggle-1")).toHaveTextContent("Resume");
  });

  it("runs an income now and says so", async () => {
    serve({ rincomes: [rincome(3, { source: "Salary" })] });
    mockParams.current = { kind: "income" };
    renderScreen(<Recurring />);
    fireEvent.press(await screen.findByTestId("finance-recurring-run-3"));
    expect(await screen.findByText("Income added for today")).toBeTruthy();
    expect(mock.history.post.map((r) => r.url)).toEqual([`${B}/recurring_incomes/3/run`]);
  });

  it("filters by category on the phone, and the total follows", async () => {
    serve({ tags: [FOOD, tag(6, "Home")], rexpenses: [rexpense(1, { item: "Gym" }), rexpense(2, { item: "Veg box", tag_id: 3, tag: FOOD, amount: "20.0" })] });
    renderScreen(<Recurring />);
    await screen.findByText("Gym");
    fireEvent.press(screen.getByTestId("finance-recurring-filter"));
    fireEvent.press(await screen.findByTestId("finance-recurring-categories-3"));
    await waitFor(() => expect(screen.queryByText("Gym")).toBeNull());
    expect(screen.getByText("Veg box")).toBeTruthy();
    expect(screen.getByTestId("finance-recurring-total")).toHaveTextContent("€20.00");
    expect(screen.getByTestId("finance-recurring-count")).toHaveTextContent("1 entry");
    expect(mock.history.get.filter((r) => r.url === `${B}/recurring_expenses`)).toHaveLength(1);
  });

  it("New opens the form for the kind shown, and a row opens its own", async () => {
    serve({ rincomes: [rincome(3, { source: "Salary" })] });
    mockParams.current = { kind: "income" };
    renderScreen(<Recurring />);
    fireEvent.press(await screen.findByTestId("finance-recurring-open-3"));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: "/finance/recurring-edit", params: { kind: "income", id: "3" } });
    fireEvent.press(screen.getByTestId("finance-recurring-new"));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: "/finance/recurring-edit", params: { kind: "income" } });
  });

  it("with none, says so", async () => {
    serve();
    renderScreen(<Recurring />);
    expect(await screen.findByText("No recurring expenses")).toBeTruthy();
  });
});

describe("a recurring rule's form", () => {
  it("makes a new expense: name, amount, every 3 weeks, a start date, a category, a note", async () => {
    serve({ tags: [FOOD] });
    mockParams.current = { kind: "expense" };
    renderScreen(<RecurringEdit />);
    expect(screen.getByText("New recurring expense")).toBeTruthy();
    expect(screen.getByTestId("finance-recurring-edit-backfill")).toHaveTextContent("A start date in the past adds the expenses it missed now.");
    expect(screen.getByTestId("finance-recurring-edit-save")).toBeDisabled();
    fireEvent.changeText(screen.getByTestId("finance-recurring-edit-name"), "Gym ");
    for (const k of ["4", "5", "dot", "5"]) fireEvent.press(screen.getByTestId(`finance-recurring-edit-amount-pad-${k}`));
    fireEvent.press(screen.getByTestId("finance-recurring-edit-interval-plus"));
    fireEvent.press(screen.getByTestId("finance-recurring-edit-interval-plus"));
    fireEvent.press(screen.getByTestId("finance-recurring-edit-unit"));
    fireEvent.press(screen.getByTestId("finance-recurring-edit-units-weekly"));
    expect(screen.getByTestId("finance-recurring-edit-repeat")).toHaveTextContent("Every 3 weeks");
    fireEvent.press(screen.getByTestId("finance-recurring-edit-start-yesterday"));
    fireEvent.press(screen.getByTestId("finance-recurring-edit-category"));
    fireEvent.press(await screen.findByTestId("finance-recurring-edit-tags-tag-3"));
    fireEvent.changeText(screen.getByTestId("finance-recurring-edit-description"), "Downtown");
    fireEvent.press(screen.getByTestId("finance-recurring-edit-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(bodies("post", `${B}/recurring_expenses`)).toEqual([
      { recurring_expense: { item: "Gym", amount: 45.5, currency: "eur", frequency: "weekly", interval_count: 3, start_date: addDays(TODAY, -1), description: "Downtown", tag_id: 3 } },
    ]);
  });

  it("starts today, monthly, every 1, by default", async () => {
    serve();
    mockParams.current = { kind: "income" };
    renderScreen(<RecurringEdit />);
    expect(screen.getByText("Estimated amount")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("finance-recurring-edit-name"), "Salary");
    fireEvent.press(screen.getByTestId("finance-recurring-edit-amount-pad-9"));
    fireEvent.press(screen.getByTestId("finance-recurring-edit-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(bodies("post", `${B}/recurring_incomes`)).toEqual([
      { recurring_income: { source: "Salary", amount: 9, currency: "eur", frequency: "monthly", interval_count: 1, start_date: TODAY, description: null, tag_id: null } },
    ]);
  });

  it("edits a rule read from the list, and deletes it after asking", async () => {
    const alert = jest.spyOn(Alert, "alert");
    serve({ rincomes: [rincome(3, { source: "Salary", amount: "2400.0", interval_count: 2 })] });
    mockParams.current = { kind: "income", id: "3" };
    renderScreen(<RecurringEdit />);
    expect(await screen.findByText("Edit recurring income")).toBeTruthy();
    expect(screen.getByTestId("finance-recurring-edit-name").props.value).toBe("Salary");
    expect(screen.getByTestId("finance-recurring-edit-repeat")).toHaveTextContent("Every 2 months");
    expect(screen.queryByTestId("finance-recurring-edit-backfill")).toBeNull();
    fireEvent.press(screen.getByTestId("finance-recurring-edit-delete"));
    expect(alert.mock.calls[0][0]).toBe("Delete “Salary”?");
    expect(alert.mock.calls[0][1]).toBe("The income it already added stays.");
    confirmAlert(alert);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/recurring_incomes/3`]);
    alert.mockRestore();
  });
});

// ── Categories ──────────────────────────────────────────────────────────
describe("categories", () => {
  const TAGS = [FOOD, tag(4, "Groceries", 3), tag(5, "Restaurants", 3), tag(6, "Rent")];

  it("lists the categories with their subcategory count, and opens one", async () => {
    serve({ tags: TAGS });
    renderScreen(<Categories />);
    expect(await screen.findByText("Food")).toBeTruthy();
    expect(screen.queryByText("Groceries")).toBeNull();
    expect(screen.getByTestId("finance-category-count-3")).toHaveTextContent("2 subcategories");
    expect(screen.getByTestId("finance-category-count-6")).toHaveTextContent("0 subcategories");
    fireEvent.press(screen.getByTestId("finance-category-open-3"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/finance/categories", params: { parent: "3" } });
  });

  it("lists the newest category first; A–Z on request", async () => {
    serve({ tags: [FOOD, tag(6, "Rent"), tag(7, "Books")] });
    renderScreen(<Categories />);
    expect(await screen.findByText("Food")).toBeTruthy();
    const order = () => screen.getAllByTestId(/^finance-category-\d+$/).map((n) => n.props.testID);
    expect(order()).toEqual(["finance-category-7", "finance-category-6", "finance-category-3"]);
    expect(screen.getByTestId("finance-categories-sort")).toHaveTextContent("Newest first");
    fireEvent.press(screen.getByTestId("finance-categories-sort"));
    expect(screen.getByTestId("finance-categories-sort")).toHaveTextContent("A–Z");
    expect(order()).toEqual(["finance-category-7", "finance-category-3", "finance-category-6"]);
  });

  it("one category's level shows its subcategories, and adds one under it", async () => {
    serve({ tags: TAGS });
    mockParams.current = { parent: "3" };
    renderScreen(<Categories />);
    expect(await screen.findByText("Groceries")).toBeTruthy();
    expect(screen.getByTestId("header-title")).toHaveTextContent("Food");
    expect(screen.getByText("Restaurants")).toBeTruthy();
    expect(screen.queryByText("Rent")).toBeNull();
    fireEvent.press(screen.getByTestId("finance-categories-new"));
    fireEvent.changeText(screen.getByTestId("pages-name-input"), "Snacks");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    expect(await screen.findByText("Snacks")).toBeTruthy();
    expect(bodies("post", `${B}/tags`)).toEqual([{ tag: { name: "Snacks", parent_id: 3 } }]);
  });

  it("adds a category, and says so when the name is taken", async () => {
    serve({ tags: TAGS });
    renderScreen(<Categories />);
    await screen.findByText("Food");
    fireEvent.press(screen.getByTestId("finance-categories-new"));
    fireEvent.changeText(screen.getByTestId("pages-name-input"), "Travel");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    expect(await screen.findByText("Travel")).toBeTruthy();
    expect(bodies("post", `${B}/tags`)).toEqual([{ tag: { name: "Travel", parent_id: null } }]);
    fireEvent.press(screen.getByTestId("finance-categories-new"));
    fireEvent.changeText(screen.getByTestId("pages-name-input"), "rent");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    expect(await screen.findByText("Could not save. That name may already be taken.")).toBeTruthy();
  });

  it("renames one", async () => {
    serve({ tags: TAGS });
    renderScreen(<Categories />);
    await screen.findByText("Rent");
    fireEvent.press(screen.getByTestId("finance-category-rename-6"));
    expect(screen.getByTestId("pages-name-input").props.value).toBe("Rent");
    fireEvent.changeText(screen.getByTestId("pages-name-input"), "Housing");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    expect(await screen.findByText("Housing")).toBeTruthy();
    await waitFor(() => expect(bodies("put", `${B}/tags/6`)).toEqual([{ tag: { name: "Housing" } }]));
  });

  it("deletes one after an Alert that names its subcategories and its budgets", async () => {
    const alert = jest.spyOn(Alert, "alert");
    serve({ tags: TAGS });
    renderScreen(<Categories />);
    await screen.findByText("Food");
    fireEvent.press(screen.getByTestId("finance-category-delete-3"));
    expect(alert.mock.calls[0][0]).toBe("Delete “Food”?");
    expect(alert.mock.calls[0][1]).toBe("Its 2 subcategories and any budget on it go too. Your entries stay, without this category.");
    confirmAlert(alert);
    await waitFor(() => expect(screen.queryByText("Food")).toBeNull());
    expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/tags/3`]);
    fireEvent.press(screen.getByTestId("finance-category-delete-6"));
    expect(alert.mock.calls[1][1]).toBe("Any budget on it goes too. Your entries stay, without this category.");
    alert.mockRestore();
  });

  it("with none, says so", async () => {
    serve({ tags: [] });
    renderScreen(<Categories />);
    expect(await screen.findByText("No categories")).toBeTruthy();
  });
});

// ── Reports ─────────────────────────────────────────────────────────────
describe("reports", () => {
  const now = new Date();
  const YEAR = now.getFullYear();
  const MONTH = now.getMonth() + 1;
  beforeEach(() => {
    mock.onGet(`${B}/reports/summary`, { params: { year: YEAR, month: MONTH } }).reply(200, {
      year: YEAR, month: MONTH,
      totals: { expenses: { eur: "100.0", usd: "5.0" }, incomes: { eur: "2400.0" }, net: { eur: "2300.0", usd: "-5.0" } },
      by_tag: [{ tag: "Food", currency: "eur", amount: "80.0" }, { tag: "Rent", currency: "eur", amount: "20.0" }],
    });
    mock.onGet(`${B}/reports/summary`, { params: { year: YEAR } }).reply(200, { year: YEAR, month: null, totals: { expenses: { eur: "1200.0" }, incomes: { eur: "28800.0" }, net: 0 }, by_tag: [] });
  });

  it("shows the month's income, expenses and net per currency, and spend by category", async () => {
    renderScreen(<Reports />);
    expect(await screen.findByTestId("finance-reports-income-value")).toHaveTextContent("€2,400.00");
    expect(screen.getByTestId("finance-reports-expenses-value")).toHaveTextContent("€100.00 · $5.00");
    expect(screen.getByTestId("finance-reports-net-value")).toHaveTextContent("€2,300.00 · -$5.00");
    expect(within(screen.getByTestId("finance-reports-category-0")).getByText("Food")).toBeTruthy();
    expect(within(screen.getByTestId("finance-reports-category-0")).getByText("€80.00")).toBeTruthy();
    expect(within(screen.getByTestId("finance-reports-category-1")).getByText("Rent")).toBeTruthy();
  });

  it("the whole year asks for the year alone", async () => {
    renderScreen(<Reports />);
    await screen.findByText("Food");
    fireEvent.press(screen.getByTestId("finance-reports-period-mode"));
    expect(await screen.findByText("€1,200.00")).toBeTruthy();
    expect(screen.getByTestId("finance-reports-net-value")).toHaveTextContent("€0.00");
    expect(screen.getByText("Nothing spent in this period.")).toBeTruthy();
    expect(screen.getByTestId("finance-reports-period-label")).toHaveTextContent(String(YEAR));
  });

  it("exports: the file for the range is downloaded with file_format, then shared", async () => {
    renderScreen(<Reports />);
    await screen.findByText("Food");
    expect(screen.getByText("All time: the dates do not apply to loans.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("finance-export-expenses-xlsx"));
    await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalledTimes(1));
    const first = startOfMonth(TODAY);
    const last = addDays(addMonths(first, 1), -1);
    const [url, target] = files.File.downloadFileAsync.mock.calls[0] as [string, { uri: string }];
    expect(url).toContain(`${B}/reports/export?`);
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ resource: "expenses", file_format: "xlsx", from: first, to: last });
    expect(sharing.shareAsync.mock.calls[0][0]).toBe(target.uri);
    expect(sharing.shareAsync.mock.calls[0][1]).toMatchObject({ mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  });

  it("says so when an export fails", async () => {
    files.File.downloadFileAsync.mockRejectedValueOnce(new Error("offline"));
    renderScreen(<Reports />);
    await screen.findByText("Food");
    fireEvent.press(screen.getByTestId("finance-export-loans-pdf"));
    expect(await screen.findByText("Could not export. Try again.")).toBeTruthy();
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });
});

// ── Trash ───────────────────────────────────────────────────────────────
describe("trash", () => {
  it("restores an expense: it leaves the trash and a toast says so", async () => {
    serve({ trash: { expenses: [expense(11, { item: "Lunch" }), expense(12, { item: "Taxi" })] } });
    renderScreen(<Trash />);
    expect(await screen.findByText("Lunch")).toBeTruthy();
    fireEvent.press(screen.getByTestId("finance-trash-restore-11"));
    expect(await screen.findByText("Restored")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Lunch")).toBeNull());
    expect(screen.getByText("Taxi")).toBeTruthy();
    expect(mock.history.put.map((r) => r.url)).toEqual([`${B}/expenses/11/restore`]);
  });

  it("deletes a loan forever after asking", async () => {
    const alert = jest.spyOn(Alert, "alert");
    serve({ trash: { loans: [loan(31)] } });
    renderScreen(<Trash />);
    await screen.findByText("The trash is empty");
    fireEvent.press(screen.getByTestId("finance-trash-kind-loans"));
    expect(await screen.findByText("Quinn QA")).toBeTruthy();
    expect(screen.getByText(/You lent/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("finance-trash-destroy-31"));
    expect(alert.mock.calls[0][0]).toBe("Delete “Quinn QA” forever?");
    expect(alert.mock.calls[0][1]).toBe("This cannot be undone.");
    confirmAlert(alert);
    await waitFor(() => expect(screen.queryByText("Quinn QA")).toBeNull());
    expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/loans/31/destroy_permanently`]);
    alert.mockRestore();
  });

  it("lists incomes in their tab", async () => {
    serve({ trash: { incomes: [income(21, { source: "Bonus" })] } });
    renderScreen(<Trash />);
    await screen.findByText("The trash is empty");
    fireEvent.press(screen.getByTestId("finance-trash-kind-incomes"));
    expect(await screen.findByText("Bonus")).toBeTruthy();
  });
});

// ── French ──────────────────────────────────────────────────────────────
describe("in French", () => {
  it("budgets and recurring speak French", async () => {
    await i18n.changeLanguage("fr");
    serve({ budgets: [budget(2, { tag_id: null, tag: null })], rexpenses: [rexpense(1, { item: "Assurance", interval_count: 3 })] });
    renderScreen(<BudgetsTab />);
    expect(await screen.findByText("Budget global")).toBeTruthy();
    expect(screen.getByText("Mensuel")).toBeTruthy();
    expect(screen.getByTestId("finance-budget-of-2").props.children.replace(/\s/g, " ")).toBe("€120,00 sur €300,00");
    screen.unmount();
    renderScreen(<Recurring />);
    expect(await screen.findByText("Tous les 3 mois")).toBeTruthy();
    expect(screen.getByText("Mettre en pause")).toBeTruthy();
    expect(screen.getByText("1 opération")).toBeTruthy();
  });
});
