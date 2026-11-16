/**
 * Add a task without leaving the list (SPEC B1; Todoist 08, Evernote 09): a
 * field pinned at the bottom with one-tap chips above the keyboard, for
 * Today, Tomorrow, another day, and the priority. Return adds and keeps the
 * keyboard up for the next one, as the web's Enter does (`GroupDrawer.tsx`).
 * The chips reset after each task; the field never does until it is sent.
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import type { TodoPriority } from "@/api/todos";
import { ArrowUp, Calendar, Flag } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { MonthGrid } from "@/screens/calendar/MonthGrid";
import { addDays, startOfMonth } from "@/screens/calendar/dates";
import { Chip } from "./parts";
import { dueLabel } from "./due";
import { priorityColor } from "./TaskRow";

const NEXT: Record<TodoPriority, TodoPriority> = { none: "high", high: "medium", medium: "low", low: "none" };

export function QuickAdd({
  today,
  onAdd,
  autoFocus = false,
}: {
  today: string;
  onAdd: (input: { title: string; dueDate: string | null; priority: TodoPriority }) => void;
  autoFocus?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<TodoPriority>("none");
  const [focused, setFocused] = useState(autoFocus);
  const [picking, setPicking] = useState(false);
  const [month, setMonth] = useState(startOfMonth(today));
  const tomorrow = addDays(today, 1);
  const flag = priorityColor(priority, colors.danger);

  const send = () => {
    const text = title.trim();
    if (!text) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onAdd({ title: text, dueDate, priority });
    setTitle("");
    setDueDate(null);
    setPriority("none");
    setPicking(false);
  };

  return (
    <View
      testID="todo-quick-add"
      style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.ground, paddingTop: metrics.space.sm, paddingBottom: metrics.space.sm, gap: metrics.space.sm }}
    >
      {picking ? (
        <MonthGrid
          testID="todo-quick-month"
          month={month}
          selected={dueDate}
          today={today}
          onMonthChange={setMonth}
          onSelect={(day) => {
            setDueDate(day);
            setPicking(false);
          }}
        />
      ) : null}
      {focused || title ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
          <Chip testID="todo-quick-today" label={t("todos.due.today")} selected={dueDate === today} onPress={() => setDueDate(dueDate === today ? null : today)} />
          <Chip testID="todo-quick-tomorrow" label={t("todos.due.tomorrow")} selected={dueDate === tomorrow} onPress={() => setDueDate(dueDate === tomorrow ? null : tomorrow)} />
          <Chip
            testID="todo-quick-date"
            icon={Calendar}
            label={dueDate && dueDate !== today && dueDate !== tomorrow ? dueLabel(dueDate, today, i18n.language, t) : t("todos.due.pick")}
            selected={Boolean(dueDate && dueDate !== today && dueDate !== tomorrow) || picking}
            onPress={() => setPicking((p) => !p)}
          />
          <Chip
            testID="todo-quick-priority"
            icon={Flag}
            tint={flag ?? undefined}
            label={t(`todos.priority.${priority}`)}
            a11yLabel={t("todos.priority.change", { priority: t(`todos.priority.${priority}`) })}
            selected={priority !== "none"}
            onPress={() => setPriority((p) => NEXT[p])}
          />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <TextInput
          testID="todo-quick-input"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={send}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          blurOnSubmit={false}
          returnKeyType="done"
          placeholder={t("todos.addTask")}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t("todos.addTask")}
          style={{
            flex: 1,
            minHeight: 48,
            borderRadius: metrics.radius.pill,
            paddingHorizontal: metrics.space.lg,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: focused ? APP_COLORS.todos : colors.border,
            color: colors.ink,
            fontSize: 16,
          }}
        />
        <Pressable
          testID="todo-quick-send"
          onPress={send}
          disabled={!title.trim()}
          accessibilityRole="button"
          accessibilityLabel={t("todos.add")}
          accessibilityState={{ disabled: !title.trim() }}
          style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: title.trim() ? APP_COLORS.todos : colors.surface }}
        >
          <ArrowUp size={22} color={title.trim() ? "#04161a" : colors.inkMuted} />
        </Pressable>
      </View>
    </View>
  );
}
