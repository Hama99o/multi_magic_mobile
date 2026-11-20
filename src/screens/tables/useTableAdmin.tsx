/**
 * TABLE AND BASE ADMIN from the table screen's ⋯ menu (increment 6a; the
 * web's tab menu `TableMenuPanels.tsx`, `TableTabs.tsx`, `BaseForm.tsx`):
 * rename or describe the table, duplicate it (with or without its rows),
 * clear its data to the trash with one Undo, add a table, put the tables in
 * order, edit the base. Editors only (`BasePolicy#manage?`); deleting stays
 * where it was (the exact-name sheets).
 *
 * Returns the menu's actions and the sheets they open, so `table.tsx` only
 * places them.
 */
import { useState, type ReactNode } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tablesApi, type Base, type Table } from "@/api/tables";
import { failureMessage } from "@/api/failure";
import { ArrowUpDown, Columns3, Copy, Eraser, Palette, Pencil, Plus } from "@/components/icons";
import { ActionSheet, type SheetAction } from "@/screens/contacts/ActionSheet";
import { useTablesUndo } from "@/stores/tablesUndo.store";
import { ManageTablesSheet, NameSheet, type NameSheetValue } from "./AdminSheets";
import { ColumnsSheet } from "./ColumnsSheet";
import { FieldEditorSheet } from "./FieldEditorSheet";
import type { FieldDefinition } from "@/api/fields";

type AdminSheet = "rename" | "duplicate" | "newTable" | "editBase" | "manage" | "columns" | "field" | null;

/** After a sheet has slid away (iOS will not present a second Modal over one leaving). */
const later = (fn: () => void) => setTimeout(fn, 320);

