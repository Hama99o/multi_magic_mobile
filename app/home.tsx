/**
 * HOME — the front page, the hub to every app (the owner, 2026-11-06: the
 * app opens on a home page like the web's, not on the assistant).
 *
 * The assistant is the "AI" button at the top (`AiButton`), opening over
 * this screen; the avatar opens the same profile sheet as before. Below, one
 * tile per app, Pages first because it is the one he uses daily.
 */
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ASSISTANT_GRADIENT, HOME_APPS, tileColors, type HomeApp } from "@/theme/appColors";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { AiButton } from "@/components/AiButton";
import { ProfileSheet } from "@/components/settings/ProfileSheet";
import { Bell, BookUser, CalendarDays, FolderOpen, MessageSquareText, NotebookPen, ShieldCheck, Sparkles, Users, type LucideIcon } from "@/components/icons";
import { useColors, useMetrics, useScheme } from "@/hooks/useColors";
import { useAuthStore } from "@/stores/auth.store";
import { Avatar } from "@/screens/people/Avatar";
import { notificationsApi } from "@/api/notifications";
import { notificationKeys } from "@/api/keys";
import { useMe } from "@/hooks/useMe";

const GAP = 12;
/** The last app opened from Home (a per-person convenience: a thin ring, not a fill). */
const LAST_APP_KEY = "home.lastApp";
/**
 * One app on Home (owner, 2026-11-15: "make each one good, why does Pages have
 * colour and the others not"). Mobbin (Lloyds, Brainly, Swiggy): a tinted card
 * with a solid round badge in the app's own colour (src/theme/appColors.ts),
 * title and line in the page's ink (4.5:1, appColors.test.ts). No tile is
 * filled louder than the others; the last one used has a thin ring.
 */
