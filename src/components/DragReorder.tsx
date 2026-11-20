/**
 * Reorder anything by dragging a grip — the Todo list's drag
 * (`src/screens/todos/DragList.tsx`), for any rows: a column's cards on a
 * Flow board, a board's columns. Same reasons, same mechanics: React Native's
 * own `PanResponder` and `Animated` (no gesture-handler root here), ONE
 * responder per row kept across renders (Todo QA T7), the drop place found
 * from each row's measured height (`dropIndex`).
 *
 * It is a MODE, never the list itself: it renders every row in a plain View,
 * not in a recycled list, so the transforms it moves rows with cannot be left
 * behind on a recycled cell (owner rule, 2026-11-17). Each row also has ▲ ▼
 * buttons, so the order can be changed without a drag, by a screen reader
 * too (parity audit §8, "Long-press drag + ▲/▼ for accessibility").
 */
import { useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, GripVertical } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { dropIndex } from "@/screens/todos/DragList";

export interface ReorderItem {
  id: number;
  label: string;
  /** Drawn before the label (a colour dot). */
  lead?: ReactNode;
}

export function moveId(ids: number[], from: number, to: number): number[] {
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length || from === to) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function DragReorder({ items, onReorder, testID, rowHeight = 56 }: { items: ReorderItem[]; onReorder: (ids: number[]) => void; testID: string; rowHeight?: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const heights = useRef<number[]>([]);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const latest = useRef({ items, onReorder });
  latest.current = { items, onReorder };
  const responders = useRef(new Map<number, ReturnType<typeof PanResponder.create>>());

  const responder = (itemId: number) => {
    const known = responders.current.get(itemId);
    if (known) return known;
    const indexNow = () => latest.current.items.findIndex((x) => x.id === itemId);
    const made = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        dy.setValue(0);
        const from = indexNow();
        setDrag({ from, to: from });
      },
      onPanResponderMove: (_e, g) => {
        dy.setValue(g.dy);
        const to = dropIndex(heights.current, indexNow(), g.dy);
        setDrag((d) => {
          if (d && d.to !== to) void Haptics.selectionAsync().catch(() => undefined);
          return d && d.to !== to ? { ...d, to } : d;
        });
      },
      onPanResponderRelease: (_e, g) => {
        const from = indexNow();
        const to = dropIndex(heights.current, from, g.dy);
        setDrag(null);
        dy.setValue(0);
        if (from >= 0 && to !== from) latest.current.onReorder(moveId(latest.current.items.map((x) => x.id), from, to));
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        dy.setValue(0);
      },
    });
    responders.current.set(itemId, made);
    return made;
  };

  const shiftFor = (i: number) => {
    if (!drag || i === drag.from) return 0;
    const h = heights.current[drag.from] ?? rowHeight;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -h;
    if (drag.from > drag.to && i < drag.from && i >= drag.to) return h;
    return 0;
  };

  const ids = items.map((x) => x.id);
  return (
    <View testID={testID}>
      {items.map((item, i) => {
        const dragging = drag?.from === i;
        return (
          <Animated.View
            key={item.id}
            onLayout={(e) => {
              heights.current[i] = e.nativeEvent.layout.height;
            }}
            style={{ zIndex: dragging ? 2 : 0, elevation: dragging ? 6 : 0, transform: [{ translateY: dragging ? dy : shiftFor(i) }] }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: rowHeight,
                gap: metrics.space.sm,
                marginBottom: 6,
                paddingRight: metrics.space.xs,
                borderRadius: metrics.radius.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: dragging ? colors.accent : colors.border,
              }}
            >
              <View {...responder(item.id).panHandlers} testID={`${testID}-grip`} accessibilityLabel={t("flow.reorder.grip", { title: item.label })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
                <GripVertical size={20} color={colors.inkMuted} />
              </View>
              {item.lead}
              <Text style={{ flex: 1 }} numberOfLines={2}>
                {item.label}
              </Text>
              <Pressable testID={`${testID}-up`} disabled={i === 0} onPress={() => onReorder(moveId(ids, i, i - 1))} accessibilityRole="button" accessibilityLabel={t("flow.reorder.up", { title: item.label })} style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center", opacity: i === 0 ? 0.3 : 1 }}>
                <ChevronUp size={20} color={colors.ink} />
              </Pressable>
              <Pressable testID={`${testID}-down`} disabled={i === items.length - 1} onPress={() => onReorder(moveId(ids, i, i + 1))} accessibilityRole="button" accessibilityLabel={t("flow.reorder.down", { title: item.label })} style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center", opacity: i === items.length - 1 ? 0.3 : 1 }}>
                <ChevronDown size={20} color={colors.ink} />
              </Pressable>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
