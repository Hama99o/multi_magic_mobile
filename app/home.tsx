/**
 * HOME — the front page, the hub to every app (the owner, 2026-11-06: the
 * app opens on a home page like the web's, not on the assistant; 2026-11-17:
 * "improve the Home page to match the web's Home, in a mobile style").
 * docs/design/app-shell/SPEC.md §G.
 *
 * The web's Home is a landing page (hero, promos); here the shell header
 * already says what the app is, so Home keeps the web's useful parts:
 *   1. the shared header, titled MultiMagic;
 *   2. the greeting;
 *   3. the Ask box: the assistant, which is not a header button on mobile;
 *   4. Coming up, the web's `UpcomingCard`: the next five events in 30 days,
 *      absent when nothing is coming or the calendar cannot be read;
 *   5. every app from the registry as a tile with the web's one line.
 */
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ASSISTANT_GRADIENT, HOME_APPS, tileColors, type HomeApp } from "@/theme/appColors";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Sparkles, Search } from "@/components/icons";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppMark } from "@/components/shell/AppMark";
import { GradientFill } from "@/components/shell/GradientFill";
import { useColors, useMetrics, useScheme } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { useShellBadges } from "@/hooks/useShellBadges";
import { APP_REGISTRY, capBadge, openApp, type AppEntry } from "@/apps/registry";
import { calendarApi, type Occurrence } from "@/api/calendar";
import { calendarKeys } from "@/api/keys";
import { localDay } from "@/screens/calendar/byDay";
import { addDays, todayKey } from "@/screens/calendar/dates";
import { eventColor } from "@/screens/calendar/colors";

const GAP = 10;
/** The web's `UpcomingCard`: 30 days ahead, the first five. */
const UPCOMING_DAYS = 30;
const UPCOMING_SHOWN = 5;
/** The last app opened from Home (a per-person convenience: a thin ring, not a fill). */
const LAST_APP_KEY = "home_last_app";

type TileEntry = AppEntry & { key: HomeApp };

/**
 * One app on Home (owner, 2026-11-15: "make each one good"). A tinted card
 * with the app's badge, its name and its one line, in the page's ink (4.5:1,
 * appColors.test.ts). The last one used has a thin ring.
 */
function Tile({ entry, width, index, lastUsed, badge, onPress }: { entry: TileEntry; width: number; index: number; lastUsed: boolean; badge: string | null; onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const scheme = useScheme();
  const { t } = useTranslation();
  const tint = tileColors(entry.key, scheme);
  const [pressed, setPressed] = useState(false);
  const title = t(entry.labelKey);
  // `home-tile-ai` predates the registry; the flows and tests name it so.
  const testID = entry.key === "assistant" ? "home-tile-ai" : `home-tile-${entry.key}`;
  return (
    // The app grid is a `.map` inside a ScrollView, not a recycled list, so
    // the tiles keep their staggered arrival (the list-cell-animation rule).
    // eslint-disable-next-line no-restricted-syntax
    <Animated.View entering={FadeInDown.delay(index * 30).duration(240)} style={{ width }}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync().catch(() => undefined);
          onPress();
        }}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={badge ? `${title}, ${badge}` : title}
        accessibilityHint={t(entry.lineKey)}
        style={{
          width,
          minHeight: 118,
          padding: metrics.space.md,
          gap: 6,
          borderRadius: metrics.radius.lg,
          backgroundColor: tint.surface,
          borderWidth: lastUsed ? 2 : 1,
          borderColor: lastUsed ? tint.ring : `${tint.badge}33`,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        }}
        testID={testID}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <AppMark app={entry.key} size={40} testID={`${testID}-badge`} />
          {badge ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
              <Text variant="caption" style={{ color: "#ffffff", fontWeight: "700" }} testID={`${testID}-count`}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="label" style={{ fontSize: 16 }} numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {t(entry.lineKey)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** "Today", "Tomorrow", or the short weekday and day ("Fri 21"). */
function dayLabel(occurrence: Occurrence, t: (k: string) => string, lang: string): string {
  const day = localDay(occurrence);
  const today = todayKey();
  if (day === today) return t("calendar.today");
  if (day === addDays(today, 1)) return t("calendar.tomorrow");
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang, { weekday: "short", day: "numeric" });
}

function timeLabel(occurrence: Occurrence, t: (k: string) => string, lang: string): string {
  if (occurrence.allDay || !occurrence.startsAt) return t("calendar.allDay");
  return new Date(occurrence.startsAt).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
}

function ComingUp() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const { data } = useQuery({ queryKey: calendarKeys.upcoming(UPCOMING_DAYS), queryFn: () => calendarApi.upcomingPage(UPCOMING_DAYS) });
  const next = (data?.occurrences ?? []).slice(0, UPCOMING_SHOWN);
  // Nothing coming, still loading, or unreadable: no card at all, as on the web.
  if (next.length === 0) return null;
  return (
    <View
      style={{ backgroundColor: colors.surface, borderRadius: metrics.radius.lg, borderWidth: 1, borderColor: colors.border, padding: metrics.space.md, gap: metrics.space.xs }}
      testID="home-upcoming"
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: metrics.space.sm }}>
        <Text variant="label" accessibilityRole="header" style={{ fontSize: 16 }}>
          {t("shell.comingUp")}
        </Text>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push("/calendar")} testID="home-upcoming-open">
          <Text variant="label" tone="accent">
            {t("shell.openCalendar")}
          </Text>
        </Pressable>
      </View>
      {next.map((occurrence, i) => (
        <Pressable
          key={occurrence.key}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/calendar/event", params: { id: String(occurrence.event.id), on: occurrence.on } })}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: metrics.space.sm,
            minHeight: metrics.touch,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.border,
          }}
          testID={`home-upcoming-${occurrence.key}`}
        >
          <View style={{ width: 4, alignSelf: "stretch", marginVertical: 10, borderRadius: 2, backgroundColor: eventColor(occurrence.event) }} />
          <Text variant="caption" style={{ fontWeight: "700", minWidth: 72 }} numberOfLines={1}>
            {dayLabel(occurrence, t, i18n.language)}
          </Text>
          <Text variant="caption" tone="muted" style={{ minWidth: 48 }} numberOfLines={1}>
            {timeLabel(occurrence, t, i18n.language)}
          </Text>
          <Text numberOfLines={1} style={{ flex: 1 }}>
            {occurrence.event.title ?? t("calendar.untitled")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Global search on a phone (docs/design/search/SPEC.md §C): the header has no
 * room for the web's search key below a tablet, so Home opens it from here.
 */
function SearchField() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={t("search.placeholder")}
      onPress={() => router.push("/search")}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 48, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      testID="home-search"
    >
      <Search size={18} color={colors.inkMuted} />
      <Text tone="muted" numberOfLines={1} style={{ flex: 1 }}>
        {t("search.placeholder")}
      </Text>
    </Pressable>
  );
}

