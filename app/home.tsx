/**
 * HOME — the front page, the hub to every app (the owner, 2026-11-06: the
 * app opens on a home page like the web's, not on the assistant).
 *
 * The assistant is the "AI" button at the top (`AiButton`), opening over
 * this screen; the avatar opens the same profile sheet as before. Below, one
 * tile per app, Pages first because it is the one he uses daily.
 */
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { AiButton } from "@/components/AiButton";
import { ProfileSheet } from "@/components/settings/ProfileSheet";
import { Bell, BookUser, CalendarDays, FolderOpen, MessageSquareText, NotebookPen, Sparkles, Users, type LucideIcon } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useAuthStore } from "@/stores/auth.store";
import { Avatar } from "@/screens/people/Avatar";
import { notificationsApi } from "@/api/notifications";

function Tile({
  icon: Icon,
  title,
  body,
  onPress,
  testID,
  badge,
  primary,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  onPress: () => void;
  testID: string;
  badge?: number;
  primary?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${title}, ${badge}` : title}
      accessibilityHint={body}
      style={{
        flexBasis: "47%",
        flexGrow: 1,
        minHeight: 112,
        padding: metrics.space.lg,
        gap: metrics.space.sm,
        borderRadius: metrics.radius.lg,
        backgroundColor: primary ? colors.accent : colors.surface,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
      }}
      testID={testID}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Icon size={26} color={primary ? colors.onAccent : colors.accent} />
        {badge ? (
          <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
            <Text variant="caption" tone="onAccent">
              {String(badge)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="label" tone={primary ? "onAccent" : "default"} style={{ fontSize: 17 }}>
        {title}
      </Text>
      <Text variant="caption" tone={primary ? "onAccent" : "muted"} numberOfLines={2}>
        {body}
      </Text>
    </Pressable>
  );
}

export default function Home() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [profileOpen, setProfileOpen] = useState(false);
  const { data: unread } = useQuery({ queryKey: ["notifications", "unread"], queryFn: notificationsApi.unreadCount });
  const first = user?.firstName?.trim();

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
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.md }}>
          <Tile icon={FolderOpen} title={t("pages.title")} body={t("home.pagesBody")} onPress={() => router.push("/pages")} testID="home-tile-pages" primary />
          <Tile icon={NotebookPen} title={t("notes.title")} body={t("home.notesBody")} onPress={() => router.push("/notes")} testID="home-tile-notes" />
          <Tile icon={Sparkles} title={t("chat.title")} body={t("home.aiBody")} onPress={() => router.push("/chat")} testID="home-tile-ai" />
          <Tile icon={Users} title={t("chat.chats")} body={t("home.chatsBody")} onPress={() => router.push("/chats")} testID="home-tile-chats" />
          <Tile icon={Bell} title={t("chat.notifications")} body={t("home.notificationsBody")} onPress={() => router.push("/notifications")} testID="home-tile-notifications" badge={unread || undefined} />
          <Tile icon={CalendarDays} title={t("chat.calendar")} body={t("home.calendarBody")} onPress={() => router.push("/calendar")} testID="home-tile-calendar" />
          <Tile icon={BookUser} title={t("contacts.title")} body={t("home.contactsBody")} onPress={() => router.push("/contacts")} testID="home-tile-contacts" />
          <Tile icon={MessageSquareText} title={t("chat.conversations")} body={t("home.conversationsBody")} onPress={() => router.push({ pathname: "/chat", params: { sessions: "1" } })} testID="home-tile-conversations" />
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
