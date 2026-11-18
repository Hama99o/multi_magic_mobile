/**
 * THE TWO UNREAD COUNTS, FOR THE HEADER, THE SWITCHER AND HOME — one source,
 * so the three can never show different numbers (SPEC §F).
 *
 * Both read the keys that were already there: `useMarkNotificationRead`
 * lowers the bell optimistically on the same key, and the chat socket
 * invalidates the chats one. The timings are the web's: chats stale after
 * 30 s (`ChatLauncher.tsx`), notifications re-read every 5 minutes
 * (`NotificationBell.tsx`), and both again when the app comes back to the
 * front, since React Native has no window focus for React Query to see.
 *
 * `undefined` while unknown (loading, offline, an error): the badge is then
 * absent rather than a wrong "0".
 */
import { useEffect } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { conversationKeys, notificationKeys } from "@/api/keys";
import { conversationsApi } from "@/api/conversations";
import { notificationsApi } from "@/api/notifications";

export const CHATS_STALE_MS = 30_000;
export const NOTIFICATIONS_EVERY_MS = 5 * 60_000;

export function useShellBadges(): { chats: number | undefined; notifications: number | undefined } {
  const chats = useQuery({
    queryKey: conversationKeys.unreadCount(),
    queryFn: conversationsApi.unreadCount,
    staleTime: CHATS_STALE_MS,
  });
  const notifications = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: notificationsApi.unreadCount,
    refetchInterval: NOTIFICATIONS_EVERY_MS,
  });
  const { refetch: refetchChats } = chats;
  const { refetch: refetchNotifications } = notifications;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void refetchChats();
      void refetchNotifications();
    });
    return () => sub.remove();
  }, [refetchChats, refetchNotifications]);
  return { chats: chats.data?.unreadConversations, notifications: notifications.data };
}
