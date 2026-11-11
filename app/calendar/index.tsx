/**
 * The calendar — `docs/design/calendar/SPEC.md`, the full-app section.
 *
 * Two views over the server's occurrences, one toggle, the last choice kept:
 *
 * - **Agenda** (the default): what is next, from today, grouped by day. Today
 *   always appears, with its events or one line saying it is free; later empty
 *   days are simply absent (§2.1 of the history below the full-app section).
 *   Seven days first, because the assistant's suggestions read the same
 *   7-day key; "Show more" widens by 30.
 * - **Month**: a 42-day grid with dots (Todoist, Binance), the picked day's
 *   events under it, from `events/occurrences` for exactly the drawn days.
 *
 * A tap opens the event (`/calendar/event`); the round **+** opens a new one
 * on the picked day (or today). A delete made on the detail page comes back
 * here with an **Undo** (`useCalendarUndo`).
 *
 * ── `upcoming` / `occurrences`, NEVER `/events` ───────────────────────────
 * Recurrence is arithmetic, not rows (`calendar_app/occurrences.rb:5-8`): a
 * yearly birthday is ONE row dated 1990. Both reads return occurrences, the
 * rule already expanded over the window and ordered; the client groups and
 * never re-sorts.
 *
 * ── STALE IS A REAL STATE, AND IT HAS AN ANSWER ───────────────────────────
 * The assistant can write an event from the chat. `useAssistantEcho` hears
 * its reply and re-reads every calendar query; pull to refresh and the header
 * glyph are the fallbacks, and "Updated just now" says how fresh the list is.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, FlatList, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, ChevronLeft, List, Plus } from "@/components/icons";
import { RefreshButton, UpdatedLine } from "@/components/Freshness";
import { CALENDAR_KEYS, useAssistantEcho } from "@/hooks/useAssistantEcho";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { AiButton } from "@/components/AiButton";
import { useColors, useMetrics } from "@/hooks/useColors";
import { calendarApi, type Occurrence } from "@/api/calendar";
import { failureMessage } from "@/api/failure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { LoadFailure, isStale } from "@/components/LoadFailure";
import { EventRow } from "@/screens/people/EventRow";
import { MonthGrid } from "@/screens/calendar/MonthGrid";
import { byDay } from "@/screens/calendar/byDay";
import { eventColor } from "@/screens/calendar/colors";
import { addDays, dayKey, formatDayLong, gridWindow, startOfMonth, weekStartsOn } from "@/screens/calendar/dates";
import { useCalendarView } from "@/stores/calendarView.store";
import { useCalendarUndo } from "@/stores/calendarUndo.store";

/** "The next few days", his phrase. The assistant reads this same key. */
const WINDOW_DAYS = 7;
const MORE_DAYS = 30;
const MAX_DAYS = 365;
/** How long the Undo stays offered — longer with a screen reader, who has to
 *  hear it, find it and reach it (WCAG 2.2.1, adjustable timing). */
const UNDO_MS = 8000;
const UNDO_MS_SCREEN_READER = 30_000;

type Row =
  | { kind: "day"; key: string; label: string; isToday: boolean }
  | { kind: "event"; key: string; occurrence: Occurrence }
  | { kind: "nothing"; key: string };

/** `Today · Thu 18 Sep` — Craft names the day AND the date, so "Today" never
 *  floats free of when today is. */
export function headingFor(
  on: string,
  today: string,
  t: (key: string) => string,
  locale?: string,
): { label: string; isToday: boolean } {
  const date = new Date(`${on}T00:00:00`);
  // The APP's language, not the phone's: the heading has to read in the
  // language the person chose, on whatever phone they chose it.
  const pretty = Number.isNaN(date.getTime())
    ? on
    : date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });

  if (on === today) return { label: `${t("calendar.today")} · ${pretty}`, isToday: true };
  if (on === addDays(today, 1)) return { label: `${t("calendar.tomorrow")} · ${pretty}`, isToday: false };
  return { label: pretty, isToday: false };
}

function open(occurrence: Occurrence) {
  router.push({ pathname: "/calendar/event", params: { id: String(occurrence.event.id), on: occurrence.on } });
}

