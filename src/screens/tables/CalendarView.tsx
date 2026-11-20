/**
 * CALENDAR on a phone (SPEC C6): exactly the web's own compact mode
 * (`CalendarView.tsx:178-235`), a small month with a dot per row and the
 * chosen day's rows under it. A date changes in the row's own date field
 * (no drag: the web's compact mode turns it off too, `:98`). "No date"
 * shows the rows without one. "+" adds a row ON the chosen day.
 */
import { FlatList, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/api/fields";
import type { RecordRow } from "@/api/tables";
import type { KnownRecords } from "@/components/fields/display";
import { optionsFor } from "@/components/fields/display";
import { Plus } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { MonthGrid } from "@/screens/calendar/MonthGrid";
import { formatDayLong, todayKey } from "@/screens/calendar/dates";
import { colorHex } from "@/screens/flow/logic";
import { RecordCard } from "./RecordCard";

export function CalendarView({
  month,
  day,
  byDay,
  undated,
  showUndated,
  title,
  fields,
  colorField,
  known,
  cardHeight,
  editable,
  onMonthChange,
  onDayChange,
  onToggleUndated,
  onOpen,
  onAdd,
}: {
  month: string;
  day: string;
  byDay: Map<string, RecordRow[]>;
  undated: RecordRow[] | null;
  showUndated: boolean;
  title: FieldDefinition | null;
  fields: FieldDefinition[];
  colorField: FieldDefinition | null;
  known: KnownRecords;
  cardHeight: number;
  editable: boolean;
  onMonthChange: (month: string) => void;
  onDayChange: (day: string) => void;
  onToggleUndated: () => void;
  onOpen: (row: RecordRow) => void;
  onAdd: (day: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();

  // One dot per row on its day, in the row's colour when the view colours rows.
  const marks = new Map<string, string[]>();
  for (const [d, rows] of byDay) marks.set(d, rows.map((r) => colorHex(colorField ? optionsFor(colorField, r.values[colorField.id])[0]?.color : null) ?? colors.accent));

  const shown = showUndated ? (undated ?? []) : (byDay.get(day) ?? []);

  return (
    <FlatList
      testID="tables-calendar"
      data={shown}
      keyExtractor={(r) => String(r.id)}
      getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
      ListHeaderComponent={
        <View style={{ gap: metrics.space.sm, marginBottom: metrics.space.sm }}>
          <MonthGrid testID="tables-calendar-month" month={month} selected={showUndated ? null : day} today={todayKey()} marks={marks} onMonthChange={onMonthChange} onSelect={onDayChange} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
            <Text variant="label" style={{ flex: 1 }} numberOfLines={1} testID="tables-calendar-day">
              {showUndated ? t("tables.calendar.noDate") : formatDayLong(day, i18n.language)}
            </Text>
            <Pressable testID="tables-calendar-undated" onPress={onToggleUndated} accessibilityRole="button" accessibilityState={{ selected: showUndated }} accessibilityLabel={t("tables.calendar.noDate")} style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: showUndated ? colors.accent : colors.border }}>
              <Text variant="label">{t("tables.calendar.noDate")}</Text>
            </Pressable>
            {editable && !showUndated ? (
              <Pressable testID="tables-calendar-add" onPress={() => onAdd(day)} accessibilityRole="button" accessibilityLabel={t("tables.calendar.add", { day: formatDayLong(day, i18n.language) })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
                <Plus size={22} color={colors.accent} />
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text tone="muted" style={{ padding: metrics.space.md, textAlign: "center" }} testID="tables-calendar-empty">
          {showUndated ? t("tables.calendar.noUndated") : t("tables.calendar.nothingThatDay")}
        </Text>
      }
      renderItem={({ item, index }) => <RecordCard row={item} index={index} title={title} fields={fields} colorField={colorField} coverField={null} known={known} height={cardHeight} onPress={() => onOpen(item)} testID={`tables-calendar-card-${index}`} />}
      contentContainerStyle={{ paddingBottom: metrics.space.xl }}
    />
  );
}
