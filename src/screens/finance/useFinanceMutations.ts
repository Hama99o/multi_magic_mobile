/**
 * Finance writes (`docs/DATA_LAYER.md` rule 3). A removal is OPTIMISTIC: the
 * row leaves every list that holds it before the server answers, and comes
 * back on refusal. Every write settles by invalidating `financeKeys.all`,
 * because one expense moves its list, the month's totals, the charts and the
 * budgets at once, and a narrower invalidation is how one of them goes stale.
 *
 * Not optimistic, on purpose: creating or editing an entry, a loan, a budget
 * or a payment. The server decides what the screen would have to guess: the
 * category names, a loan's paid status, a budget's spent amount.
 *
 * Deleting an expense, an income or a loan is a soft delete, so Undo is the
 * server's own `restore` (`useRestoreEntry`).
 */
import { useMutation, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import {
  financeApi,
  type Budget,
  type BudgetInput,
  type EntryInput,
  type Income,
  type Loan,
  type LoanInput,
  type Page,
  type Recurring,
  type RecurringInput,
  type Tag,
} from "@/api/finance";

type Snapshot = [QueryKey, unknown][];
type Opts<T = unknown> = { onError?: (e: unknown) => void; onDone?: (result: T) => void };
export type EntryKind = "expense" | "income" | "loan";

async function snapshot(client: QueryClient, prefixes: QueryKey[]): Promise<Snapshot> {
  await Promise.all(prefixes.map((queryKey) => client.cancelQueries({ queryKey })));
  return prefixes.flatMap((queryKey) => client.getQueriesData({ queryKey }));
}
function restore(client: QueryClient, saved: Snapshot | undefined) {
  for (const [queryKey, data] of saved ?? []) client.setQueriesData({ queryKey, exact: true }, data);
}
const settleAll = (client: QueryClient) => client.invalidateQueries({ queryKey: financeKeys.all });

const listKey = (kind: EntryKind): QueryKey => (kind === "expense" ? financeKeys.expenseLists() : kind === "income" ? financeKeys.incomeLists() : financeKeys.loanLists());

/** Take one row out of every page of every list under `prefix`, and its count. */
function dropRow(client: QueryClient, prefix: QueryKey, rowId: number) {
  client.setQueriesData<InfiniteData<Page<{ id: number }>>>({ queryKey: prefix }, (data) =>
    data?.pages
      ? { ...data, pages: data.pages.map((p) => (p.rows.some((r) => r.id === rowId) ? { ...p, rows: p.rows.filter((r) => r.id !== rowId), count: Math.max(0, p.count - 1) } : p)) }
      : data,
  );
}

/** Delete to the trash (soft), out of its lists at once. */
export function useDeleteEntry(kind: EntryKind, opts: Opts<{ id: number }> = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (row: { id: number }) =>
      kind === "expense" ? financeApi.expenses.remove(row.id) : kind === "income" ? financeApi.incomes.remove(row.id) : financeApi.loans.remove(row.id),
    onMutate: async (row) => {
      const saved = await snapshot(client, [listKey(kind)]);
      dropRow(client, listKey(kind), row.id);
      return { saved };
    },
    onSuccess: (_r, row) => opts.onDone?.(row),
    onError: (e, _row, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

/** Undo a delete, or restore from the trash: the server's `restore`. */
export function useRestoreEntry(kind: EntryKind, opts: Opts = {}) {
  const client = useQueryClient();
  const trash = financeKeys.trash(kind === "expense" ? "expenses" : kind === "income" ? "incomes" : "loans");
  return useMutation({
    mutationFn: (rowId: number) =>
      kind === "expense" ? financeApi.expenses.restore(rowId) : kind === "income" ? financeApi.incomes.restore(rowId) : financeApi.loans.restore(rowId),
    // Out of the trash at once (an Undo has nothing in a trash list to move).
    onMutate: async (rowId) => {
      const saved = await snapshot(client, [trash]);
      dropRow(client, trash, rowId);
      return { saved };
    },
    onSuccess: () => opts.onDone?.(undefined),
    onError: (e, _id, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

/** Delete forever, from the trash. */
export function useDestroyForever(kind: EntryKind, opts: Opts = {}) {
  const client = useQueryClient();
  const trash = financeKeys.trash(kind === "expense" ? "expenses" : kind === "income" ? "incomes" : "loans");
  return useMutation({
    mutationFn: (rowId: number) =>
      kind === "expense" ? financeApi.expenses.destroyForever(rowId) : kind === "income" ? financeApi.incomes.destroyForever(rowId) : financeApi.loans.destroyForever(rowId),
    onMutate: async (rowId) => {
      const saved = await snapshot(client, [trash]);
      dropRow(client, trash, rowId);
      return { saved };
    },
    onError: (e, _id, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

/** New or edited expense or income. */
export function useSaveEntry(kind: "expense" | "income", opts: Opts<{ id: number }> = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: EntryInput }): Promise<{ id: number }> =>
      kind === "expense"
        ? id == null
          ? financeApi.expenses.create(input)
          : financeApi.expenses.update(id, input)
        : id == null
          ? financeApi.incomes.create(input)
          : financeApi.incomes.update(id, input),
    onSuccess: (row) => opts.onDone?.(row),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settleAll(client),
  });
}

export function useConfirmIncome(opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ income, amount }: { income: Income; amount: number }) => financeApi.incomes.confirm(income.id, amount),
    onMutate: async ({ income }) => {
      const saved = await snapshot(client, [financeKeys.pendingIncomes()]);
      client.setQueryData<Income[]>(financeKeys.pendingIncomes(), (rows) => rows?.filter((r) => r.id !== income.id));
      return { saved };
    },
    onSuccess: () => opts.onDone?.(undefined),
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

/** A pending income that will not come: deleted for good (the web's Discard). */
export function useDiscardIncome(opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (income: Income) => financeApi.incomes.destroyForever(income.id),
    onMutate: async (income) => {
      const saved = await snapshot(client, [financeKeys.pendingIncomes()]);
      client.setQueryData<Income[]>(financeKeys.pendingIncomes(), (rows) => rows?.filter((r) => r.id !== income.id));
      return { saved };
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

export function useSaveLoan(opts: Opts<Loan> = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: LoanInput }) => (id == null ? financeApi.loans.create(input) : financeApi.loans.update(id, input)),
    onSuccess: (loan) => {
      client.setQueryData(financeKeys.loan(loan.id), loan);
      opts.onDone?.(loan);
    },
    onError: (e) => opts.onError?.(e),
    onSettled: () => settleAll(client),
  });
}

/** The server decides the new status (paid once nothing remains) and refuses an overpayment. */
export function useAddPayment(loanId: number, opts: Opts<Loan> = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ amount, day }: { amount: number; day: string }) => financeApi.loans.addPayment(loanId, amount, day),
    onSuccess: (loan) => {
      client.setQueryData(financeKeys.loan(loanId), loan);
      opts.onDone?.(loan);
    },
    onError: (e) => opts.onError?.(e),
    onSettled: () => settleAll(client),
  });
}

