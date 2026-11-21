/**
 * Writing one record's custom fields, for ANY owner: a Flow card today, a
 * Tables row tomorrow. The caller says which record, which cache keys hold
 * it, and how to edit its values in those caches (`FieldTarget`); the writes
 * here are the same for both apps.
 *
 * Scalars, links and removals are optimistic: the row changes on tap and a
 * refusal puts it back. An upload is not: the file's id and URL are the
 * server's, so the row shows it when the server answers.
 */
import { useRef } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { fieldsApi, type FieldDefinition, type FieldFile, type FieldRecord, type FieldValues, type Selection } from "@/api/fields";
import { useOptimistic } from "@/lib/optimistic";

export interface FieldTarget {
  record: FieldRecord;
  /** Every key holding this record's values. */
  touched: QueryKey[];
  /** Change this record's values in every cache that holds them. */
  edit: (client: QueryClient, change: (values: FieldValues) => FieldValues) => void;
  /**
   * How this record's values are SENT; the core endpoints (`fieldsApi`) when
   * absent, which is Flow's case. Only `run` differs: the optimistic guess,
   * its correction and the rollback are the same for both apps.
   *
   * Tables sets it (agreed with Flow's session, 2026-11-20), and it must stay
   * set: a table row written through `core/field_values#batch_update` skips
   * `TableApp::RecordWriter` (Tables' own value checks) and the table's
   * history (`row.updated`), and a link made through core selections skips
   * `records#link`'s history and its cardinality answer, the "Replace" the
   * web offers when a one-link column is already full. So it is not a
   * duplicate of the core path to be simplified away.
   */
  send?: {
    setValues?: (values: Record<number, unknown>) => Promise<unknown>;
    /** Must resolve to the real selection: `done` swaps the optimistic guess for it. */
    link?: (field: FieldDefinition, recordId: number) => Promise<Selection>;
    unlink?: (field: FieldDefinition, selection: Selection) => Promise<unknown>;
  };
}

type OnError = (error: unknown) => void;

export function useFieldWrites(target: FieldTarget, onError?: OnError) {
  const touched = () => target.touched;
  /**
   * The links the server has not answered yet, by field and record. A guess
   * carries `selectionId: -recordId`; unlinking it before the answer sent
   * DELETE …/-3 (a 404), and the link then landed on the server while the
   * screen showed none (review FL4, 88, 2026-11-21). An unlink of a pending
   * link waits for it, then deletes the REAL selection, or nothing if it failed.
   */
  const pending = useRef(new Map<string, Promise<Selection | null>>());
  const keyOf = (field: FieldDefinition, recordId: number) => `${field.id}:${recordId}`;

  const setScalar = useOptimistic({
    run: ({ field, value }: { field: FieldDefinition; value: unknown }) => target.send?.setValues?.({ [field.id]: value }) ?? fieldsApi.setValues(target.record, { [field.id]: value }),
    touched,
    apply: (client, { field, value }) => target.edit(client, (values) => ({ ...values, [field.id]: { kind: "scalar", value } })),
    onError,
  });

  /** A single-record field holds one link: the server replaces it, and so does the guess. */
  const link = useOptimistic({
    run: ({ field, recordId }: { field: FieldDefinition; recordId: number }) => {
      // Through the app's own endpoint when it has one (Tables' `send`), else core.
      const made = target.send?.link?.(field, recordId) ?? fieldsApi.addSelection(field, target.record, recordId);
      const key = keyOf(field, recordId);
      const settled = made.then(
        (s) => s,
        () => null,
      );
      pending.current.set(key, settled);
      void settled.finally(() => {
        if (pending.current.get(key) === settled) pending.current.delete(key);
      });
      return made;
    },
    touched,
    apply: (client, { field, recordId }) =>
      target.edit(client, (values) => {
        const before = values[field.id];
        const kept = before?.kind === "records" && field.fieldType === "multi_record" ? before.selections : [];
        const guess: Selection = { selectionId: -recordId, recordId, recordType: field.recordClass ?? "" };
        return { ...values, [field.id]: { kind: "records", selections: [...kept.filter((s) => s.recordId !== recordId), guess] } };
      }),
    done: (client, made, { field }) =>
      target.edit(client, (values) => {
        const before = values[field.id];
        const rows = before?.kind === "records" ? before.selections : [];
        return { ...values, [field.id]: { kind: "records", selections: rows.map((s) => (s.recordId === made.recordId ? made : s)) } };
      }),
    onError,
  });

  const unlink = useOptimistic({
    run: async ({ field, selection }: { field: FieldDefinition; selection: Selection }) => {
      const remove = (s: Selection) => target.send?.unlink?.(field, s) ?? fieldsApi.removeSelection(s.selectionId);
      if (selection.selectionId > 0) return remove(selection);
      // A guess: wait for its link, then delete what the server made.
      const made = await pending.current.get(keyOf(field, selection.recordId));
      if (made) await remove(made);
    },
    touched,
    apply: (client, { field, selection }) =>
      target.edit(client, (values) => {
        const before = values[field.id];
        const rows = before?.kind === "records" ? before.selections : [];
        return { ...values, [field.id]: { kind: "records", selections: rows.filter((s) => s.recordId !== selection.recordId) } };
      }),
    onError,
  });

  const upload = useOptimistic({
    run: ({ field, file }: { field: FieldDefinition; file: { uri: string; name: string; mimeType: string } }) => fieldsApi.upload(field, target.record, file),
    touched,
    done: (client, made: FieldFile, { field }) =>
      target.edit(client, (values) => {
        const before = values[field.id];
        const files = before?.kind === "files" && field.fieldType === "attachments" ? before.files : [];
        return { ...values, [field.id]: { kind: "files", files: [...files, made] } };
      }),
    onError,
  });

  const removeFile = useOptimistic({
    run: ({ file }: { field: FieldDefinition; file: FieldFile }) => fieldsApi.removeFile(file.id),
    touched,
    apply: (client, { field, file }) =>
      target.edit(client, (values) => {
        const before = values[field.id];
        const files = before?.kind === "files" ? before.files : [];
        return { ...values, [field.id]: { kind: "files", files: files.filter((f) => f.id !== file.id) } };
      }),
    onError,
  });

  return { setScalar, link, unlink, upload, removeFile };
}

export type FieldWrites = ReturnType<typeof useFieldWrites>;