export default function Calendar() {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { view, hydrate, setView } = useCalendarView();
  const today = dayKey(new Date());
  const [days, setDays] = useState(WINDOW_DAYS);
  const [month, setMonth] = useState(startOfMonth(today));
  const [picked, setPicked] = useState(today);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const agenda = useQuery({
    queryKey: ["calendar", "upcoming", days],
    // The page, not the bare list: it carries how many occurrences could not
    // be read, which the screen says (`UnreadableNotice`).
    queryFn: () => calendarApi.upcomingPage(days),
    enabled: view === "agenda",
    placeholderData: keepPreviousData,
  });

  const window = gridWindow(month, weekStartsOn(i18n.language));
  const monthQuery = useQuery({
    queryKey: ["calendar", "occurrences", window.from, window.to],
    queryFn: () => calendarApi.occurrences(window.from, window.to),
    enabled: view === "month",
    placeholderData: keepPreviousData,
  });

  const active = view === "agenda" ? agenda : monthQuery;
  const { data, error, refetch, isRefetching, dataUpdatedAt } = active;

  /** Re-read every calendar window, not only the one on screen: the other
   *  view and any open month are just as stale after a write. */
  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
  }, [queryClient]);

  // The assistant just wrote an event — re-read, without being asked.
  useAssistantEcho(CALENDAR_KEYS, reload);

  const rows = useMemo<Row[]>(() => {
    const occurrences = agenda.data?.occurrences ?? [];
    const out: Row[] = [];
    // Grouped in ARRIVAL order, not re-sorted: `Occurrence#sort_key` already
    // puts all-day events before timed ones within a day.
    let currentDay = "";
    let todaySeen = false;
    for (const occurrence of occurrences) {
      if (occurrence.on !== currentDay) {
        currentDay = occurrence.on;
        const heading = headingFor(occurrence.on, today, t, i18n.language);
        if (heading.isToday) todaySeen = true;
        out.push({ kind: "day", key: `day-${occurrence.on}`, label: heading.label, isToday: heading.isToday });
      }
      out.push({ kind: "event", key: occurrence.key, occurrence });
    }
    // Today ALWAYS appears — the emptiness is the answer.
    if (!todaySeen) {
      const heading = headingFor(today, today, t, i18n.language);
      out.unshift({ kind: "nothing", key: "nothing-today" });
      out.unshift({ kind: "day", key: `day-${today}`, label: heading.label, isToday: true });
    }
    return out;
  }, [agenda.data, today, t, i18n.language]);

  const grouped = useMemo(() => byDay(monthQuery.data?.occurrences ?? []), [monthQuery.data]);
  const marks = useMemo(() => {
    const out = new Map<string, string[]>();
    grouped.forEach((list, day) => out.set(day, list.map((occurrence) => eventColor(occurrence.event))));
    return out;
  }, [grouped]);
  const pickedList = grouped.get(picked) ?? [];

  // ── Undo for a delete made on the detail page ──────────────────────────
  const trashed = useCalendarUndo((state) => state.trashed);
  const clearTrashed = useCalendarUndo((state) => state.set);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  // Expiry is the effect's job (it clears the store when the time is up, at
  // once if it already is): `Date.now()` in render is impure and would make
  // the same props draw two different screens.
  const showUndo = trashed != null;
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => live && setScreenReader(on))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("screenReaderChanged", setScreenReader);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  // SAID, not only shown: `accessibilityLiveRegion` is Android-only, so on
  // iOS a blind user never learnt the Undo was there.
  useEffect(() => {
    if (trashed) AccessibilityInfo.announceForAccessibility(`${t("calendar.movedToTrash", { title: trashed.title })} ${t("calendar.undo")}`);
  }, [trashed, t]);
  useEffect(() => {
    if (!trashed) return;
    const left = (screenReader ? UNDO_MS_SCREEN_READER : UNDO_MS) - (Date.now() - trashed.at);
    const timer = setTimeout(() => clearTrashed(null), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [trashed, clearTrashed, screenReader]);
  const undo = async () => {
    if (!trashed || undoing) return;
    setUndoing(true);
    setUndoError(null);
    try {
      await calendarApi.restore(trashed.id);
      clearTrashed(null);
      reload();
    } catch (e) {
      setUndoError(failureMessage(e, t("calendar.undoFailed")));
    } finally {
      setUndoing(false);
    }
  };

  const newDay = view === "month" ? picked : today;
  const refreshControl = <RefreshControl refreshing={isRefetching} onRefresh={reload} tintColor={colors.inkMuted} />;

  return (
    <Screen measure>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {view === "agenda" ? t("calendar.title") : t("calendar.monthTitle")}
        </Text>
        {/* Alexa's list ⇄ grid toggle: the icon names where it takes you. */}
        <Pressable
          testID="calendar-view-toggle"
          onPress={() => setView(view === "agenda" ? "month" : "agenda")}
          accessibilityRole="button"
          accessibilityLabel={view === "agenda" ? t("calendar.showMonth") : t("calendar.showAgenda")}
          hitSlop={4}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          {view === "agenda" ? <CalendarDays size={22} color={colors.ink} /> : <List size={22} color={colors.ink} />}
        </Pressable>
        {/* Quiet, unlabelled, top right — Outlook's agenda header and Mesh's
            notification header both do exactly this. */}
        <RefreshButton refreshing={isRefetching} onPress={reload} label={t("calendar.refresh")} testID="calendar-refresh" />
        <AiButton compact />
      </View>

      {/* One freshness claim at a time: while a failed refresh stands over
          kept data, `LoadFailure` says how old it is. */}
      {isStale(error, Boolean(data)) ? null : <UpdatedLine at={dataUpdatedAt} refreshing={isRefetching} testID="calendar-updated" />}

      <UnreadableNotice count={data?.unreadable ?? 0} />

      <LoadFailure error={error} loadFailed={t("calendar.loadFailed")} hasData={Boolean(data)} updatedAt={dataUpdatedAt} onRetry={() => void refetch()} testID="calendar-load-failed" />

      {view === "agenda" ? (
        <FlatList
          testID="calendar-list"
          // Rows only from a REAL answer, and kept when a refresh fails: `rows`
          // always carries "Nothing today", which under an error would state a
          // fact nobody got.
          data={agenda.data ? rows : []}
          keyExtractor={(row) => row.key}
          renderItem={({ item }) => {
            if (item.kind === "day") {
              return (
                <Text
                  testID={item.isToday ? "calendar-day-today" : `calendar-day-${item.key}`}
                  variant="label"
                  tone={item.isToday ? "accent" : "muted"}
                  accessibilityRole="header"
                  style={{ paddingTop: metrics.space.lg, paddingBottom: metrics.space.xs }}
                >
                  {item.label}
                </Text>
              );
            }
            if (item.kind === "nothing") {
              return (
                <Text testID="calendar-nothing-today" tone="muted" style={{ paddingVertical: metrics.space.md }}>
                  {t("calendar.nothingToday")}
                </Text>
              );
            }
            return <EventRow occurrence={item.occurrence} onPress={() => open(item.occurrence)} />;
          }}
          refreshControl={refreshControl}
          ListFooterComponent={
            !agenda.data ? null : (
              <View style={{ paddingTop: metrics.space.xl, paddingBottom: 96, gap: metrics.space.sm }}>
                <Text variant="caption" tone="muted" testID="calendar-footer">
                  {t("calendar.footerDays", { days })}
                </Text>
                {days < MAX_DAYS ? (
                  <Pressable
                    testID="calendar-show-more"
                    onPress={() => setDays((current) => Math.min(MAX_DAYS, current + MORE_DAYS))}
                    accessibilityRole="button"
                    accessibilityLabel={t("calendar.showMore", { days: MORE_DAYS })}
                    style={{ minHeight: metrics.touch, justifyContent: "center" }}
                  >
                    <Text tone="accent" variant="label">
                      {t("calendar.showMore", { days: MORE_DAYS })}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: metrics.space.xl }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          testID="calendar-month-list"
          data={monthQuery.data ? pickedList : []}
          keyExtractor={(occurrence) => `${picked}-${occurrence.key}`}
          ListHeaderComponent={
            <View>
              <MonthGrid
                testID="calendar-month"
                month={month}
                selected={picked}
                today={today}
                marks={marks}
                onSelect={(day) => {
                  setPicked(day);
                  if (!day.startsWith(month.slice(0, 7))) setMonth(startOfMonth(day));
                }}
                onMonthChange={(next) => {
                  setMonth(next);
                  // Landing on this month picks today; any other, its first day.
                  setPicked(next === startOfMonth(today) ? today : next);
                }}
              />
              <Text testID="calendar-picked-day" variant="label" tone={picked === today ? "accent" : "muted"} accessibilityRole="header" style={{ paddingTop: metrics.space.lg, paddingBottom: metrics.space.xs, textTransform: "capitalize" }}>
                {formatDayLong(picked, i18n.language)}
              </Text>
            </View>
          }
          ListEmptyComponent={
            monthQuery.data ? (
              <Text testID="calendar-nothing-on-day" tone="muted" style={{ paddingVertical: metrics.space.md }}>
                {t("calendar.nothingOnDay")}
              </Text>
            ) : null
          }
          renderItem={({ item }) => <EventRow occurrence={item} onPress={() => open(item)} />}
          refreshControl={refreshControl}
          contentContainerStyle={{ paddingBottom: 96 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {showUndo && trashed ? (
        <View
          testID="calendar-undo"
          accessibilityLiveRegion="polite"
          style={{
            position: "absolute",
            left: metrics.space.lg,
            right: metrics.space.lg,
            bottom: insets.bottom + metrics.space.lg,
            flexDirection: "row",
            alignItems: "center",
            gap: metrics.space.md,
            paddingHorizontal: metrics.space.lg,
            minHeight: 52,
            borderRadius: metrics.radius.md,
            backgroundColor: colors.ink,
          }}
        >
          <Text style={{ flex: 1, color: colors.ground }} numberOfLines={2}>
            {undoError ?? t("calendar.movedToTrash", { title: trashed.title })}
          </Text>
          <Pressable testID="calendar-undo-button" onPress={() => void undo()} disabled={undoing} accessibilityRole="button" accessibilityLabel={t("calendar.undo")} hitSlop={8} style={{ minHeight: metrics.touch, justifyContent: "center" }}>
            {/* The ground's colour on the inverted bar, underlined: the accent
                on `ink` measured under 3:1 in dark mode. */}
            <Text variant="label" style={{ color: colors.ground, textDecorationLine: "underline" }}>
              {t("calendar.undo")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          testID="calendar-new"
          onPress={() => router.push({ pathname: "/calendar/edit", params: { day: newDay } })}
          accessibilityRole="button"
          accessibilityLabel={t("calendar.newEvent")}
          style={{
            position: "absolute",
            right: metrics.space.lg,
            bottom: insets.bottom + metrics.space.lg,
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accent,
            elevation: 4,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          <Plus size={26} color={colors.onAccent} />
        </Pressable>
      )}
    </Screen>
  );
}
