/**
 * A month, as six weeks of tappable days — the month view AND the date
 * picker (`docs/design/calendar/SPEC.md` §B: Todoist, Binance, Weverse,
 * Pangea all draw the same grid for both jobs).
 *
 * - Always 42 cells (`monthGridDays`), so the grid never changes height and a
 *   thumb lands on the same row every month.
 * - DOTS under a day say "something here" (Binance), up to three, in the
 *   events' own colours; the words are in the list under the grid.
 * - Today is ringed, the picked day is filled with the accent (Outlook).
 * - Each cell is one accessibility element that SAYS the whole date and how
 *   many events it holds: a "12" read aloud is not a date.
 * - Arrows flip in a right-to-left layout, because "previous" points to the
 *   start of the line, which is the right there.
 */
import { memo, useMemo } from "react";
import { I18nManager, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { addMonths, formatDayLong, formatMonth, monthGridDays, startOfMonth, weekdayLabels, weekStartsOn } from "./dates";

export interface MonthGridProps {
  /** Any day in the month to draw. */
  month: string;
  selected: string | null;
  today: string;
  /** Colours of what falls on each day, in order. */
  marks?: Map<string, string[]>;
  onSelect: (day: string) => void;
  onMonthChange: (month: string) => void;
  /** Days before this cannot be picked (the "ends" picker). */
  minDay?: string;
  testID?: string;
}

export function MonthHeader({ month, today, onMonthChange, testID }: { month: string; today: string; onMonthChange: (month: string) => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const isThisMonth = startOfMonth(month) === startOfMonth(today);
  const rtl = I18nManager.isRTL;
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  const arrow = { width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" } as const;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
      <Text
        testID={`${testID}-label`}
        variant="title"
        accessibilityRole="header"
        style={{ flex: 1, textTransform: "capitalize", fontSize: 20 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {formatMonth(month, i18n.language)}
      </Text>
      {isThisMonth ? null : (
        <Pressable
          testID={`${testID}-today`}
          onPress={() => onMonthChange(startOfMonth(today))}
          accessibilityRole="button"
          accessibilityLabel={t("calendar.goToToday")}
          hitSlop={6}
          style={{ paddingHorizontal: metrics.space.md, minHeight: 36, justifyContent: "center", borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border }}
        >
          <Text variant="label">{t("calendar.today")}</Text>
        </Pressable>
      )}
      <Pressable testID={`${testID}-prev`} onPress={() => onMonthChange(addMonths(month, -1))} accessibilityRole="button" accessibilityLabel={t("calendar.previousMonth")} style={arrow}>
        <Prev testID={`${testID}-prev-glyph-${rtl ? "right" : "left"}`} size={22} color={colors.ink} />
      </Pressable>
      <Pressable testID={`${testID}-next`} onPress={() => onMonthChange(addMonths(month, 1))} accessibilityRole="button" accessibilityLabel={t("calendar.nextMonth")} style={arrow}>
        <Next testID={`${testID}-next-glyph-${rtl ? "left" : "right"}`} size={22} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const DayCell = memo(function DayCell({
  day,
  inMonth,
  isToday,
  isSelected,
  disabled,
  dots,
  onSelect,
  label,
  testID,
}: {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  disabled: boolean;
  dots: string[];
  onSelect: (day: string) => void;
  label: string;
  testID: string;
}) {
  const colors = useColors();
  const size = 36;
  return (
    <Pressable
      testID={testID}
      onPress={() => onSelect(day)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected, disabled }}
      style={{ flex: 1, alignItems: "center", paddingVertical: 2, minHeight: 48, opacity: disabled ? 0.3 : 1 }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isSelected ? colors.accent : "transparent",
          borderWidth: isToday && !isSelected ? 1.5 : 0,
          borderColor: colors.accent,
        }}
      >
        <Text
          variant="label"
          // A neighbouring month's day is still tappable, so it keeps the
          // muted tone's own contrast (~4.9:1); an extra 60% opacity put it
          // near 2.6:1 on the light ground.
          tone={isSelected ? "onAccent" : inMonth ? (isToday ? "accent" : "default") : "muted"}
        >
          {String(Number(day.slice(8)))}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 2, height: 6, marginTop: 2 }}>
        {dots.slice(0, 3).map((color, index) => (
          <View key={index} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
        ))}
      </View>
    </Pressable>
  );
});

export function MonthGrid({ month, selected, today, marks, onSelect, onMonthChange, minDay, testID = "month" }: MonthGridProps) {
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const weekStart = weekStartsOn(i18n.language);
  const days = useMemo(() => monthGridDays(month, weekStart), [month, weekStart]);
  const headers = useMemo(() => weekdayLabels(weekStart, i18n.language), [weekStart, i18n.language]);
  const monthPrefix = month.slice(0, 7);

  return (
    <View testID={testID}>
      <MonthHeader month={month} today={today} onMonthChange={onMonthChange} testID={testID} />
      <View style={{ flexDirection: "row", marginTop: metrics.space.sm }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {headers.map((label, index) => (
          <Text key={index} variant="caption" tone="muted" style={{ flex: 1, textAlign: "center" }}>
            {label}
          </Text>
        ))}
      </View>
      {Array.from({ length: 6 }, (_, week) => (
        <View key={week} style={{ flexDirection: "row" }}>
          {days.slice(week * 7, week * 7 + 7).map((day) => {
            const dots = marks?.get(day) ?? [];
            const long = formatDayLong(day, i18n.language);
            return (
              <DayCell
                key={day}
                day={day}
                inMonth={day.startsWith(monthPrefix)}
                isToday={day === today}
                isSelected={day === selected}
                disabled={Boolean(minDay && day < minDay)}
                dots={dots}
                onSelect={onSelect}
                testID={`${testID}-day-${day}`}
                label={[day === today ? t("calendar.today") : null, long, dots.length ? t("calendar.eventCount", { count: dots.length }) : null].filter(Boolean).join(", ")}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