function Tile({
  app,
  icon: Icon,
  title,
  body,
  onPress,
  testID,
  badge,
  width,
  index,
  lastUsed,
}: {
  app: HomeApp;
  icon: LucideIcon;
  title: string;
  body: string;
  onPress: () => void;
  testID: string;
  badge?: number;
  width: number;
  index: number;
  lastUsed: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const scheme = useScheme();
  const tint = tileColors(app, scheme);
  const [pressed, setPressed] = useState(false);
  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(260)} style={{ width }}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync().catch(() => undefined);
          onPress();
        }}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={badge ? `${title}, ${badge}` : title}
        accessibilityHint={body}
        style={{
          width,
          flexGrow: 0,
          minHeight: 124,
          padding: metrics.space.md,
          gap: metrics.space.sm,
          borderRadius: metrics.radius.lg,
          backgroundColor: tint.surface,
          borderWidth: lastUsed ? 2 : 1,
          borderColor: lastUsed ? tint.ring : `${tint.badge}33`,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        }}
        testID={testID}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View testID={`${testID}-badge`} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tint.badge, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {app === "assistant" ? (
              <Svg width={44} height={44} style={{ position: "absolute" }}>
                <Defs>
                  <LinearGradient id="assistant" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={ASSISTANT_GRADIENT[0]} />
                    <Stop offset="1" stopColor={ASSISTANT_GRADIENT[1]} />
                  </LinearGradient>
                </Defs>
                <Rect width={44} height={44} fill="url(#assistant)" />
              </Svg>
            ) : null}
            <Icon size={22} color={tint.glyph} />
          </View>
          {badge ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
              <Text variant="caption" style={{ color: "#ffffff", fontWeight: "700" }}>
                {String(badge)}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="label" style={{ fontSize: 17 }} numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {body}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function Home() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const user = useMe();
  const [profileOpen, setProfileOpen] = useState(false);
  const { data: unread } = useQuery({ queryKey: notificationKeys.unreadCount(), queryFn: notificationsApi.unreadCount });
  const first = user?.firstName?.trim();
  // 2 columns on a phone, 3 from 600 dp, 4 from 900 dp: equal tiles, never a
  // lonely full-width last one (owner, 2026-11-15).
  const { width: windowWidth } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(windowWidth - 2 * metrics.space.lg);
  const columns = gridWidth >= 900 ? 4 : gridWidth >= 600 ? 3 : 2;
  const tileWidth = Math.floor((gridWidth - GAP * (columns - 1)) / columns);
  const [lastApp, setLastApp] = useState<HomeApp | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(LAST_APP_KEY).then((v) => setLastApp(HOME_APPS.find((a) => a === v) ?? null)).catch(() => undefined);
  }, []);
  const rememberLastApp = (app: HomeApp) => {
    setLastApp(app);
    void AsyncStorage.setItem(LAST_APP_KEY, app).catch(() => undefined);
  };
  const tiles: { app: HomeApp; icon: LucideIcon; title: string; body: string; onPress: () => void; testID: string; badge?: number }[] = [
    { app: "pages", icon: FolderOpen, title: t("pages.title"), body: t("home.pagesBody"), onPress: () => router.push("/pages"), testID: "home-tile-pages" },
    { app: "notes", icon: NotebookPen, title: t("notes.title"), body: t("home.notesBody"), onPress: () => router.push("/notes"), testID: "home-tile-notes" },
    { app: "assistant", icon: Sparkles, title: t("chat.title"), body: t("home.aiBody"), onPress: () => router.push("/chat"), testID: "home-tile-ai" },
    { app: "chats", icon: Users, title: t("chat.chats"), body: t("home.chatsBody"), onPress: () => router.push("/chats"), testID: "home-tile-chats" },
    { app: "notifications", icon: Bell, title: t("chat.notifications"), body: t("home.notificationsBody"), onPress: () => router.push("/notifications"), testID: "home-tile-notifications", badge: unread || undefined },
    { app: "calendar", icon: CalendarDays, title: t("chat.calendar"), body: t("home.calendarBody"), onPress: () => router.push("/calendar"), testID: "home-tile-calendar" },
    { app: "contacts", icon: BookUser, title: t("contacts.title"), body: t("home.contactsBody"), onPress: () => router.push("/contacts"), testID: "home-tile-contacts" },
    { app: "safezone", icon: ShieldCheck, title: t("safezone.title"), body: t("home.safezoneBody"), onPress: () => router.push("/safezone"), testID: "home-tile-safezone" },
    { app: "conversations", icon: MessageSquareText, title: t("chat.conversations"), body: t("home.conversationsBody"), onPress: () => router.push({ pathname: "/chat", params: { sessions: "1" } }), testID: "home-tile-conversations" },
  ];

  return (
    <Screen measure>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Text variant="title" style={{ flex: 1 }} accessibilityRole="header" numberOfLines={1}>
          {t("home.title")}
        </Text>
        <AiButton />
        <Pressable
          onPress={() => setProfileOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("profileMenu.openLabel")}
          hitSlop={6}
          style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
          testID="home-open-profile"
        >
          <Avatar name={user?.fullName ?? user?.email ?? ""} uri={user?.avatar ?? null} userId={user?.id ?? 0} size={32} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.xl }} showsVerticalScrollIndicator={false}>
        <Text tone="muted">{first ? t("home.greetingName", { name: first }) : t("home.greeting")}</Text>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}
          onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        >
          {tiles.map((tile, i) => (
            <Tile
              key={tile.app}
              {...tile}
              index={i}
              width={tileWidth}
              lastUsed={lastApp === tile.app}
              onPress={() => {
                rememberLastApp(tile.app);
                tile.onPress();
              }}
            />
          ))}
        </View>
      </ScrollView>

      <ProfileSheet
        visible={profileOpen}
        userId={user?.id ?? null}
        onClose={() => setProfileOpen(false)}
        onSignOut={() => {
          setProfileOpen(false);
          void useAuthStore.getState().signOut().then(() => router.replace("/sign-in"));
        }}
      />
    </Screen>
  );
}
