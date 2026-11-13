/**
 * Keep's "Remind me" sheet (owner, 2026-11-13; local notifications, Hello):
 * quick choices (later today, tomorrow, next week), a date and a time
 * (the calendar's WhenRow, no native picker), a repeat, and Remove.
 */
import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { WhenRow, type OpenPicker } from "@/screens/calendar/pickers";
import { quickChoices, type NoteReminder, type ReminderRepeat } from "./reminders";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fromKeys = (day: string, time: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
};

export function ReminderSheet({
  visible, value, onSave, onRemove, onClose,
}: {
  visible: boolean;
  value: NoteReminder | null;
  onSave(reminder: NoteReminder): void;
  onRemove(): void;
  onClose(): void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const start = value?.at ?? quickChoices()[0].at;
  const [day, setDay] = useState(dayKey(start));
  const [time, setTime] = useState(timeKey(start));
  const [repeat, setRepeat] = useState<ReminderRepeat | null>(value?.repeat ?? null);
  const [open, setOpen] = useState<OpenPicker>(null);
  useEffect(() => {
    if (!visible) return;
    const at = value?.at ?? quickChoices()[0].at;
    setDay(dayKey(at));
    setTime(timeKey(at));
    setRepeat(value?.repeat ?? null);
    setOpen(null);
  }, [visible, value]);

  const chip = (testID: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={testID}
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center",
        borderWidth: 1, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? `${colors.accent}33` : "transparent",
      }}
    >
      <Text style={{ fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  const quickLabel = { laterToday: t("notes.reminder.laterToday"), tomorrow: t("notes.reminder.tomorrow"), nextWeek: t("notes.reminder.nextWeek") };
  const repeatLabel = { once: t("notes.reminder.once"), daily: t("notes.reminder.daily"), weekly: t("notes.reminder.weekly"), monthly: t("notes.reminder.monthly") };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose} accessibilityLabel={t("common.close")} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: metrics.space.lg, gap: metrics.space.md }}>
        <Text style={{ fontSize: 17, fontWeight: "700" }}>{t("notes.reminder.title")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {quickChoices().map((c) =>
            chip(`reminder-quick-${c.key}`, quickLabel[c.key], dayKey(c.at) === day && timeKey(c.at) === time, () => {
              setDay(dayKey(c.at));
              setTime(timeKey(c.at));
            }),
          )}
        </View>
        <WhenRow name="reminder" label={t("notes.reminder.when")} day={day} onDay={setDay} time={time} onTime={setTime} open={open} onOpen={setOpen} minDay={dayKey(new Date())} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["once", "daily", "weekly", "monthly"] as const).map((r) =>
            chip(`reminder-repeat-${r}`, repeatLabel[r], (repeat ?? "once") === r, () => setRepeat(r === "once" ? null : r)),
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
          {value ? (
            <Pressable testID="reminder-remove" onPress={onRemove} accessibilityRole="button" style={{ padding: 10 }}>
              <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("notes.reminder.remove")}</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} style={{ padding: 10 }}>
            <Text tone="muted">{t("common.cancel")}</Text>
          </Pressable>
          <Pressable testID="reminder-save" onPress={() => onSave({ at: fromKeys(day, time), repeat })} accessibilityRole="button" style={{ padding: 10 }}>
            <Text style={{ color: colors.accent, fontWeight: "700" }}>{t("common.save")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** "Tomorrow, 08:00 · weekly" style label for chips. */
export function reminderLabel(r: NoteReminder, locale: string, repeatLabel: (r: ReminderRepeat) => string): string {
  const when = r.at.toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return r.repeat ? `${when} · ${repeatLabel(r.repeat)}` : when;
}
