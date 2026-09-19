/**
 * The agenda — `docs/design/calendar/SPEC.md`. "Its important view only."
 *
 * ── `upcoming`, NOT `/events` ─────────────────────────────────────────────
 * Recurrence here is arithmetic, not rows (`calendar_app/occurrences.rb:5-8`):
 * a yearly birthday is ONE row whose `starts_on` is in 1990. An agenda built on
 * the flat `/events` list sorts it into 1990 and never shows it.
 * `/events/upcoming` returns OCCURRENCES — the rule already expanded over the
 * window, already ordered, and already including what is shared with him. The
 * controller says so itself at `events_controller.rb:21-22`.
 *
 * ── AN AGENDA, NEVER A MONTH GRID ─────────────────────────────────────────
 * Outlook, Teams and Saturn all put a scrollable week strip above the list, and
 * every one of them makes tapping a date navigate there. That is date-browsing,
 * which is the month grid's job, which is the thing we are not building: "a
 * month grid on a phone answers 'what does my month look like', which is not a
 * question anybody asks on a phone between two appointments."
 *
 * ── STALE IS A REAL STATE, AND IT HAS AN ANSWER ───────────────────────────
 * His words: *"if AI agent calendar and it is not applied you can say reload
 * it — there should be an option… it should not be very big which can break
 * design but it should be stylish."*
 *
 * The assistant can create an event from the chat screen, and this list is
 * then wrong with nothing to say so. Three things, in the order they act:
 *
 * 1. **It refreshes ITSELF when the assistant writes here.** An assistant
 *    reply carries the records it created as `links`, each with a route key,
 *    and `MessageChannel` streams that reply to this user wherever they are
 *    (`useAssistantEcho`). So the common case needs no gesture at all.
 * 2. **Pull to refresh** — already here, and what a list on a phone means.
 * 3. **A header glyph**, for when a gesture is not discoverable, with the
 *    busy state inside the control rather than over the list.
 *
 * And a muted "Updated just now" line rather than a banner, so the question
 * "is this still true?" has an answer on screen before it is asked.
 *
 * ── AND EMPTINESS IS SAID ONCE ────────────────────────────────────────────
 * Teams and Google Home print "No events" under every empty day — six lines of
 * emptiness and one appointment, on a sparse week. His instruction is narrower
 * and better: "if today is empty it says so." So today always appears, with
 * either its events or one line; later empty days are simply absent.
 */
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { RefreshButton, UpdatedLine } from "@/components/Freshness";
import { CALENDAR_KEYS, useAssistantEcho } from "@/hooks/useAssistantEcho";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { calendarApi, type Occurrence } from "@/api/calendar";
import { aiApi } from "@/api/ai";
import { failureMessage } from "@/api/failure";
import { useDraft } from "@/hooks/useDraft";
import { EventRow } from "@/screens/people/EventRow";

/** "The next few days", his phrase — a week is the smallest window that
 *  reliably contains something. */
const WINDOW_DAYS = 7;

type Row =
  | { kind: "day"; key: string; label: string; isToday: boolean }
  | { kind: "event"; key: string; occurrence: Occurrence }
  | { kind: "nothing"; key: string };

/** `Today · Thu 18 Sep` — Craft names the day AND the date, so "Today" never
 *  floats free of when today is. */
function headingFor(
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

  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);
  if (on === tomorrowKey) return { label: `${t("calendar.tomorrow")} · ${pretty}`, isToday: false };

  return { label: pretty, isToday: false };
}

/**
 * `YYYY-MM-DD` in the DEVICE's own day, which is what `on` is expressed in —
 * `toISOString()` would be UTC and put "today" on yesterday for anybody west of
 * Greenwich after their evening.
 */
