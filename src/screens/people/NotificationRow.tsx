/**
 * One notification.
 *
 * ── NO CHEVRON, AND IT IS THE MOST IMPORTANT DECISION IN THIS FILE ────────
 * Character AI ends every row with `>`. Every convention in the world reads
 * that as "this opens the thing" — and ours does not. It opens the assistant
 * with a question composed and NOT sent, because `path` is a **web** route and
 * this app has no note, loan or contact screen to land on.
 *
 * So there is no trailing glyph. What explains the row is what happens when it
 * is pressed: the chat opens with the question visible and unsent, which is
 * self-explaining the first time and remembered after. A chevron would be a
 * small lie repeated on every row.
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
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";
import type { AppNotification } from "@/api/notifications";
import { Avatar } from "./Avatar";

export function NotificationRow({
  notification,
  onPress,
  onLongPress,
}: {
  notification: AppNotification;
  onPress: () => void;
  /** Deleting one. A long press rather than a swipe — see `app/notifications.tsx`. */
  onLongPress?: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const unread = notification.readAt == null;

  return (
    <Pressable
      testID={`notification-row-${notification.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={
        unread ? `Unread: ${notification.title}` : notification.title
      }
      accessibilityHint="Opens the assistant with a question about this"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: metrics.space.md,
        paddingHorizontal: metrics.space.md,
        paddingVertical: metrics.space.md,
        minHeight: metrics.touch,
        borderRadius: metrics.radius.md,
        backgroundColor: unread ? colors.surface : "transparent",
        opacity: pressed ? 0.6 : 1,
      })}
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
          <Text variant="caption" tone="muted" numberOfLines={1}>
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
  );
}
