/**
 * ONE COLUMN of the board: a page of the pager on a phone, one of several
 * side by side on a tablet (`app/flow/board.tsx`).
 *
 * The header is the web's (`BoardColumn.tsx`): a colour dot, the title, the
 * count, + to add. The column is tinted with its colour, or the project's
 * (the web's accent). Its cards are a FlatList of fixed-height tiles
 * (`tileHeight` per card, `getItemLayout`) with no animation on a cell: the owner's
 * recycled-list rule. Reordering is a mode (⋯ › Reorder) that swaps the list
 * for `DragReorder`, never a gesture on a recycled cell.
 */
import { useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import type { Card, Column, Person } from "@/api/flow";
import type { FieldDefinition, Tag } from "@/api/fields";
import { DragReorder } from "@/components/DragReorder";
import { Check, Ellipsis, Plus, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useSubmitText } from "@/lib/useSubmitText";
import { colorHex, tileHeight, tileShape } from "./logic";
import { CardTile } from "./parts";

const GAP = 8;

export function BoardColumn({
  column,
  cards,
  total,
  width,
  tint,
  fields,
  tagsByCategory,
  people,
  today,
  canEdit,
  canManage,
  reordering,
  refreshing,
  onRefresh,
  onOpen,
  onCardMenu,
  onAdd,
  onColumnMenu,
  onReorder,
  onDoneReordering,
  filtered,
}: {
  column: Column;
  /** The cards shown (filtered, ordered). */
  cards: Card[];
  /** Every card in the column, for the count when a filter hides some. */
  total: number;
  width: number;
  tint: string;
  fields: FieldDefinition[];
  tagsByCategory: Record<number, Tag[]>;
  people: Person[];
  today: string;
  canEdit: boolean;
  canManage: boolean;
  reordering: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (card: Card) => void;
  onCardMenu: (card: Card) => void;
  onAdd: (title: string) => void;
  onColumnMenu: () => void;
  onReorder: (ids: number[]) => void;
  onDoneReordering: () => void;
  filtered: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const { fontScale } = useWindowDimensions();
  // Each tile's height is known from its card (`tileHeight`), so the list
  // still lays out without measuring: exact offsets, stable recycling.
  const layout = useMemo(() => {
    const heights = cards.map((c) => tileHeight(tileShape(c, fields, tagsByCategory, people), fontScale));
    const offsets: number[] = [];
    let at = 0;
    for (const h of heights) {
      offsets.push(at);
      at += h + GAP;
    }
    return { heights, offsets };
  }, [cards, fields, tagsByCategory, people, fontScale]);
  const hex = colorHex(column.color) ?? tint;
  const count = filtered && cards.length !== total ? t("flow.board.countOf", { shown: cards.length, total }) : String(total);

  return (
    <View testID={`flow-column-${column.position}`} style={{ width, flex: 1, borderRadius: metrics.radius.lg, backgroundColor: `${hex}14`, borderTopWidth: 3, borderTopColor: hex, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingLeft: metrics.space.md, minHeight: 52 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hex }} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1, fontWeight: "700", fontSize: 16 }}>
          {column.title}
        </Text>
        <Text testID={`flow-column-${column.position}-count`} variant="caption" tone="muted" accessibilityLabel={t("flow.board.cardCount", { count: total })}>
          {count}
        </Text>
        {column.isFinal ? <Check size={16} color={hex} accessibilityLabel={t("flow.columns.final")} /> : null}
        <View style={{ flex: 1 }} />
        {reordering ? (
          <Pressable testID="flow-reorder-done" onPress={onDoneReordering} accessibilityRole="button" accessibilityLabel={t("flow.reorder.done")} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: metrics.space.md }}>
            <Text tone="accent" variant="label">
              {t("flow.reorder.done")}
            </Text>
          </Pressable>
        ) : (
          <>
            {canEdit ? (
              <Pressable testID={`flow-column-${column.position}-add`} onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel={t("flow.board.addTo", { column: column.title })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Plus size={20} color={colors.ink} />
              </Pressable>
            ) : null}
            {canEdit || canManage ? (
              <Pressable testID={`flow-column-${column.position}-menu`} onPress={onColumnMenu} accessibilityRole="button" accessibilityLabel={t("flow.board.columnOptions", { column: column.title })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Ellipsis size={20} color={colors.inkMuted} />
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      {reordering ? (
        <FlatList
          data={[0]}
          keyExtractor={() => "reorder"}
          contentContainerStyle={{ paddingHorizontal: metrics.space.sm, paddingBottom: metrics.space.lg }}
          renderItem={() => <DragReorder testID="flow-reorder" items={cards.map((c) => ({ id: c.id, label: c.title }))} onReorder={onReorder} />}
        />
      ) : (
        <FlatList
          testID={`flow-column-${column.position}-cards`}
          data={cards}
          keyExtractor={(c) => String(c.id)}
          getItemLayout={adding ? undefined : (_d, index) => ({ length: layout.heights[index] + GAP, offset: layout.offsets[index], index })}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          contentContainerStyle={{ paddingHorizontal: metrics.space.sm, paddingBottom: metrics.space.xl }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.inkMuted} />}
          ListHeaderComponent={adding ? <QuickAdd column={column} onAdd={onAdd} onClose={() => setAdding(false)} /> : null}
          ListEmptyComponent={
            adding ? null : (
              <View testID={`flow-column-${column.position}-empty`} style={{ alignItems: "center", paddingVertical: metrics.space.xl, gap: metrics.space.sm }}>
                <Text tone="muted" style={{ textAlign: "center" }}>
                  {filtered && total > 0 ? t("flow.board.noneMatch") : t("flow.board.emptyColumn")}
                </Text>
                {canEdit && !(filtered && total > 0) ? (
                  <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: metrics.space.md }}>
                    <Text tone="accent" variant="label">
                      {t("flow.board.addCard")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
          ListFooterComponent={
            canEdit && cards.length > 0 && !adding ? (
              <Pressable testID={`flow-column-${column.position}-add-bottom`} onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel={t("flow.board.addTo", { column: column.title })} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, paddingHorizontal: metrics.space.sm, marginTop: GAP }}>
                <Plus size={18} color={colors.inkMuted} />
                <Text tone="muted" variant="label">
                  {t("flow.board.addCard")}
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <CardTile
              testID="flow-card"
              card={item}
              fields={fields}
              tagsByCategory={tagsByCategory}
              people={people}
              today={today}
              onPress={() => onOpen(item)}
              onLongPress={() => onCardMenu(item)}
            />
          )}
        />
      )}
    </View>
  );
}

/**
 * Add a card: type, Return adds and keeps the field open for the next one
 * (the web's Enter), ✕ closes. A new card lands at the bottom of the column
 * and in the sprint the board is showing (the web drops it out of the sprint).
 */
function QuickAdd({ column, onAdd, onClose }: { column: Column; onAdd: (title: string) => void; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const title = useSubmitText();
  const input = useRef<TextInput>(null);
  const submit = () => {
    const v = title.take();
    if (!v) return;
    onAdd(v);
    input.current?.focus();
  };
  return (
    <View testID="flow-quick-add" style={{ marginBottom: GAP, padding: metrics.space.sm, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, gap: metrics.space.sm }}>
      <TextInput
        ref={input}
        testID="flow-quick-add-input"
        value={title.value}
        onChangeText={title.onChangeText}
        autoFocus
        multiline
        submitBehavior="submit"
        returnKeyType="done"
        onSubmitEditing={submit}
        placeholder={t("flow.board.cardTitle")}
        placeholderTextColor={colors.inkMuted}
        accessibilityLabel={t("flow.board.newCardIn", { column: column.title })}
        style={{ minHeight: 44, maxHeight: 120, color: colors.ink, fontSize: 16, textAlignVertical: "top", paddingVertical: 6 }}
      />
      <View style={{ flexDirection: "row", gap: metrics.space.sm, justifyContent: "flex-end" }}>
        <Pressable testID="flow-quick-add-cancel" onPress={onClose} accessibilityRole="button" accessibilityLabel={t("fields.cancel")} style={{ width: 44, height: 40, alignItems: "center", justifyContent: "center" }}>
          <X size={20} color={colors.inkMuted} />
        </Pressable>
        <Pressable testID="flow-quick-add-submit" onPress={submit} disabled={!title.value.trim()} accessibilityRole="button" accessibilityLabel={t("flow.board.add")} style={{ minHeight: 40, paddingHorizontal: metrics.space.lg, borderRadius: metrics.radius.sm, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", opacity: title.value.trim() ? 1 : 0.5 }}>
          <Text variant="label" tone="onAccent">
            {t("flow.board.add")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
