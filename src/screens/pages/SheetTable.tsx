/**
 * A spreadsheet as a table (parity #46): the first row is the header. Used by
 * the CSV/TSV view (parsed on the phone, `csv.ts`) and the XLSX/ODS view (read
 * by the server, `WorkbookView.tsx`). Fixed cell sizes, so a recycled row
 * never takes a stale height.
 */
import { FlatList, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export const CELL_WIDTH = 132;
export const CELL_HEIGHT = 40;

export function SheetTable({ rows, truncated, limits }: { rows: string[][]; truncated: boolean; limits: { rows: number; columns: number } }) {
  const { t } = useTranslation();
  const colors = useColors();
  const metrics = useMetrics();
  const columns = Math.max(1, ...rows.map((r) => r.length));
  return (
    <View style={{ flex: 1, gap: metrics.space.sm }} testID="pages-sheet">
      {truncated ? (
        <Text variant="caption" tone="muted" testID="pages-sheet-truncated">
          {t("pages.view.sheetTruncated", { rows: limits.rows, columns: limits.columns })}
        </Text>
      ) : null}
      <ScrollView horizontal>
        <FlatList
          data={rows}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, index) => ({ length: CELL_HEIGHT, offset: CELL_HEIGHT * index, index })}
          initialNumToRender={30}
          renderItem={({ item, index }) => (
            <View style={{ flexDirection: "row", height: CELL_HEIGHT, backgroundColor: index === 0 ? colors.surface : "transparent" }}>
              {Array.from({ length: columns }, (_, c) => (
                <View key={c} style={{ width: CELL_WIDTH, height: CELL_HEIGHT, justifyContent: "center", paddingHorizontal: 8, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
                  <Text numberOfLines={1} variant={index === 0 ? "label" : "body"} style={{ fontSize: 14 }}>
                    {item[c] ?? ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        />
      </ScrollView>
    </View>
  );
}
