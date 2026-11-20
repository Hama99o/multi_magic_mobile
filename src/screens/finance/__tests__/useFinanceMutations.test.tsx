/**
 * The Finance writes the person sees at once, both ways (`docs/DATA_LAYER.md`
 * rule 3): gone from the list before the server answers, back on refusal.
 * The answer is held with a gate so "before it answers" is a real moment.
 */
import MockAdapter from "axios-mock-adapter";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http } from "@/api/http";
import { financeKeys } from "@/api/keys";
import type { Budget, Expense, Income, Loan, Page, Recurring } from "@/api/finance";
import { testQueryClient } from "@/__tests__/queryClient";
import { useConfirmIncome, useDeleteBudget, useDeleteEntry, useDeletePayment, useDiscardIncome, useRestoreEntry, useToggleRecurring } from "../useFinanceMutations";

const B = "/api/v1/my_finance_app";
let mock: MockAdapter;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
function gated(status: number, body: unknown = {}) {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, reply: async () => (await opened, [status, body] as [number, unknown]) };
}
const expense = (id: number) => ({ id, item: `E${id}`, amount: 10, currency: "eur", day: "2026-11-14" }) as Expense;
const pageOf = <T,>(rows: T[]): InfiniteData<Page<T>> => ({ pages: [{ rows, unreadable: 0, page: 1, pages: 1, count: rows.length, totals: { eur: 10 * rows.length } }], pageParams: [1] });
const KEY = financeKeys.expenses("", null, 2026, 11, false);
const listed = () => client.getQueryData<InfiniteData<Page<Expense>>>(KEY)!.pages[0].rows.map((e) => e.id);

beforeEach(() => {
  mock = new MockAdapter(http);
  client = testQueryClient({ queries: { gcTime: Infinity, retry: false, staleTime: Infinity }, mutations: { gcTime: Infinity } });
  client.setQueryData(KEY, pageOf([expense(1), expense(2)]));
});
afterEach(() => {
  mock.restore();
  client.clear();
});

describe("delete an expense", () => {
  it("leaves the list at once and the count drops; a refusal puts it back", async () => {
    const g = gated(500);
    mock.onDelete(`${B}/expenses/1`).reply(g.reply);
    const { result } = renderHook(() => useDeleteEntry("expense"), { wrapper });
    act(() => result.current.mutate(expense(1)));
    await waitFor(() => expect(listed()).toEqual([2]));
    expect(client.getQueryData<InfiniteData<Page<Expense>>>(KEY)!.pages[0].count).toBe(1);
    g.open();
    await waitFor(() => expect(listed()).toEqual([1, 2]));
  });
});

describe("delete, then Undo (a device pass, 2026-11-20: the header said €30 / 29 and a restored row stayed missing until a refresh)", () => {
  const first = () => client.getQueryData<InfiniteData<Page<Expense>>>(KEY)!.pages[0];

  it("the header's money total drops with the row, not only its count", async () => {
    mock.onDelete(`${B}/expenses/1`).reply(204);
    const { result } = renderHook(() => useDeleteEntry("expense"), { wrapper });
    act(() => result.current.mutate(expense(1)));
    await waitFor(() => expect(listed()).toEqual([2]));
    expect(first().count).toBe(1);
    expect(first().totals).toEqual({ eur: 10 });
  });

  it("a row on the SECOND page still changes the header, which reads the first", async () => {
    client.setQueryData(KEY, { pages: [{ rows: [expense(1)], unreadable: 0, page: 1, pages: 2, count: 2, totals: { eur: 20 } }, { rows: [expense(2)], unreadable: 0, page: 2, pages: 2, count: 2, totals: { eur: 20 } }], pageParams: [1, 2] });
    mock.onDelete(`${B}/expenses/2`).reply(204);
    const { result } = renderHook(() => useDeleteEntry("expense"), { wrapper });
    act(() => result.current.mutate(expense(2)));
    await waitFor(() => expect(first().count).toBe(1));
    expect(first().totals).toEqual({ eur: 10 });
  });

  it("Undo puts the row back where it was, with its amount, before any refetch; then asks the server again", async () => {
    mock.onDelete(`${B}/expenses/1`).reply(204);
    const g = gated(200, {});
    mock.onPatch(`${B}/expenses/1/restore`).reply(g.reply);
    mock.onPut(`${B}/expenses/1/restore`).reply(g.reply);
    mock.onPost(`${B}/expenses/1/restore`).reply(g.reply);
    const del = renderHook(() => useDeleteEntry("expense"), { wrapper });
    act(() => del.result.current.mutate(expense(1)));
    await waitFor(() => expect(listed()).toEqual([2]));
    const undo = renderHook(() => useRestoreEntry("expense"), { wrapper });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    act(() => undo.result.current.mutate(1));
    // At once, while the restore request is still in flight.
    await waitFor(() => expect(listed()).toEqual([1, 2]));
    expect(first().count).toBe(2);
    expect(first().totals).toEqual({ eur: 20 });
    g.open();
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });
});

