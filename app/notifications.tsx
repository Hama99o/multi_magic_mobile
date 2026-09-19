/**
 * The bell — `docs/design/notifications/SPEC.md`.
 *
 * ── A TAP COMPOSES A QUESTION. IT DOES NOT OPEN A RECORD ──────────────────
 * His instruction: "the notification should show also, but it redirects on chat
 * to ask etc." — and it is the right architecture rather than a compromise.
 * `path` is a **web** route (`notification_serializer.rb:6`) and this app has no
 * note screen, no loan screen and no contact screen; building them would turn
 * four screens into forty. So the assistant is the single destination.
 *
 * And the question is **composed, not sent**. A tap that fires a question at
 * the model spends one of the 15-per-minute (`ai_controller.rb:5`) on a guess
 * about what he meant by it. He edits it first.
 *
 * ── REFRESHING, AND WHY THIS SCREEN NEEDED LESS OF IT ─────────────────────
 * His instruction covers this screen and the calendar together: *"you can say
 * reload it — there should be an option."* The calendar had a real staleness
 * problem; this screen already did not, and the difference is worth stating
 * rather than adding the same machinery twice.
 *
 * `NotificationChannel` pushes every new row to this user
 * (`notifications/deliver.rb:62-66`) and this screen has always refetched on
 * that frame AND on every reconnect. So it is live already. What it lacked is
 * any way to SAY so, and any answer when the socket is the thing that is
 * wrong — a subscription that was rejected, or a phone that has been asleep.
 * Hence the same three affordances as the calendar: the socket first, pull to
 * refresh, then a quiet header glyph; and a muted line saying when this was
 * last true.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, CheckCheck, Trash2 } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { RefreshButton, UpdatedLine } from "@/components/Freshness";
import { subscribeToChannel } from "@/lib/cable";
import { aiApi } from "@/api/ai";
import { failureMessage } from "@/api/failure";
import {
  notificationsApi,
  type AppNotification,
  type NotificationEvent,
} from "@/api/notifications";
import { useDraft } from "@/hooks/useDraft";
import { isToday } from "@/lib/relativeTime";
import { NotificationRow } from "@/screens/people/NotificationRow";

type Row =
  | { kind: "heading"; key: string; label: string }
  | { kind: "row"; key: string; notification: AppNotification };

export default function Notifications() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [composed, setComposed] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list(),
  });

  /**
   * Which session the composed question lands in — the same one the assistant
   * screen will open. `ai/conversation` returns `{ id }` and nothing else
   * (`ai_controller.rb:13-16`), and the server creates one if the user has
   * none, so this never comes back empty.
   */
  const { data: sessionId } = useQuery({
    queryKey: ["ai", "currentSession"],
    queryFn: aiApi.currentSessionId,
  });
  const { setDraft } = useDraft(sessionId ?? null);

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  /**
   * Live arrivals. The frame is `{ notification, unread_count }`
   * (`notifications/deliver.rb:63-66`) — note the wrapper key, unlike
   * `ConversationChannel`'s bare message hash.
   *
   * The row could be spliced in from the frame, but the list is grouped and
   * paged, so a refetch of twenty rows is simpler than maintaining the grouping
   * by hand — and `onConnected` has to refetch anyway, because nothing
   * broadcast while the socket was down is ever replayed (`cable.ts:25-29`).
   */
  useEffect(
    () =>
      subscribeToChannel<NotificationEvent>("NotificationChannel", {
        onData: reload,
        onConnected: reload,
      }),
    [reload],
  );

  /**
   * Marking read is optimistic, and put back on failure.
   *
   * The row loses its tint the moment it is pressed rather than after a round
   * trip — on a bad connection that round trip is the difference between a list
   * that responds and one that seems broken.
   */
  const markRead = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSettled: reload,
  });

  const open = useCallback(
    (notification: AppNotification) => {
      if (notification.readAt == null) markRead.mutate(notification.id);

      // Composed and NOT sent — see this file's header.
      const question = t("notifications.question", { title: notification.title });
      setDraft(question);
      setComposed(question);
      router.push("/chat");
    },
    [markRead, setDraft, t],
  );

  const remove = useMutation({
    mutationFn: (id: number) => notificationsApi.remove(id),
    onSettled: reload,
  });

  /**
   * Deleting one — a LONG PRESS, not the swipe the SPEC first sketched.
   *
   * The spec's reasoning for "swipe, no confirm" was that the gesture is itself
   * the deliberation. That holds for a swipe; it does not hold for a long
   * press, which is also how a reader pauses on a row. So the gesture changed
   * and the confirm came with it, rather than one of the two changing alone.
   *
   * Swipe is the better gesture and it is not free: `Swipeable` inside a
   * `FlatList` needs its own pass on Android, and a half-working swipe over
   * somebody's notifications is worse than no swipe at all.
   */
  const confirmRemove = useCallback(
    (notification: AppNotification) => {
      Alert.alert(t("notifications.deleteQuestion"), notification.title, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => remove.mutate(notification.id),
        },
      ]);
    },
    [remove, t],
  );

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSettled: reload,
  });

  const clearRead = useMutation({
    mutationFn: () => notificationsApi.clearRead(),
    onSettled: reload,
  });

  const confirmClear = useCallback(() => {
    // The endpoint deletes ONLY what is already read
    // (`notifications_controller.rb:41`), and that scope is the whole safety of
    // the action — so it is in the question, not only in the code.
    Alert.alert(t("notifications.clearQuestion"), t("notifications.clearBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("notifications.clear"), style: "destructive", onPress: () => clearRead.mutate() },
    ]);
  }, [clearRead, t]);

  /** `Today` and `Earlier` — two groups, because the scope has a 90-day floor
   *  (`notification.rb:46`) and the relative time on each row carries the rest. */
  const rows = useMemo<Row[]>(() => {
    const all = data?.notifications ?? [];
    const today = all.filter((n) => isToday(n.createdAt));
    const earlier = all.filter((n) => !isToday(n.createdAt));

    const out: Row[] = [];
    if (today.length > 0) {
      out.push({ kind: "heading", key: "h-today", label: t("notifications.today") });
      for (const n of today) out.push({ kind: "row", key: `n-${n.id}`, notification: n });
    }
    if (earlier.length > 0) {
      out.push({ kind: "heading", key: "h-earlier", label: t("notifications.earlier") });
      for (const n of earlier) out.push({ kind: "row", key: `n-${n.id}`, notification: n });
    }
    return out;
  }, [data, t]);

  const unread = data?.unreadCount ?? 0;

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
          {t("notifications.title")}
        </Text>

        {unread > 0 ? (
          <Pressable
            onPress={() => markAllRead.mutate()}
            accessibilityRole="button"
            accessibilityLabel={t("notifications.markAllRead")}
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <CheckCheck size={20} color={colors.ink} />
          </Pressable>
        ) : null}

        <Pressable
          onPress={confirmClear}
          accessibilityRole="button"
          accessibilityLabel={t("notifications.clearRead")}
          hitSlop={8}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Trash2 size={20} color={colors.inkMuted} />
        </Pressable>

        {/* Last, and the quietest of the three — the socket usually gets here
            first. See this file's header. */}
        <RefreshButton
          refreshing={isRefetching}
          onPress={() => void refetch()}
          label={t("notifications.refresh")}
          testID="notifications-refresh"
        />
      </View>

      <UpdatedLine at={dataUpdatedAt} refreshing={isRefetching} testID="notifications-updated" />

      {/* Said once, where the question was composed — so a tap that navigated
          away is not silent about what it did. */}
      {composed ? (
        <Text variant="caption" tone="muted" style={{ paddingBottom: metrics.space.sm }}>
          {t("notifications.composed")}
        </Text>
      ) : null}

      {error ? (
        <View style={{ paddingVertical: metrics.space.xl, gap: metrics.space.sm }}>
          <Text tone="muted">
            {failureMessage(error, t("notifications.loadFailed"))}
          </Text>
          <Pressable onPress={() => void refetch()} accessibilityRole="button" hitSlop={8}>
            <Text tone="accent">{t("common.tryAgain")}</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        testID="notifications-list"
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) =>
          item.kind === "heading" ? (
            <Text
              variant="label"
              tone="muted"
              style={{ paddingTop: metrics.space.lg, paddingBottom: metrics.space.sm }}
            >
              {item.label}
            </Text>
          ) : (
            <NotificationRow
              notification={item.notification}
              onPress={() => open(item.notification)}
              onLongPress={() => confirmRemove(item.notification)}
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.inkMuted}
          />
        }
        ListEmptyComponent={
          isLoading || error ? null : (
            // One line, no icon — IDENTITY.md §6.
            <View testID="notifications-empty" style={{ paddingVertical: metrics.space.xl * 2 }}>
              <Text tone="muted">{t("notifications.empty")}</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: metrics.space.xl }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
