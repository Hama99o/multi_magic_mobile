/**
 * An XLSX or ODS file in the viewer (parity #46). The server reads it
 * (`pagesApi.spreadsheetPreview`, multi-magic-83): no spreadsheet parser in
 * the app, which keeps ~1 MB and a stale, CVE-carrying package out of the
 * bundle (Hello's decision, 2026-11-21). One tab per sheet when there are
 * several; at most 500 rows x 50 columns, and a cut table says so.
 */
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { pagesKeys } from "@/api/keys";
import { pagesApi } from "@/api/pages";
import { failureMessage } from "@/api/failure";
import { Chip } from "@/screens/todos/parts";
import { Text } from "@/components/reusables/text";
import { useMetrics } from "@/hooks/useColors";
import { SheetTable } from "./SheetTable";

/** The server's own limits (SPREADSHEET_PREVIEW.md). */
export const WORKBOOK_ROWS = 500;
export const WORKBOOK_COLUMNS = 50;

export function WorkbookView({ nodeId }: { nodeId: number }) {
  const { t } = useTranslation();
  const metrics = useMetrics();
  const [sheet, setSheet] = useState(0);
  const preview = useQuery({
    queryKey: pagesKeys.spreadsheet(nodeId, sheet),
    queryFn: () => pagesApi.spreadsheetPreview(nodeId, sheet),
    retry: false, // a damaged file stays damaged; the reason is shown at once
  });
  const sheets = preview.data?.sheets ?? [];
  return (
    <View style={{ flex: 1, gap: metrics.space.sm }} testID="pages-workbook">
      {sheets.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.space.sm }} accessibilityRole="tablist">
          {sheets.map((s) => (
            <Chip key={s.index} label={s.name} selected={s.index === sheet} onPress={() => setSheet(s.index)} testID={`pages-workbook-sheet-${s.index}`} />
          ))}
        </ScrollView>
      ) : null}
      {preview.isPending ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : preview.isError ? (
        <Text tone="muted" testID="pages-workbook-failed">
          {failureMessage(preview.error, t("pages.view.textFailed"))}
        </Text>
      ) : (
        <SheetTable rows={preview.data.rows} truncated={preview.data.truncated} limits={{ rows: WORKBOOK_ROWS, columns: WORKBOOK_COLUMNS }} />
      )}
    </View>
  );
}
