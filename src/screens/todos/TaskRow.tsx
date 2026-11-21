/**
 * One task in a list (`docs/design/todos/SPEC.md` §D, Amie 04 / Todoist 06):
 * the check, the title with its notes' first line, and the chips that say
 * when (red overdue, orange soon, muted later), how urgent (a flag), and the
 * reminder. In the Today view it also names its list (Todoist 14).
 *
 * Swipe right completes, swipe left deletes (Structured 18). Built on
 * React Native's own `PanResponder`, as `ImageGallery.tsx` is: the app has no
 * `GestureHandlerRootView`, and adding one at the root for a row is a change
 * to every screen. The swipe only claims a drag that is clearly sideways, so
 * the list still scrolls. Every swipe action is also a button (the check;
 * Delete in the task sheet), so nothing needs the gesture.
 */
import { useEffect, useState } from "react";
import { REVEAL, useSwipeRow } from "@/components/swipeRow";
import { Animated, Pressable, View } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import type { Todo, TodoPriority } from "@/api/todos";
import { Bell, Calendar, Check, Flag, Trash2 } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { CATEGORY_COLORS } from "@/theme/tokens";
import { APP_COLORS } from "@/theme/appColors";
import { dueLabel, dueTone } from "./due";

const [BLUE, , ORANGE] = CATEGORY_COLORS;

export function priorityColor(priority: TodoPriority, danger: string): string | null {
  if (priority === "low") return BLUE;
  if (priority === "medium") return ORANGE;
  if (priority === "high") return danger;
  return null;
}

export function TodoCheck({ done, onPress, label, testID }: { done: boolean; onPress: () => void; label: string; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const scale = useSharedValue(1);
  // The pop plays from an effect, as SafeZone's PinPad dot does: a tap counts.
  const [taps, setTaps] = useState(0);
  useEffect(() => {
    if (taps) scale.value = withSequence(withTiming(0.85, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 }));
  }, [taps, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        setTaps((n) => n + 1);
        void (done ? Haptics.selectionAsync() : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)).catch(() => undefined);
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={label}
      hitSlop={8}
      style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
    >
      <Reanimated.View
        style={[
          {
            width: 24,
            height: 24,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: done ? APP_COLORS.todos : colors.inkMuted,
            backgroundColor: done ? APP_COLORS.todos : "transparent",
            alignItems: "center",
            justifyContent: "center",
          },
          style,
        ]}
      >
        {done ? <Check size={16} color="#04161a" strokeWidth={3} /> : null}
      </Reanimated.View>
    </Pressable>
  );
}

export function TaskRow({
  todo,
  today,
  listName,
  onToggle,
  onOpen,
  onDelete,
  highlighted = false,
}: {
  todo: Todo;
  today: string;
  /** Shown in the cross-list views, where a task needs its list named. */
  listName?: string;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
  highlighted?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  // A partial swipe opens on its button, only a long one acts (components/swipeRow.tsx).
  const swipe = useSwipeRow({ id: todo.id, right: true, onLeft: onDelete, onRight: onToggle });
  const side = swipe.side === "right" ? "done" : swipe.side === "left" ? "delete" : null;

  const tone = dueTone(todo.dueDate, todo.completed, today);
  const flag = priorityColor(todo.priority, colors.danger);
  const dueColors =
    tone === "overdue"
      ? { fg: colors.danger, bg: `${colors.danger}1f` }
      : tone === "soon"
        ? { fg: colors.ink, bg: `${ORANGE}29` }
        : { fg: colors.inkMuted, bg: colors.surface };
  const pending = todo.id < 0;
  const notesLine = todo.notes?.split("\n").find((l) => l.trim())?.trim();

  return (
    <View style={{ borderRadius: metrics.radius.md, overflow: "hidden" }}>
      {side ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "stretch",
            justifyContent: side === "done" ? "flex-start" : "flex-end",
            backgroundColor: side === "done" ? APP_COLORS.todos : colors.danger,
          }}
        >
          <Pressable
            testID={`todo-row-${todo.id}-${side === "done" ? "swipe-done" : "swipe-delete"}`}
            onPress={swipe.actOpen}
            disabled={!swipe.open}
            accessibilityRole="button"
            accessibilityLabel={side === "done" ? t("todos.markDone", { title: todo.title }) : t("common.delete")}
            style={{ width: REVEAL, alignItems: "center", justifyContent: "center" }}
          >
            {side === "done" ? <Check size={22} color="#04161a" strokeWidth={3} /> : <Trash2 size={22} color="#ffffff" />}
          </Pressable>
        </View>
      ) : null}
      <Animated.View {...swipe.panHandlers} onLayout={swipe.onLayout} style={{ transform: [{ translateX: swipe.dx }] }}>
        <Pressable
          testID={`todo-row-${todo.id}`}
          // An open row closes on a tap, before it opens anything.
          onPress={swipe.open ? swipe.close : onOpen}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel={t("todos.openTask", { title: todo.title })}
          accessibilityActions={[{ name: "activate" }, { name: "delete", label: t("common.delete") }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "delete") onDelete();
            else onOpen();
          }}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: metrics.space.xs,
            minHeight: 56,
            paddingRight: metrics.space.md,
            paddingVertical: metrics.space.xs,
            backgroundColor: highlighted ? `${APP_COLORS.todos}2e` : colors.ground,
            opacity: pending ? 0.6 : 1,
          }}
        >
          <TodoCheck
            done={todo.completed}
            onPress={onToggle}
            label={todo.completed ? t("todos.markPending", { title: todo.title }) : t("todos.markDone", { title: todo.title })}
            testID={`todo-check-${todo.id}`}
          />
          <View style={{ flex: 1, paddingTop: 10, gap: 2 }}>
            <Text
              numberOfLines={2}
              style={{ textDecorationLine: todo.completed ? "line-through" : "none", color: todo.completed ? colors.inkMuted : colors.ink }}
            >
              {todo.title}
            </Text>
            {notesLine ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {notesLine}
              </Text>
            ) : null}
            {todo.dueDate || flag || todo.remindAt || listName ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: metrics.space.sm, paddingTop: 2 }}>
                {todo.dueDate ? (
                  <View testID={`todo-due-${todo.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: metrics.radius.pill, backgroundColor: dueColors.bg }}>
                    <Calendar size={12} color={dueColors.fg} />
                    <Text variant="caption" style={{ color: dueColors.fg }}>
                      {dueLabel(todo.dueDate, today, i18n.language, t)}
                    </Text>
                  </View>
                ) : null}
                {todo.remindAt ? <Bell size={13} color={colors.inkMuted} accessibilityLabel={t("todos.hasReminder")} /> : null}
                {flag ? <Flag testID={`todo-flag-${todo.id}`} size={13} color={flag} fill={flag} accessibilityLabel={t(`todos.priority.${todo.priority}`)} /> : null}
                {listName ? (
                  <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {listName}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
