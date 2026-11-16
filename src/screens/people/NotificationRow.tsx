/**
 * One notification.
 *
 * ── NO CHEVRON ─────────────────────────────────────────────────────────────
 * A tap opens the screen the notification is about, or, for a kind this app
 * has no screen for, the assistant with a question composed. Both ways the
 * row explains itself the first time; a chevron would promise one of them.
 *
 * ── MARK READ AND DELETE ON THE ROW, AS ON THE WEB ────────────────────────
 * The web's bell has a check (unread only) and a bin on every row
 * (`NotificationBell.tsx`). Here they sit at the end of the row; delete still
 * asks first (the screen's `confirmRemove`), and the long press stays.
 *
 * ── UNREAD IS SAID TWICE: A DOT AND A TINT ────────────────────────────────
 * Linktree uses a dot alone, Mesh a tint alone, happn both. Both — the dot is
 * 8 dp and the tint is the whole row, and `surface` over `ground` is already a
 * one-step difference in this palette (`#1b333a` on `#102125`), so it costs no
 * new colour.
 *
 * Typography-only rows, after Amazon Alexa: no per-row icon, no avatar unless
 * there is an actor. It is the most legible of the five references and the
 * cheapest to build.
 */
import { Pressable, View } from "react-native";
import { Check, Trash2 } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";
import type { AppNotification } from "@/api/notifications";
import { Avatar } from "./Avatar";
import { useTranslation } from "react-i18next";

export function NotificationRow({
  notification,
  onPress,
  onLongPress,
  onMarkRead,
  onDelete,
}: {
  notification: AppNotification;
  onPress: () => void;
  /** Deleting one. A long press rather than a swipe — see `app/notifications.tsx`. */
  onLongPress?: () => void;
  /** The row's own check, shown while it is unread. */
  onMarkRead?: () => void;
  /** The row's own bin. */
  onDelete?: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const unread = notification.readAt == null;

  return (
    // The row's own actions are SIBLINGS of the pressable body, never inside
    // it: a named container hides the controls in it from a screen reader
    // (docs/ACCESSIBILITY.md N1, `a11y.test.tsx`).
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        borderRadius: metrics.radius.md,
        backgroundColor: unread ? colors.surface : "transparent",
      }}
    >
      <Pressable
        testID={`notification-row-${notification.id}`}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={
          unread ? t("notifications.unread", { title: notification.title }) : notification.title
        }
        // BOTH actions, because the long press DELETES. This hint used to name
        // only the tap, so the safe action was announced and the destructive one
        // was not — a person was told this control does something other than the
        // thing holding it would do. Wrong under every convention
        // `docs/DICTATION_LANGUAGE.md` §4 draws, which is why it is fixed here
        // rather than waiting on that decision.
        accessibilityHint={t("notifications.hint")}
        android_ripple={{ color: colors.border }}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: metrics.space.md,
          paddingLeft: metrics.space.md,
          paddingVertical: metrics.space.md,
          minHeight: metrics.touch,
          borderRadius: metrics.radius.md,
        }}
      >
        {/* Nil when the app itself caused it — a reminder falling due has no
            actor (`notification_serializer.rb:16-17`), and an avatar invented for
            one would claim a person was involved. */}
        {notification.actor ? (
          <Avatar
            name={notification.actor.name}
            uri={notification.actor.avatar}
            userId={notification.actor.id}
            size={32}
          />
        ) : null}

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={2}>
            {notification.title}
          </Text>
          {notification.body ? (
            // ONE line, except the morning brief: several short lines, each of
            // which is the point (multi_magic 55ca44c, which made the web's bell
            // show it in full). Here a tap composes a question rather than
            // opening the notification, so a brief cut to one line had no
            // other place on the phone where the rest could be read.
            <Text
              variant="caption"
              tone="muted"
              numberOfLines={notification.kind === "ai.morning_brief" ? undefined : 1}
            >
              {notification.body}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
            {relativeTime(notification.createdAt)}
          </Text>
        </View>

        {unread ? (
          <View
            testID={`notification-unread-${notification.id}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.accent,
              marginTop: 6,
            }}
          />
        ) : null}
      </Pressable>
      <View style={{ alignItems: "center", paddingVertical: metrics.space.sm, paddingHorizontal: metrics.space.xs }}>
        {unread && onMarkRead ? (
          <Pressable
            testID={`notification-mark-read-${notification.id}`}
            onPress={onMarkRead}
            accessibilityRole="button"
            accessibilityLabel={t("notifications.markRead")}
            hitSlop={6}
            style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
          >
            <Check size={16} color={colors.inkMuted} />
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable
            testID={`notification-delete-${notification.id}`}
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={t("notifications.delete")}
            hitSlop={6}
            style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
          >
            <Trash2 size={16} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
