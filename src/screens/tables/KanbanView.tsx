/**
 * KANBAN on a phone (SPEC C6; Jira's one column per screen with the next one
 * peeking and page dots, Notion's coloured column chip + count). Increment 4.
 *
 * A card moves by LONG PRESS → "Move to…" (drag across pages is unreliable on
 * a touch screen, the parity audit's phone-hard item 4); "+" at a column's
 * foot adds a row already in that column. Cards are the list's own
 * fixed-height `RecordCard`, no animation on a recycled cell.
 *
 * 4b: a column can be FOLDED (the person's own, `PersonalLayer.foldedColumns`):
 * it leaves the pages and stays in the chip strip, dimmed; its chip unfolds it
 * and goes there. Reordering within a column lives in the long-press sheet.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/api/fields";
import type { RecordRow } from "@/api/tables";
import type { KnownRecords } from "@/components/fields/display";
import { FoldHorizontal, Plus } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { colorHex } from "@/screens/flow/logic";
import type { KanbanColumn } from "./boardViews";
import { RecordCard } from "./RecordCard";

const PEEK = 28;

export function KanbanView({
  columns,
  title,
  fields,
  colorField,
  known,
  cardHeight,
  editable,
  onOpen,
  onMenu,
  onAdd,
  onEndReached,
  folded = [],
  onToggleFold,
}: {
  columns: KanbanColumn[];
  title: FieldDefinition | null;
  fields: FieldDefinition[];
  colorField: FieldDefinition | null;
  known: KnownRecords;
  cardHeight: number;
  editable: boolean;
  onOpen: (row: RecordRow) => void;
  onMenu: (row: RecordRow, column: KanbanColumn) => void;
  onAdd: (column: KanbanColumn) => void;
  onEndReached: () => void;
  folded?: string[];
  onToggleFold?: (key: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const pager = useRef<FlatList<KanbanColumn>>(null);
  const columnWidth = Math.min(width - metrics.space.lg * 2 - PEEK, 520);
  const step = columnWidth + metrics.space.sm;
  const name = (c: KanbanColumn) => c.label ?? t("tables.kanban.empty");
  const shown = useMemo(() => columns.filter((c) => !folded.includes(c.key)), [columns, folded]);
  const [goTo, setGoTo] = useState<string | null>(null);

  const jump = (index: number) => {
    setPage(index);
    pager.current?.scrollToOffset({ offset: index * step, animated: true });
  };
  // A folded chip unfolds its column, then the board goes to it once it is a page again.
  useEffect(() => {
    if (goTo === null) return;
    const index = shown.findIndex((c) => c.key === goTo);
    if (index !== -1) {
      setGoTo(null);
      jump(index);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jump reads only refs and setters
  }, [goTo, shown]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="tables-kanban-strip" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: metrics.space.xs, paddingBottom: metrics.space.xs }}>
        {columns.map((c, i) => {
          const isFolded = folded.includes(c.key);
          const on = !isFolded && shown[page]?.key === c.key;
          const hex = colorHex(c.color) ?? colors.inkMuted;
          return (
            <Pressable
              key={c.key || "empty"}
              testID={`tables-kanban-chip-${i}`}
              onPress={() => {
                if (isFolded) {
                  onToggleFold?.(c.key);
                  setGoTo(c.key);
                } else jump(shown.findIndex((x) => x.key === c.key));
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t("tables.kanban.column", { column: name(c), count: c.count ?? c.rows.length })}
              accessibilityHint={isFolded ? t("tables.kanban.foldedHint") : undefined}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderStyle: isFolded ? "dashed" : "solid", opacity: isFolded ? 0.6 : 1, borderColor: on ? hex : colors.border, backgroundColor: on ? `${hex}22` : colors.surface }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hex }} />
              <Text variant="label" numberOfLines={1}>
                {name(c)}
              </Text>
              <Text tone="muted" variant="caption">
                {c.count ?? c.rows.length}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        ref={pager}
        testID="tables-kanban"
        data={shown}
        horizontal
        keyExtractor={(c) => c.key || "empty"}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / step))}
        getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
        renderItem={({ item: column, index: ci }) => (
          <View testID={`tables-kanban-column-${ci}`} style={{ width: columnWidth, marginRight: metrics.space.sm, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, padding: metrics.space.sm }}>
            {onToggleFold ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, paddingBottom: metrics.space.xs }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colorHex(column.color) ?? colors.inkMuted }} />
                <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
                  {name(column)}
                </Text>
                <Pressable
                  testID={`tables-kanban-fold-${ci}`}
                  onPress={() => {
                    onToggleFold(column.key);
                    setPage((p) => Math.max(0, Math.min(p, shown.length - 2)));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("tables.kanban.fold", { column: name(column) })}
                  hitSlop={6}
                  style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
                >
                  <FoldHorizontal size={18} color={colors.inkMuted} />
                </Pressable>
              </View>
            ) : null}
            <FlatList
              data={column.rows}
              keyExtractor={(r) => String(r.id)}
              getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
              renderItem={({ item, index }) => (
                <RecordCard
                  row={item}
                  index={index}
                  title={title}
                  fields={fields}
                  colorField={colorField}
                  coverField={null}
                  known={known}
                  height={cardHeight}
                  onPress={() => onOpen(item)}
                  onLongPress={editable ? () => onMenu(item, column) : undefined}
                  testID={`tables-kanban-${ci}-card-${index}`}
                />
              )}
              onEndReached={onEndReached}
              onEndReachedThreshold={0.6}
              ListEmptyComponent={
                <Text tone="muted" variant="caption" style={{ padding: metrics.space.md, textAlign: "center" }}>
                  {t("tables.kanban.noCards")}
                </Text>
              }
              ListFooterComponent={
                editable ? (
                  <Pressable testID={`tables-kanban-add-${ci}`} onPress={() => onAdd(column)} accessibilityRole="button" accessibilityLabel={t("tables.kanban.add", { column: name(column) })} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, minHeight: metrics.touch, paddingHorizontal: metrics.space.sm }}>
                    <Plus size={18} color={colors.accent} />
                    <Text tone="accent" variant="label">
                      {t("tables.kanban.addShort")}
                    </Text>
                  </Pressable>
                ) : null
              }
            />
          </View>
        )}
      />
    </View>
  );
}
