/**
 * "Export…" from the table's ⋯ menu (increment 7): the view as this person
 * sees it (their search, filters, sorts and visible columns) as Excel or CSV,
 * handed to the share sheet (Files, WhatsApp, mail…). Everyone who can open
 * the table may export it (`TablePolicy#show?`). See `exportFlow.ts` for the
 * waiting.
 */
import { useState, type ReactNode } from "react";
import { Alert } from "react-native";
import * as Sharing from "expo-sharing";
import { useTranslation } from "react-i18next";
import { tablesApi, type ExportFormat, type FilterCondition, type SortRule } from "@/api/tables";
import { failureMessage } from "@/api/failure";
import { Download, FileSpreadsheet, FileText } from "@/components/icons";
import { ActionSheet, type SheetAction } from "@/screens/contacts/ActionSheet";
import { settleExport } from "./exportFlow";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useTableExport({ tableId, query, fieldIds }: { tableId: number; query: { search?: string; filters?: FilterCondition[]; match?: "and" | "or"; sorts?: SortRule[] } | null; fieldIds: number[] }): { action: SheetAction | null; sheet: ReactNode; busy: boolean } {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (format: ExportFormat) => {
    if (!query || busy) return;
    setBusy(true);
    try {
      const started = await tablesApi.startExport(tableId, format, { ...query, fieldIds });
      const out = await settleExport(started, (id) => tablesApi.exportStatus(id), wait);
      if (out.kind === "failed") Alert.alert(t("tables.export.failed"), out.message ?? undefined);
      else if (out.kind === "background") Alert.alert(t("tables.export.backgroundTitle"), t("tables.export.backgroundBody"));
      else {
        const uri = await tablesApi.downloadExport(out.export);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: out.export.filename ?? undefined });
      }
    } catch (e) {
      Alert.alert(t("tables.export.failed"), failureMessage(e, t("tables.export.failed")));
    } finally {
      setBusy(false);
    }
  };

  const action: SheetAction | null = query
    ? { key: "export", label: busy ? t("tables.export.preparing") : t("tables.export.action"), hint: t("tables.export.hint"), icon: Download, disabled: busy, onPress: () => setTimeout(() => setOpen(true), 320) }
    : null;
  const sheet = (
    <ActionSheet
      open={open}
      title={t("tables.export.action")}
      subtitle={t("tables.export.hint")}
      actions={[
        { key: "xlsx", label: t("tables.export.xlsx"), icon: FileSpreadsheet, onPress: () => void run("xlsx") },
        { key: "csv", label: t("tables.export.csv"), icon: FileText, onPress: () => void run("csv") },
      ]}
      onClose={() => setOpen(false)}
      testID="tables-export"
    />
  );
  return { action, sheet, busy };
}
