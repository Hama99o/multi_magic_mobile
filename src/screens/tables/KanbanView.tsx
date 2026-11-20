/**
 * KANBAN on a phone (SPEC C6; Jira's one column per screen with the next one
 * peeking and page dots, Notion's coloured column chip + count). Increment 4.
 *
 * A card moves by LONG PRESS → "Move to…" (drag across pages is unreliable on
 * a touch screen, the parity audit's phone-hard item 4); "+" at a column's
 * foot adds a row already in that column. Cards are the list's own
 * fixed-height `RecordCard`, no animation on a recycled cell.
 */
import { useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/api/fields";
import type { RecordRow } from "@/api/tables";
import type { KnownRecords } from "@/components/fields/display";
import { Plus } from "@/components/icons";
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

  const jump = (index: number) => {
    setPage(index);
    pager.current?.scrollToOffset({ offset: index * step, animated: true });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="tables-kanban-strip" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: metrics.space.xs, paddingBottom: metrics.space.xs }}>
        {columns.map((c, i) => {
          const on = i === page;
          const hex = colorHex(c.color) ?? colors.inkMuted;
          return (
            <Pressable
              key={c.key || "empty"}
              testID={`tables-kanban-chip-${i}`}
              onPress={() => jump(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t("tables.kanban.column", { column: name(c), count: c.count ?? c.rows.length })}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: on ? hex : colors.border, backgroundColor: on ? `${hex}22` : colors.surface }}
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
        data={columns}
        horizontal
        keyExtractor={(c) => c.key || "empty"}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / step))}
        getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
        renderItem={({ item: column, index: ci }) => (
          <View testID={`tables-kanban-column-${ci}`} style={{ width: columnWidth, marginRight: metrics.space.sm, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, padding: metrics.space.sm }}>
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