export function useDeletePayment(loanId: number, opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: number) => financeApi.loans.removePayment(paymentId),
    onMutate: async (paymentId) => {
      const saved = await snapshot(client, [financeKeys.loan(loanId)]);
      client.setQueryData<Loan>(financeKeys.loan(loanId), (loan) => {
        if (!loan) return loan;
        const gone = loan.payments.find((p) => p.id === paymentId);
        if (!gone) return loan;
        const totalPaid = Math.round((loan.totalPaid - gone.amount) * 100) / 100;
        return { ...loan, payments: loan.payments.filter((p) => p.id !== paymentId), totalPaid, remaining: Math.round((loan.amount - totalPaid) * 100) / 100, status: "unpaid" };
      });
      return { saved };
    },
    onError: (e, _id, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

export function useSaveBudget(opts: Opts<Budget> = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: BudgetInput }) => (id == null ? financeApi.budgets.create(input) : financeApi.budgets.update(id, input)),
    onSuccess: (b) => opts.onDone?.(b),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settleAll(client),
  });
}

export function useDeleteBudget(opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (budgetId: number) => financeApi.budgets.remove(budgetId),
    onMutate: async (budgetId) => {
      const saved = await snapshot(client, [financeKeys.budgets()]);
      client.setQueryData<Budget[]>(financeKeys.budgets(), (rows) => rows?.filter((r) => r.id !== budgetId));
      return { saved };
    },
    onError: (e, _id, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

export function useSaveRecurring(kind: "expense" | "income", opts: Opts<Recurring> = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: RecurringInput }) => (id == null ? financeApi.recurring.create(kind, input) : financeApi.recurring.update(kind, id, input)),
    onSuccess: (r) => opts.onDone?.(r),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settleAll(client),
  });
}

/** Pause or resume: shown at once. */
export function useToggleRecurring(kind: "expense" | "income", opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (r: Recurring) => financeApi.recurring.update(kind, r.id, { active: !r.active }),
    onMutate: async (r) => {
      const saved = await snapshot(client, [financeKeys.recurring(kind)]);
      client.setQueryData<Recurring[]>(financeKeys.recurring(kind), (rows) => rows?.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)));
      return { saved };
    },
    onError: (e, _r, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

export function useDeleteRecurring(kind: "expense" | "income", opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (recurringId: number) => financeApi.recurring.remove(kind, recurringId),
    onMutate: async (recurringId) => {
      const saved = await snapshot(client, [financeKeys.recurring(kind)]);
      client.setQueryData<Recurring[]>(financeKeys.recurring(kind), (rows) => rows?.filter((r) => r.id !== recurringId));
      return { saved };
    },
    onError: (e, _id, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

/** Run a recurring income now: one income dated today. */
export function useRunRecurringIncome(opts: Opts<Income> = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (recurringId: number) => financeApi.recurring.runIncome(recurringId),
    onSuccess: (i) => opts.onDone?.(i),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settleAll(client),
  });
}

export function useCreateTag(opts: Opts<Tag> = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: number | null }) => financeApi.tags.create(name, parentId),
    onSuccess: (tag) => {
      client.setQueryData<Tag[]>(financeKeys.tags(), (rows) => (rows ? [...rows, tag].sort((a, b) => a.name.localeCompare(b.name)) : rows));
      opts.onDone?.(tag);
    },
    onError: (e) => opts.onError?.(e),
    onSettled: () => client.invalidateQueries({ queryKey: financeKeys.tags() }),
  });
}

export function useRenameTag(opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => financeApi.tags.rename(id, name),
    onMutate: async ({ id, name }) => {
      const saved = await snapshot(client, [financeKeys.tags()]);
      client.setQueryData<Tag[]>(financeKeys.tags(), (rows) => rows?.map((t) => (t.id === id ? { ...t, name } : t)));
      return { saved };
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}

/** Its subcategories go too (and its budgets, server side). */
export function useDeleteTag(opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tagId: number) => financeApi.tags.remove(tagId),
    onMutate: async (tagId) => {
      const saved = await snapshot(client, [financeKeys.tags()]);
      client.setQueryData<Tag[]>(financeKeys.tags(), (rows) => rows?.filter((t) => t.id !== tagId && t.parentId !== tagId));
      return { saved };
    },
    onError: (e, _id, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settleAll(client),
  });
}