describe("pending incomes", () => {
  const pending = [{ id: 5, source: "Rent", amount: 900, currency: "eur", status: "pending" }, { id: 6, source: "Bonus", amount: 50, currency: "eur", status: "pending" }] as Income[];
  beforeEach(() => client.setQueryData(financeKeys.pendingIncomes(), pending));
  const shown = () => client.getQueryData<Income[]>(financeKeys.pendingIncomes())!.map((i) => i.id);

  it("confirm takes it out of To confirm at once, and sends the edited amount", async () => {
    const g = gated(200, { income: { id: 5, source: "Rent", amount: "880.0", currency: "eur", status: "published" } });
    let sent: unknown;
    mock.onPut(`${B}/incomes/5/confirm`).reply((cfg) => {
      sent = JSON.parse(cfg.data);
      return g.reply();
    });
    const { result } = renderHook(() => useConfirmIncome(), { wrapper });
    act(() => result.current.mutate({ income: pending[0], amount: 880 }));
    await waitFor(() => expect(shown()).toEqual([6]));
    expect(sent).toEqual({ income: { amount: 880 } });
    g.open();
  });

  it("discard takes it out at once, and comes back on refusal", async () => {
    const g = gated(500);
    mock.onDelete(`${B}/incomes/6/destroy_permanently`).reply(g.reply);
    const { result } = renderHook(() => useDiscardIncome(), { wrapper });
    act(() => result.current.mutate(pending[1]));
    await waitFor(() => expect(shown()).toEqual([5]));
    g.open();
    await waitFor(() => expect(shown()).toEqual([5, 6]));
  });
});

describe("a loan's payment", () => {
  it("deleting one takes it off the loan and moves the remaining back at once", async () => {
    const loan = { id: 31, amount: 200, totalPaid: 80, remaining: 120, status: "unpaid", currency: "eur", payments: [{ id: 5, amount: 50, day: "x" }, { id: 6, amount: 30, day: "y" }] } as Loan;
    client.setQueryData(financeKeys.loan(31), loan);
    const g = gated(500);
    mock.onDelete(`${B}/loan_payments/5`).reply(g.reply);
    const { result } = renderHook(() => useDeletePayment(31), { wrapper });
    act(() => result.current.mutate(5));
    await waitFor(() => expect(client.getQueryData<Loan>(financeKeys.loan(31))!.payments.map((p) => p.id)).toEqual([6]));
    expect(client.getQueryData<Loan>(financeKeys.loan(31))).toMatchObject({ totalPaid: 30, remaining: 170 });
    g.open();
    await waitFor(() => expect(client.getQueryData<Loan>(financeKeys.loan(31))!.payments).toHaveLength(2));
  });
});

describe("budgets and recurring", () => {
  it("deleting a budget is at once, and undone on refusal", async () => {
    client.setQueryData<Budget[]>(financeKeys.budgets(), [{ id: 1 } as Budget, { id: 2 } as Budget]);
    const g = gated(500);
    mock.onDelete(`${B}/budgets/1`).reply(g.reply);
    const { result } = renderHook(() => useDeleteBudget(), { wrapper });
    act(() => result.current.mutate(1));
    await waitFor(() => expect(client.getQueryData<Budget[]>(financeKeys.budgets())!.map((b) => b.id)).toEqual([2]));
    g.open();
    await waitFor(() => expect(client.getQueryData<Budget[]>(financeKeys.budgets())!.map((b) => b.id)).toEqual([1, 2]));
  });

  it("pausing a recurring entry shows paused at once and sends active false", async () => {
    client.setQueryData<Recurring[]>(financeKeys.recurring("expense"), [{ id: 2, kind: "expense", active: true } as Recurring]);
    const g = gated(200, { recurring_expense: { id: 2, item: "Gym", amount: "30.0", currency: "eur", frequency: "monthly", interval_count: 1, start_date: "2026-01-05", active: false } });
    let sent: unknown;
    mock.onPut(`${B}/recurring_expenses/2`).reply((cfg) => {
      sent = JSON.parse(cfg.data);
      return g.reply();
    });
    const { result } = renderHook(() => useToggleRecurring("expense"), { wrapper });
    act(() => result.current.mutate({ id: 2, kind: "expense", active: true } as Recurring));
    await waitFor(() => expect(client.getQueryData<Recurring[]>(financeKeys.recurring("expense"))![0].active).toBe(false));
    expect(sent).toEqual({ recurring_expense: { active: false } });
    g.open();
  });
});
