/**
 * Reorder by dragging (the web's SortableJS, `GroupDrawer.tsx`): hold the
 * grip and move the task; the others make room as it passes; letting go
 * sends the whole new order once.
 *
 * React Native's own `PanResponder` and `Animated`, like `ImageGallery.tsx`
 * (no gesture-handler root in this app). Rows may differ in height (a date
 * chip, a notes line), so each one's height is measured, and the drop place
 * is found from the measured heights, not from a fixed row size.
 *
 * The grips are a mode (⋯ › Reorder), not always there: a list is mostly
 * read and ticked, and a handle on every row is in the way of both.
 */
import { useRef, useState } from "react";
import { Animated, PanResponder, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import type { Todo } from "@/api/todos";
import { GripVertical } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

/** Where an item dragged by `dy` from `from` lands, given every row's height. */
export function dropIndex(heights: number[], from: number, dy: number): number {
  let to = from;
  if (dy > 0) {
    let moved = dy;
    while (to < heights.length - 1 && moved > heights[to + 1] / 2) {
      moved -= heights[to + 1];
      to += 1;
    }
  } else {
    let moved = -dy;
    while (to > 0 && moved > heights[to - 1] / 2) {
      moved -= heights[to - 1];
      to -= 1;
    }
  }
  return to;
}

export function DragList({ todos, onReorder, onDragging }: { todos: Todo[]; onReorder: (order: number[]) => void; onDragging: (on: boolean) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const heights = useRef<number[]>([]);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;

  const responder = (index: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        onDragging(true);
        dy.setValue(0);
        setDrag({ from: index, to: index });
      },
      onPanResponderMove: (_e, g) => {
        dy.setValue(g.dy);
        const to = dropIndex(heights.current, index, g.dy);
        setDrag((d) => {
          if (d && d.to !== to) void Haptics.selectionAsync().catch(() => undefined);
          return d && d.to !== to ? { ...d, to } : d;
        });
      },
      onPanResponderRelease: (_e, g) => {
        const to = dropIndex(heights.current, index, g.dy);
        setDrag(null);
        dy.setValue(0);
        onDragging(false);
        if (to !== index) {
          const ids = todos.map((x) => x.id);
          const [moved] = ids.splice(index, 1);
          ids.splice(to, 0, moved);
          onReorder(ids);
        }
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        dy.setValue(0);
        onDragging(false);
      },
    });

  const shiftFor = (i: number) => {
    if (!drag || i === drag.from) return 0;
    const h = heights.current[drag.from] ?? 56;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -h;
    if (drag.from > drag.to && i < drag.from && i >= drag.to) return h;
    return 0;
  };

  return (
    <View testID="todo-drag-list">
      {todos.map((todo, i) => {
        const dragging = drag?.from === i;
        return (
          <Animated.View
            key={todo.id}
            onLayout={(e) => {
              heights.current[i] = e.nativeEvent.layout.height;
            }}
            style={{
              zIndex: dragging ? 2 : 0,
              elevation: dragging ? 6 : 0,
              transform: [{ translateY: dragging ? dy : shiftFor(i) }],
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: 56,
                gap: metrics.space.sm,
                paddingHorizontal: metrics.space.sm,
                borderRadius: metrics.radius.md,
                backgroundColor: dragging ? colors.surface : colors.ground,
                borderWidth: dragging ? 1 : 0,
                borderColor: colors.border,
              }}
            >
              <View
                {...responder(i).panHandlers}
                testID={`todo-grip-${todo.id}`}
                accessibilityLabel={t("todos.dragHandle", { title: todo.title })}
                style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
              >
                <GripVertical size={20} color={colors.inkMuted} />
              </View>
              <Text style={{ flex: 1 }} numberOfLines={2}>
                {todo.title}
              </Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