function AskBox() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("home.askAi")}
      onPress={() => router.push("/chat")}
      style={{ borderRadius: metrics.radius.lg, padding: 2, overflow: "hidden" }}
      testID="home-ask"
    >
      <GradientFill id="home-ask" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 50, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.lg - 2, backgroundColor: colors.surface }}>
        <Sparkles size={20} color={ASSISTANT_GRADIENT[0]} />
        <Text tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {t("home.aiBody")}
        </Text>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const user = useMe();
  const badges = useShellBadges();
  const first = user?.firstName?.trim();
  // 3 columns on a phone, 4 from 600 dp, 6 from 900 dp: equal tiles, never a
  // lonely full-width last one (owner, 2026-11-15).
  const { width: windowWidth } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(windowWidth - 2 * metrics.space.lg);
  const columns = gridWidth >= 900 ? 6 : gridWidth >= 600 ? 4 : 3;
  const tileWidth = Math.floor((gridWidth - GAP * (columns - 1)) / columns);
  const [lastApp, setLastApp] = useState<HomeApp | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(LAST_APP_KEY).then((v) => setLastApp(HOME_APPS.find((a) => a === v) ?? null)).catch(() => undefined);
  }, []);
  const tiles = APP_REGISTRY.filter((a): a is TileEntry => a.key !== "home");
  const badgeOf = (key: HomeApp) => (key === "chats" ? capBadge(badges.chats, 9) : key === "notifications" ? capBadge(badges.notifications, 99) : null);

  return (
    <Screen measure={false} header={<AppHeader app="home" />}>
      <ScrollView
        contentContainerStyle={{ gap: metrics.space.lg, paddingTop: metrics.space.lg, paddingBottom: metrics.space.xl, width: "100%", maxWidth: 1100, alignSelf: "center" }}
        showsVerticalScrollIndicator={false}
      >
        <View testID="home-greeting">
          <Text variant="title" accessibilityRole="header">
            {first ? t("home.greetingName", { name: first }) : t("home.greeting")}
          </Text>
        </View>
        <SearchField />
        <AskBox />
        <ComingUp />
        <View style={{ gap: metrics.space.sm }} testID="home-apps">
          <Text variant="caption" tone="muted" style={{ fontWeight: "700", letterSpacing: 0.5 }}>
            {t("shell.apps")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
            {tiles.map((entry, i) => (
              <Tile
                key={entry.key}
                entry={entry}
                index={i}
                width={tileWidth}
                badge={badgeOf(entry.key)}
                lastUsed={lastApp === entry.key}
                onPress={() => {
                  setLastApp(entry.key);
                  void AsyncStorage.setItem(LAST_APP_KEY, entry.key).catch(() => undefined);
                  openApp(entry.key, { current: "home", subScreen: false });
                }}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
