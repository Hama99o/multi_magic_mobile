/**
 * A labelled "when" row: `Starts  [Thu 12 Nov] [14:30]` (Apple Invites), whose
 * pills open their editor INLINE under the row (WhatsApp, Pangea) — a month
 * for the date, a wheel for the time. The keyboard is never involved.
 *
 * ── THE BOUNDARY ──────────────────────────────────────────────────────────
 * This file and `index.ts` are the only places that know HOW a date or a time
 * is picked (supervisor, 2026-11-11). Swapping the inside for
 * `@react-native-community/datetimepicker` at the next native build changes
 * this folder and no screen.
 *
 * Which editor is open is the FORM's state (`open` / `onOpen`), so opening one
 * row's picker closes every other: two wheels open at once is a form you
 * cannot see the rest of.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { MonthGrid } from "../MonthGrid";
import { formatDay, formatDayLong, formatTime, startOfMonth, todayKey } from "../dates";
import { TimeWheel } from "./TimeWheel";

export type OpenPicker = `${string}:date` | `${string}:time` | null;

function Pill({ text, active, onPress, a11y, testID }: { text: string; active: boolean; onPress: () => void; a11y: string; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ expanded: active }}
      hitSlop={4}
      style={{
        minHeight: 40,
        paddingHorizontal: metrics.space.md,
        borderRadius: metrics.radius.sm,
        justifyContent: "center",
        backgroundColor: active ? colors.accent : colors.border,
      }}
    >
      <Text variant="label" tone={active ? "onAccent" : "default"} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

export function WhenRow({
  name,
  label,
  day,
  onDay,
  time,
  onTime,
  open,
  onOpen,
  minDay,
  emptyLabel,
  onClear,
  withYear,
}: {
  /** Distinguishes this row's pickers: "start", "end", "until". */
  name: string;
  label: string;
  /** `YYYY-MM-DD`, or "" for not set (then `emptyLabel` shows). */
  day: string;
  onDay: (day: string) => void;
  /** Omit for a date-only row (all-day, "repeat until"). */
  time?: string;
  onTime?: (time: string) => void;
  open: OpenPicker;
  onOpen: (which: OpenPicker) => void;
  minDay?: string;
  emptyLabel?: string;
  /** Shows a ✕ that empties the row ("ends", "until"). */
  onClear?: () => void;
  withYear?: boolean;
}) {
  const metrics = useMetrics();
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const dateKey = `${name}:date` as const;
  const timeKey = `${name}:time` as const;
  const [month, setMonth] = useState(startOfMonth(day || minDay || todayKey()));
  const toggle = (which: OpenPicker) => {
    if (which === dateKey) setMonth(startOfMonth(day || minDay || todayKey()));
    onOpen(open === which ? null : which);
  };
  const dayText = day ? formatDay(day, i18n.language, withYear) : (emptyLabel ?? "");

  return (
    <View style={{ paddingVertical: metrics.space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}>
        <Text style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Pill
          testID={`when-${name}-date`}
          text={dayText}
          active={open === dateKey}
          onPress={() => toggle(dateKey)}
          a11y={t("calendar.picker.dateOf", { label, value: day ? formatDayLong(day, i18n.language) : dayText })}
        />
        {time !== undefined && onTime ? (
          <Pill
            testID={`when-${name}-time`}
            text={time ? formatTime(time, i18n.language) : "—"}
            active={open === timeKey}
            onPress={() => toggle(timeKey)}
            a11y={t("calendar.picker.timeOf", { label, value: time ? formatTime(time, i18n.language) : "—" })}
          />
        ) : null}
        {onClear && day ? (
          <Pressable
            testID={`when-${name}-clear`}
            onPress={() => {
              onClear();
              onOpen(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={t("calendar.picker.clear", { label })}
            hitSlop={8}
            style={{ width: 32, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {open === dateKey ? (
        <View style={{ paddingTop: metrics.space.sm }}>
          <MonthGrid
            testID={`when-${name}-month`}
            month={month}
            selected={day || null}
            today={todayKey()}
            minDay={minDay}
            onMonthChange={setMonth}
            onSelect={(picked) => {
              onDay(picked);
              onOpen(null);
            }}
          />
        </View>
      ) : null}
      {open === timeKey && onTime ? (
        <View style={{ paddingTop: metrics.space.sm }}>
          <TimeWheel testID={`when-${name}-wheel`} value={time || "09:00"} onChange={onTime} label={label} />
        </View>
      ) : null}
    </View>
  );
}
