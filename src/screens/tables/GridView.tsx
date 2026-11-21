/**
 * THE GRID ON A TABLET (increment 9; the web's `Grid.tsx`): rows as lines,
 * every visible column side by side, the title column held at the left,
 * the header held at the top, and the summary bar under the rows.
 *
 * Two lists, one scroll: the title column (left) follows the vertical offset
 * of the body (right, inside the horizontal scroll), so the title never
 * leaves while the columns slide. Rows are one fixed height (`ROW`), measured
 * once (`getItemLayout`), no animation on a recycled cell (the owner's rule).
 * A tap on a row opens its page, where every column edits (`record.tsx`).
 */
import { useRef } from "react";
import { FlatList, Pressable, ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/api/fields";
import type { RecordRow } from "@/api/tables";
import type { KnownRecords } from "@/components/fields/display";
import { capScale, cardValueHeight, CardValue, FONT_CAP } from "@/components/fields/CardValue";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { columnWidth, type SummaryCell } from "./grid";

const ROW = 44;
const HEADER = 40;
const SUMMARY = 36;
/** 6 dp above and below the line: a row, the header and the summary grow with the font, never below their own height. */
const PAD = 12;
export function gridHeights(fontScale: number) {
  return {
    row: Math.max(ROW, cardValueHeight(fontScale) + PAD),
    header: Math.max(HEADER, Math.ceil(18 * capScale(fontScale)) + PAD), // the label's line
    summary: Math.max(SUMMARY, Math.ceil(17 * capScale(fontScale)) + PAD), // the caption's line
  };
}

export function GridView({
  rows,
  title,
  fields,
  primaryFieldId,
  widths,
  known,
  summary,
  totalRows,
  onOpen,
  onEndReached,
  bottomInset = 0,
}: {
  rows: RecordRow[];
  title: FieldDefinition | null;
  /** The visible columns in order, the title column left out (it is held at the left). */
  fields: FieldDefinition[];
  primaryFieldId: number | null;
  widths: Record<string, number> | null | undefined;
  known: KnownRecords;
  summary: Record<number, SummaryCell> | null;
  totalRows: number | null;
  onOpen: (row: RecordRow) => void;
  onEndReached: () => void;
  /** Room kept free below the grid, for a button floating over the screen's bottom (the + button). */
  bottomInset?: number;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const left = useRef<FlatList<RecordRow>>(null);
  const { fontScale } = useWindowDimensions();
  const { row: ROW_H, header: HEADER_H, summary: SUMMARY_H } = gridHeights(fontScale);
  const titleWidth = title ? columnWidth(title, primaryFieldId, widths) : 0;
  const width = (f: FieldDefinition) => columnWidth(f, primaryFieldId, widths);
  const layout = (_: unknown, index: number) => ({ length: ROW_H, offset: ROW_H * index, index });
  const follow = (e: NativeSyntheticEvent<NativeScrollEvent>) => left.current?.scrollToOffset({ offset: e.nativeEvent.contentOffset.y, animated: false });
  const cellBorder = { borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border };
  const num = (n: number) => n.toLocaleString(i18n.language);

  const summaryText = (f: FieldDefinition) => {
    const s = summary?.[f.id];
    if (!s) return "";
    return s.sum !== null ? t("tables.grid.sum", { sum: num(s.sum), avg: num(s.avg ?? 0) }) : t("tables.grid.filled", { count: s.filled });
  };

  return (
    <View testID="tables-grid" style={{ flex: 1, flexDirection: "row", borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.border, marginBottom: bottomInset }}>
      {title ? (
        <View style={{ width: titleWidth }}>
          <View style={[{ height: HEADER_H, justifyContent: "center", paddingHorizontal: metrics.space.sm, backgroundColor: colors.surface }, cellBorder]}>
            <Text variant="label" numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>
              {title.name}
            </Text>
          </View>
          <FlatList
            ref={left}
            testID="tables-grid-titles"
            data={rows}
            keyExtractor={(r) => String(r.id)}
            scrollEnabled={false}
            getItemLayout={layout}
            renderItem={({ item, index }) => (
              <Pressable testID={`tables-grid-row-${index}-title`} onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={t("tables.grid.openRow", { row: index + 1 })} style={[{ height: ROW_H, justifyContent: "center", paddingHorizontal: metrics.space.sm, backgroundColor: colors.ground }, cellBorder]}>
                <CardValue field={title} value={item.values[title.id]} known={known} testID={`tables-grid-${index}-f${title.id}`} bare />
              </Pressable>
            )}
          />
          {summary ? (
            <View style={[{ height: SUMMARY_H, justifyContent: "center", paddingHorizontal: metrics.space.sm, backgroundColor: colors.surface }, cellBorder]}>
              <Text variant="caption" tone="muted" numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} testID="tables-grid-summary-rows">
                {t("tables.grid.rows", { count: totalRows ?? rows.length })}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <ScrollView horizontal testID="tables-grid-scroll" showsHorizontalScrollIndicator contentContainerStyle={{ flexDirection: "column" }}>
        <View style={{ flexDirection: "row", height: HEADER_H, backgroundColor: colors.surface }}>
          {fields.map((f) => (
            <View key={f.id} style={[{ width: width(f), justifyContent: "center", paddingHorizontal: metrics.space.sm }, cellBorder]}>
              <Text variant="label" numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>
                {f.name}
              </Text>
            </View>
          ))}
        </View>
        <FlatList
          testID="tables-grid-body"
          data={rows}
          keyExtractor={(r) => String(r.id)}
          getItemLayout={layout}
          onScroll={follow}
          scrollEventThrottle={16}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          renderItem={({ item, index }) => (
            <Pressable testID={`tables-grid-row-${index}`} onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={t("tables.grid.openRow", { row: index + 1 })} style={{ flexDirection: "row", height: ROW_H }}>
              {fields.map((f) => (
                <View key={f.id} style={[{ width: width(f), justifyContent: "center", paddingHorizontal: metrics.space.sm, overflow: "hidden" }, cellBorder]}>
                  <CardValue field={f} value={item.values[f.id]} known={known} testID={`tables-grid-${index}-f${f.id}`} bare />
                </View>
              ))}
            </Pressable>
          )}
        />
        {summary ? (
          <View testID="tables-grid-summary" style={{ flexDirection: "row", height: SUMMARY_H, backgroundColor: colors.surface }}>
            {fields.map((f) => (
              <View key={f.id} style={[{ width: width(f), justifyContent: "center", paddingHorizontal: metrics.space.sm }, cellBorder]}>
                <Text variant="caption" tone="muted" numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} testID={`tables-grid-summary-${f.id}`}>
                  {summaryText(f)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
