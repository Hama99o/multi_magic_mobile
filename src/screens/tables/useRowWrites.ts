/**
 * Writing rows (increment 2): through Tables' own endpoints (`tablesApi`), so
 * `TableApp::RecordWriter` checks each value and the table's history logs it.
 * A row's fields go through the shared editors with `FieldTarget.send`
 * (`useFieldWrites`); adding, duplicating and deleting are here.
 *
 * Every row of a table lives under `tablesKeys.rows(tableId)`: the pages of
 * each query, and each row page. An edit changes them all in place, then
 * refetches them.
 */
import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { CardinalityError, RECORD_TYPE, tablesApi, type RecordRow, type RecordsPage } from "@/api/tables";
import type { FieldDefinition, FieldValues } from "@/api/fields";
import type { FieldTarget } from "@/components/fields/useFieldWrites";

const isRow = (value: unknown): value is RecordRow => Boolean(value && typeof value === "object" && "values" in value && "linkLabels" in value);
const isPages = (value: unknown): value is InfiniteData<RecordsPage> => Boolean(value && typeof value === "object" && "pages" in value);
/** One page on its own (the calendar's "No date" rows). */
const isPage = (value: unknown): value is RecordsPage => Boolean(value && typeof value === "object" && "rows" in value && "hasMore" in value);

/** Change one row wherever it is cached: in every page of every query, and on its own page. */
export function editRow(client: QueryClient, tableId: number, recordId: number, edit: (row: RecordRow) => RecordRow) {
  client.setQueriesData({ queryKey: tablesKeys.rows(tableId) }, (data: unknown) => {
    if (isRow(data)) return data.id === recordId ? edit(data) : data;
    if (isPages(data)) return { ...data, pages: data.pages.map((p) => ({ ...p, rows: p.rows.map((r) => (r.id === recordId ? edit(r) : r)) })) };
    if (isPage(data)) return { ...data, rows: data.rows.map((r) => (r.id === recordId ? edit(r) : r)) };
    return data;
  });
}

/** Take rows out of every list of the table (a delete shows at once; the refetch confirms it). */
export function dropRows(client: QueryClient, tableId: number, ids: number[]) {
  const gone = new Set(ids);
  client.setQueriesData({ queryKey: tablesKeys.rows(tableId) }, (data: unknown) =>
    isPages(data)
      ? { ...data, pages: data.pages.map((p) => ({ ...p, rows: p.rows.filter((r) => !gone.has(r.id)) })) }
      : isPage(data)
        ? { ...data, rows: data.rows.filter((r) => !gone.has(r.id)) }
        : data,
  );
}

/** A row as a field target for the shared editors, sent the Tables way (SPEC C9, `FieldTarget.send`). */
export function rowFieldTarget(tableId: number, recordId: number): FieldTarget {
  return {
    record: { type: RECORD_TYPE, id: recordId },
    touched: [tablesKeys.rows(tableId)],
    edit: (client, change: (values: FieldValues) => FieldValues) => editRow(client, tableId, recordId, (r) => ({ ...r, values: change(r.values) })),
    send: {
      setValues: (values) => tablesApi.updateValues(recordId, values),
      link: async (field: FieldDefinition, linkedId: number) => {
        try {
          return await tablesApi.link(recordId, field.id, linkedId);
        } catch (error) {
          // Say WHICH link was refused, so the screen can offer "Replace".
          if (error instanceof CardinalityError) throw new RowLinkConflict(error.cardinality, field, linkedId);
          throw error;
        }
      },
      unlink: (field, selection) => tablesApi.unlink(recordId, field.id, selection.recordId),
    },
  };
}

/** A one-link column already full: which column, which row was asked for, and which one is there. */
export class RowLinkConflict extends CardinalityError {
  constructor(
    cardinality: { id: number; label: string | null },
    public readonly field: FieldDefinition,
    public readonly linkedId: number,
  ) {
    super(cardinality);
  }
}

export function useCreateRow(tableId: number, opts: { onCreated: (row: RecordRow) => void; onError: (e: unknown) => void }) {
  const client = useQueryClient();
  return useMutation({
    // Values to start with: the kanban column it is added in, the calendar day.
    mutationFn: (values: Record<number, unknown> | void) => tablesApi.createRecord(tableId, values ?? {}),
    onSuccess: (row) => {
      void client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) });
      opts.onCreated(row);
    },
    onError: opts.onError,
  });
}

export function useDuplicateRow(tableId: number, opts: { onCreated: (row: RecordRow) => void; onError: (e: unknown) => void }) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (recordId: number) => tablesApi.duplicate(recordId),
    onSuccess: (row) => {
      void client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) });
      opts.onCreated(row);
    },
    onError: opts.onError,
  });
}

/** Delete to the row trash; `restore` is the Undo. The row leaves every list at once. */
export function useDeleteRow(tableId: number, opts: { onDeleted: (recordId: number) => void; onError: (e: unknown) => void }) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (recordId: number) => tablesApi.destroy(recordId),
    onSuccess: (_, recordId) => {
      dropRows(client, tableId, [recordId]);
      void client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) });
      opts.onDeleted(recordId);
    },
    onError: opts.onError,
  });
}

export async function restoreRows(client: QueryClient, tableId: number, ids: number[]) {
  await tablesApi.restore(tableId, ids);
  await client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) });
}

/**
 * Move a row to another value of one column (a kanban card to a column):
 * shown at once, sent through `records#update`, put back if refused. The
 * value before goes to `onMoved`, for the Undo.
 */
export function useMoveRow(tableId: number, opts: { onMoved: (row: RecordRow, before: unknown) => void; onError: (e: unknown) => void }) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ row, field, value }: { row: RecordRow; field: FieldDefinition; value: unknown; before: unknown }) => tablesApi.updateValues(row.id, { [field.id]: value }),
    onMutate: ({ row, field, value }) => editRow(client, tableId, row.id, (r) => ({ ...r, values: { ...r.values, [field.id]: { kind: "scalar", value } } })),
    onSuccess: (_, { row, before }) => {
      void client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) });
      opts.onMoved(row, before);
    },
    onError: (e, { row, field, before }) => {
      editRow(client, tableId, row.id, (r) => ({ ...r, values: { ...r.values, [field.id]: { kind: "scalar", value: before } } }));
      opts.onError(e);
    },
  });
}
