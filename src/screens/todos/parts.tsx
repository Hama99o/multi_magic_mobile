/**
 * Small parts the Todo screens share: a chip (Evernote 09's "Due today"), the
 * due-date chooser (Today / Tomorrow / Next week / a day from the month grid /
 * none), and the reminder chooser (a day and a time). Values are the server's:
 * `YYYY-MM-DD` for a due date, an ISO instant for a reminder.
 */
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { type LucideIcon } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { MonthGrid } from "@/screens/calendar/MonthGrid";
import { TimeWheel } from "@/screens/calendar/pickers/TimeWheel";
import { addDays, dayKey, parseDay, startOfMonth } from "@/screens/calendar/dates";
import { dueLabel } from "./due";

export function Chip({
  label,
  selected = false,
  onPress,
  testID,
  icon: Icon,
  tint,
  a11yLabel,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID: string;
  icon?: LucideIcon;
  /** The icon's colour (a priority's flag). */
  tint?: string;
  a11yLabel?: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={a11yLabel ?? label}
      hitSlop={4}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 36,
        paddingHorizontal: metrics.space.md,
        borderRadius: metrics.radius.pill,
        borderWidth: 1,
        borderColor: selected ? APP_COLORS.todos : colors.border,
        backgroundColor: selected ? `${APP_COLORS.todos}33` : colors.surface,
      }}
    >
      {Icon ? <Icon size={15} color={tint ?? (selected ? colors.ink : colors.inkMuted)} fill={tint ?? "transparent"} /> : null}
      <Text variant="label" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A labelled property row in the task sheet (Todoist 11): an icon, a title, then its control. */
export function PropertyRow({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View style={{ gap: metrics.space.sm, paddingVertical: metrics.space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <Icon size={18} color={colors.inkMuted} />
        <Text variant="label" tone="muted">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Next Monday, or the Monday after when today is one (Todoist's "Next week"). */
export function nextWeek(today: string): string {
  const day = parseDay(today).getDay();
  return addDays(today, ((8 - day) % 7) || 7);
}

export function DueChooser({ value, today, onChange, testID }: { value: string | null; today: string; onChange: (day: string | null) => void; testID: string }) {
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [picking, setPicking] = useState(false);
  const [month, setMonth] = useState(startOfMonth(value ?? today));
  const quick: { key: string; label: string; day: string }[] = [
    { key: "today", label: t("todos.due.today"), day: today },
    { key: "tomorrow", label: t("todos.due.tomorrow"), day: addDays(today, 1) },
    { key: "nextWeek", label: t("todos.due.nextWeek"), day: nextWeek(today) },
  ];
  const custom = value && !quick.some((q) => q.day === value);
  return (
    <View style={{ gap: metrics.space.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
        {quick.map((q) => (
          <Chip key={q.key} testID={`${testID}-${q.key}`} label={q.label} selected={value === q.day} onPress={() => onChange(value === q.day ? null : q.day)} />
        ))}
        <Chip
          testID={`${testID}-pick`}
          label={custom ? dueLabel(value, today, i18n.language, t) : t("todos.due.pick")}
          selected={Boolean(custom) || picking}
          onPress={() => setPicking((p) => !p)}
        />
        {value ? <Chip testID={`${testID}-none`} label={t("todos.due.none")} onPress={() => onChange(null)} /> : null}
      </View>
      {picking ? (
        <MonthGrid
          testID={`${testID}-month`}
          month={month}
          selected={value}
          today={today}
          onMonthChange={setMonth}
          onSelect={(day) => {
            onChange(day);
            setPicking(false);
          }}
        />
      ) : null}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The reminder's local day and "HH:MM", from its ISO instant. */
export function reminderParts(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return { day: dayKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** The ISO instant of a local day at "HH:MM". */
export function reminderAt(day: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = parseDay(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

export function ReminderChooser({
  value,
  dueDate,
  today,
  onChange,
  testID,
}: {
  value: string | null;
  dueDate: string | null;
  today: string;
  onChange: (iso: string | null) => void;
  testID: string;
}) {
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const parts = value ? reminderParts(value) : null;
  const [day, setDay] = useState(parts?.day ?? dueDate ?? today);
  const [time, setTime] = useState(parts?.time ?? "09:00");
  const [open, setOpen] = useState(false);
  const days = [...new Set([today, addDays(today, 1), ...(dueDate && dueDate >= today ? [dueDate] : [])])];
  const summary = parts ? `${dueLabel(parts.day, today, i18n.language, t)} · ${parseDay(parts.day).toLocaleDateString(i18n.language, { day: "numeric", month: "short" })} ${parts.time}` : null;
  return (
    <View style={{ gap: metrics.space.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
        <Chip testID={`${testID}-set`} label={summary ?? t("todos.reminder.add")} selected={Boolean(value) || open} onPress={() => setOpen((o) => !o)} />
        {value ? <Chip testID={`${testID}-off`} label={t("todos.reminder.off")} onPress={() => onChange(null)} /> : null}
      </View>
      {open ? (
        <View style={{ gap: metrics.space.sm }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
            {days.map((d) => (
              <Chip key={d} testID={`${testID}-day-${d}`} label={dueLabel(d, today, i18n.language, t)} selected={day === d} onPress={() => setDay(d)} />
            ))}
          </View>
          <TimeWheel value={time} onChange={setTime} testID={`${testID}-time`} label={t("todos.reminder.time")} />
          <View style={{ alignSelf: "flex-start" }}>
          <Chip
            testID={`${testID}-save`}
            label={t("todos.reminder.save")}
            selected
            onPress={() => {
              onChange(reminderAt(day, time));
              setOpen(false);
            }}
          />
          </View>
        </View>
      ) : null}
    </View>
  );
}
