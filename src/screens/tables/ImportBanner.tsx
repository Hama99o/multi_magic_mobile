/**
 * THE IMPORT BANNER on the table screen (increment 7; the web's
 * `ImportBanner.tsx`): the running import's progress with Stop, then its
 * counts, with the refused rows named, until someone closes it (for every
 * device: `imports#dismiss`). Polled while it runs; when it finishes, the
 * rows are refreshed so what came in shows at once.
 */
import { useEffect, useRef } from "react";
import { Alert, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tableImportsApi, type TableImport } from "@/api/tableImports";
import { failureMessage } from "@/api/failure";
import { X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export const IMPORT_POLL_MS = 2000;
const isActive = (i: TableImport | null | undefined) => i?.status === "queued" || i?.status === "running";

export function ImportBanner({ tableId, canEdit }: { tableId: number; canEdit: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const latest = useQuery({
    queryKey: tablesKeys.imports(tableId),
    queryFn: () => tableImportsApi.latest(tableId),
    refetchInterval: (q) => (isActive(q.state.data) ? IMPORT_POLL_MS : false),
  });
  const imp = latest.data;
  const wasActive = useRef(false);
  useEffect(() => {
    // Running → finished: the rows it wrote show now, not on the next pull; so do the columns it made
    // (the table itself) and the base's row count (ee's review, M2b).
    if (wasActive.current && imp && !isActive(imp)) {
      void client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) });
      void client.invalidateQueries({ queryKey: tablesKeys.table(tableId) });
      void client.invalidateQueries({ queryKey: tablesKeys.baseLists() });
    }
    wasActive.current = isActive(imp);
  }, [imp, client, tableId]);

  if (!imp || imp.dismissedAt) return null;
  const active = isActive(imp);
  const act = (work: () => Promise<TableImport>) =>
    void work()
      .then(() => client.invalidateQueries({ queryKey: tablesKeys.imports(tableId) }))
      .catch((e: unknown) => Alert.alert(failureMessage(e, t("tables.import.banner.actionFailed"))));

  const line = active
    ? imp.cancelRequested
      ? t("tables.import.banner.stopping")
      : t("tables.import.banner.running", { file: imp.filename, done: imp.processedRows, total: imp.totalRows ?? "…", percent: imp.percent })
    : imp.status === "done"
      ? t("tables.import.banner.done", { file: imp.filename })
      : imp.status === "cancelled"
        ? t("tables.import.banner.cancelled", { file: imp.filename })
        : t("tables.import.banner.failed", { file: imp.filename });

  return (
    <View testID="tables-import-banner" accessibilityLiveRegion="polite" style={{ gap: 4, padding: metrics.space.sm, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: imp.status === "failed" ? colors.danger : colors.border, backgroundColor: colors.surface, marginBottom: metrics.space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <Text variant="label" style={{ flex: 1 }} testID="tables-import-banner-line">
          {line}
        </Text>
        {active && canEdit && !imp.cancelRequested ? (
          <Pressable testID="tables-import-banner-stop" onPress={() => act(() => tableImportsApi.cancel(imp.id))} accessibilityRole="button" accessibilityLabel={t("tables.import.banner.stop")} style={{ minHeight: 36, paddingHorizontal: metrics.space.md, justifyContent: "center" }}>
            <Text tone="danger" variant="label">
              {t("tables.import.banner.stop")}
            </Text>
          </Pressable>
        ) : null}
        {!active && canEdit ? (
          <Pressable testID="tables-import-banner-close" onPress={() => act(() => tableImportsApi.dismiss(imp.id))} accessibilityRole="button" accessibilityLabel={t("tables.import.banner.close")} hitSlop={8} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {active ? (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}>
          <View testID="tables-import-banner-bar" style={{ width: `${Math.min(100, Math.max(0, imp.percent))}%`, height: 4, backgroundColor: colors.accent }} />
        </View>
      ) : (
        <Text tone={imp.errorCount ? "danger" : "muted"} variant="caption" testID="tables-import-banner-counts">
          {imp.errorMessage ?? t("tables.import.banner.counts", { created: imp.createdCount, updated: imp.updatedCount, errors: imp.errorCount })}
        </Text>
      )}
    </View>
  );
}