export function useTableAdmin({ table, base, editable, onOpenTable }: { table: Table | undefined; base: Base | undefined; editable: boolean; onOpenTable: (id: number) => void }): { actions: SheetAction[]; sheets: ReactNode } {
  const { t } = useTranslation();
  const client = useQueryClient();
  const offerUndo = useTablesUndo((s) => s.offerUndo);
  const [sheet, setSheet] = useState<AdminSheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The column being edited (null: a new one), while the editor is open.
  const [editing, setEditing] = useState<FieldDefinition | null>(null);

  const refresh = async (tableId?: number) => {
    await client.invalidateQueries({ queryKey: tablesKeys.baseLists() });
    if (tableId) await client.invalidateQueries({ queryKey: tablesKeys.table(tableId) });
  };
  const run = async <R,>(work: () => Promise<R>, failed: string): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const out = await work();
      setSheet(null);
      return out;
    } catch (e) {
      setError(failureMessage(e, failed));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  /** A table made or copied: the lists refresh, then it opens. */
  const opened = async (made: Table | undefined) => {
    if (!made) return;
    await refresh();
    onOpenTable(made.id);
  };
  const open = (s: AdminSheet) => later(() => {
    setError(null);
    setSheet(s);
  });

  if (!editable || !table || !base) return { actions: [], sheets: null };

  const clear = () =>
    Alert.alert(t("tables.admin.clearTitle", { table: table.name }), t("tables.admin.clearBody"), [
      { text: t("fields.cancel"), style: "cancel" },
      {
        text: t("tables.admin.clear"),
        style: "destructive",
        onPress: () =>
          void tablesApi
            .clearTable(table.id)
            .then(async ({ deleted, trashedAt }) => {
              await client.invalidateQueries({ queryKey: tablesKeys.rows(table.id) });
              offerUndo(t("tables.admin.cleared", { count: deleted }), async () => {
                await tablesApi.restoreCleared(table.id, trashedAt);
                await client.invalidateQueries({ queryKey: tablesKeys.rows(table.id) });
              });
            })
            .catch((e: unknown) => Alert.alert(failureMessage(e, t("tables.admin.failed")))),
      },
    ]);

  const actions: SheetAction[] = [
    { key: "columns", label: t("tables.columns.title"), hint: t("tables.columns.shared"), icon: Columns3, onPress: () => open("columns") },
    { key: "rename", label: t("tables.admin.renameTable"), icon: Pencil, onPress: () => open("rename") },
    { key: "duplicate", label: t("tables.admin.duplicateTable"), icon: Copy, onPress: () => open("duplicate") },
    { key: "clear", label: t("tables.admin.clearAction"), hint: t("tables.admin.clearHint"), icon: Eraser, danger: true, onPress: () => later(clear) },
    { key: "newTable", label: t("tables.admin.newTable"), icon: Plus, onPress: () => open("newTable") },
    ...(base.tables.length > 1 ? [{ key: "manage", label: t("tables.admin.manageTables"), icon: ArrowUpDown, onPress: () => open("manage") }] : []),
    { key: "editBase", label: t("tables.admin.editBase"), icon: Palette, onPress: () => open("editBase") },
  ];

  const close = () => setSheet(null);
  const sheets = (
    <>
      {sheet === "columns" ? (
        <ColumnsSheet
          tableId={table.id}
          fields={table.fields}
          primaryFieldId={table.primaryFieldId}
          onEdit={(f) => {
            setSheet(null);
            later(() => {
              setEditing(f);
              setSheet("field");
            });
          }}
          onAdd={() => {
            setSheet(null);
            later(() => {
              setEditing(null);
              setSheet("field");
            });
          }}
          onClose={close}
        />
      ) : null}
      {sheet === "field" ? (
        <FieldEditorSheet
          table={table}
          tables={base.tables}
          field={editing}
          onDone={() => {
            setSheet(null);
            later(() => setSheet("columns"));
          }}
          onClose={() => {
            setSheet(null);
            later(() => setSheet("columns"));
          }}
        />
      ) : null}
      {sheet === "rename" ? (
        <NameSheet
          title={t("tables.admin.renameTable")}
          initial={{ name: table.name, description: table.description }}
          withDescription
          saveLabel={t("tables.admin.save")}
          busy={busy}
          error={error}
          onSave={(v: NameSheetValue) => void run(() => tablesApi.updateTable(table.id, { name: v.name, description: v.description }), t("tables.admin.failed")).then((done) => done && refresh(table.id))}
          onClose={close}
          testID="tables-rename"
        />
      ) : null}
      <ActionSheet
        open={sheet === "duplicate"}
        title={t("tables.admin.duplicateTable")}
        subtitle={table.name}
        actions={[
          { key: "withRows", label: t("tables.admin.withRows"), icon: Copy, onPress: () => void run(() => tablesApi.duplicateTable(table.id, { withRows: true }), t("tables.admin.failed")).then(opened) },
          { key: "columnsOnly", label: t("tables.admin.columnsOnly"), icon: Copy, onPress: () => void run(() => tablesApi.duplicateTable(table.id, { withRows: false }), t("tables.admin.failed")).then(opened) },
        ]}
        onClose={close}
        testID="tables-duplicate"
      />
      {sheet === "newTable" ? (
        <NameSheet
          title={t("tables.admin.newTable")}
          initial={{ name: "" }}
          saveLabel={t("tables.admin.create")}
          note={t("tables.admin.newTableNote", { base: base.name })}
          busy={busy}
          error={error}
          onSave={(v) => void run(() => tablesApi.createTable(base.id, v.name), t("tables.admin.failed")).then(opened)}
          onClose={close}
          testID="tables-new-table"
        />
      ) : null}
      {sheet === "manage" ? (
        <ManageTablesSheet tables={base.tables} busy={busy} error={error} onSave={(ids) => void run(() => tablesApi.reorderTables(base.id, ids), t("tables.admin.failed")).then((done) => done && refresh())} onClose={close} />
      ) : null}
      {sheet === "editBase" ? (
        <NameSheet
          title={t("tables.admin.editBase")}
          initial={{ name: base.name, description: base.description, color: base.color }}
          withDescription
          withColor
          saveLabel={t("tables.admin.save")}
          note={t("tables.admin.baseNote")}
          busy={busy}
          error={error}
          onSave={(v) => void run(() => tablesApi.updateBase(base.id, { name: v.name, description: v.description, ...(v.color ? { color: v.color } : {}) }), t("tables.admin.failed")).then((done) => done && refresh())}
          onClose={close}
          testID="tables-edit-base"
        />
      ) : null}
    </>
  );
  return { actions, sheets };
}