function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function Calendar() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [composed, setComposed] = useState(false);

  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt } = useQuery({
    queryKey: ["calendar", "upcoming", WINDOW_DAYS],
    queryFn: () => calendarApi.upcoming(WINDOW_DAYS),
  });

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  /**
   * The assistant just wrote an event — re-read, without being asked. This is
   * the case his instruction is about, and it is the one the control is the
   * FALLBACK for rather than the answer to.
   */
  useAssistantEcho(CALENDAR_KEYS, reload);

  const { data: sessionId } = useQuery({
    queryKey: ["ai", "currentSession"],
    queryFn: aiApi.currentSessionId,
  });
  const { setDraft } = useDraft(sessionId ?? null);

  /** Same rule as a notification, and for the same reason: there is no event
   *  screen in this app, so the assistant is the destination — composed, and
   *  not sent. */
  const ask = useCallback(
    (occurrence: Occurrence) => {
      const when = headingFor(occurrence.on, localDateKey(new Date()), t, i18n.language).label;
      setDraft(t("calendar.question", { title: occurrence.event.title, when }));
      setComposed(true);
      router.push("/chat");
    },
    [setDraft, t, i18n.language],
  );

  const rows = useMemo<Row[]>(() => {
    const occurrences = data ?? [];
    const today = localDateKey(new Date());
    const out: Row[] = [];

    // Grouped in ARRIVAL order, not re-sorted: `Occurrence#sort_key` already
    // puts all-day events before timed ones within a day, and re-deriving that
    // here would mean getting it subtly different for free.
    let currentDay = "";
    let todaySeen = false;

    for (const occurrence of occurrences) {
      if (occurrence.on !== currentDay) {
        currentDay = occurrence.on;
        const heading = headingFor(occurrence.on, today, t, i18n.language);
        if (heading.isToday) todaySeen = true;
        out.push({
          kind: "day",
          key: `day-${occurrence.on}`,
          label: heading.label,
          isToday: heading.isToday,
        });
      }
      out.push({ kind: "event", key: occurrence.key, occurrence });
    }

    // Today ALWAYS appears — the emptiness is the answer. Later empty days do
    // not; see this file's header.
    if (!todaySeen) {
      const heading = headingFor(today, today, t, i18n.language);
      out.unshift({ kind: "nothing", key: "nothing-today" });
      out.unshift({ kind: "day", key: `day-${today}`, label: heading.label, isToday: true });
    }

    return out;
  }, [data, t, i18n.language]);

  return (
    <Screen measure>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.sm,
          paddingVertical: metrics.space.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={8}
          style={{ width: 32, height: 32, justifyContent: "center" }}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" style={{ flex: 1 }}>
          {t("calendar.title")}
        </Text>
        {/* Quiet, unlabelled, top right — Outlook's agenda header and Mesh's
            notification header both do exactly this. */}
        <RefreshButton
          refreshing={isRefetching}
          onPress={reload}
          label={t("calendar.refresh")}
          testID="calendar-refresh"
        />
      </View>

      <UpdatedLine at={dataUpdatedAt} refreshing={isRefetching} testID="calendar-updated" />

      {composed ? (
        <Text variant="caption" tone="muted" style={{ paddingBottom: metrics.space.sm }}>
          {t("calendar.composed")}
        </Text>
      ) : null}

      {error ? (
        <View style={{ paddingVertical: metrics.space.xl, gap: metrics.space.sm }}>
          <Text tone="muted">
            {failureMessage(error, t("calendar.loadFailed"))}
          </Text>
          <Pressable onPress={() => void refetch()} accessibilityRole="button" hitSlop={8}>
            <Text tone="accent">{t("common.tryAgain")}</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        testID="calendar-list"
        data={isLoading || error ? [] : rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) => {
          if (item.kind === "day") {
            return (
              <Text
                testID={item.isToday ? "calendar-day-today" : `calendar-day-${item.key}`}
                variant="label"
                tone={item.isToday ? "accent" : "muted"}
                style={{ paddingTop: metrics.space.lg, paddingBottom: metrics.space.xs }}
              >
                {item.label}
              </Text>
            );
          }
          if (item.kind === "nothing") {
            return (
              <Text
                testID="calendar-nothing-today"
                tone="muted"
                style={{ paddingVertical: metrics.space.md }}
              >
                {t("calendar.nothingToday")}
              </Text>
            );
          }
          return <EventRow occurrence={item.occurrence} onPress={() => ask(item.occurrence)} />;
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.inkMuted}
          />
        }
        ListFooterComponent={
          isLoading || error || rows.length === 0 ? null : (
            <Text
              variant="caption"
              tone="muted"
              style={{ paddingTop: metrics.space.xl, paddingBottom: metrics.space.lg }}
            >
              {t("calendar.footer", { days: WINDOW_DAYS })}
            </Text>
          )
        }
        contentContainerStyle={{ paddingBottom: metrics.space.xl }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
