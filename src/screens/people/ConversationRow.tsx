/**
 * One row of the chat list.
 *
 * ── THE UNREAD SIGNAL IS A NUMBER, AND IT IS SAID TWICE ───────────────────
 * WhatsApp and LINE both badge a **count** to the right of the preview line;
 * XChat shows a bare dot. We take the count, because the count is on the wire
 * already — `conversation_serializer.rb:66`, batched by the controller at
 * `conversations_controller.rb:122` so it costs one query for the whole page.
 * A dot would be throwing away something the server paid for.
 *
 * And WhatsApp's **second** signal comes with it: the timestamp turns `accent`
 * when the row is unread. It costs one conditional and it is the part that
 * reads at arm's length, without focusing on a 20 dp badge.
 *
 * ── THE NAME IS `user.fullname`, NEVER `title` ────────────────────────────
 * A direct conversation's `title` is NULL (`conversation.rb:90` never sets
 * one). The serializer answers this for us: its `user` field is the other
 * person for a direct chat and the group's own title for a group, "so a list
 * row and a header can be drawn the same way whichever it is"
 * (`conversation_serializer.rb:28-37`). `src/api/conversations.ts` collapses
 * both into `displayName`, so this file has no branch on `is_group` at all.
 */
import { Pressable, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";
import type { Conversation } from "@/api/conversations";
import { Avatar } from "./Avatar";

/**
 * What the row shows under the name.
 *
 * A deleted last message keeps its place in the thread (`body` is null and
 * `deleted` is true), and the list has to say the same thing the thread does
 * rather than rendering an empty line.
 */
function previewOf(conversation: Conversation): string {
  const last = conversation.lastMessage;
  if (!last) return "No messages yet";
  if (last.deleted) return "Message deleted";

  const body = (last.body ?? "").replace(/\s+/g, " ").trim();
  if (!body) return "No messages yet";
  // "You: " on your own last message, as every reference does — it is the
  // difference between "they replied" and "you are waiting".
  return last.sentByMe ? `You: ${body}` : body;
}

export function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const unread = conversation.unreadMessages > 0;

  return (
    <Pressable
      testID={`chat-row-${conversation.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        unread
          ? `${conversation.displayName}, ${conversation.unreadMessages} unread`
          : conversation.displayName
      }
      android_ripple={{ color: colors.border }}
      style={{
        flexDirection: "row",
        gap: metrics.space.md,
        paddingVertical: metrics.space.md,
        // The touch target floor applies to a whole row too, not only to icons.
        minHeight: metrics.touch,
        alignItems: "center",
      }}
    >
      <Avatar
        name={conversation.displayName}
        uri={conversation.avatar}
        userId={conversation.id}
        isOnline={conversation.isOnline}
      />

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
          <Text variant="label" numberOfLines={1} style={{ flex: 1, fontSize: 16 }}>
            {conversation.displayName}
          </Text>
          <Text variant="caption" tone={unread ? "accent" : "muted"}>
            {relativeTime(conversation.lastMessage?.createdAt ?? conversation.updatedAt)}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
          <Text variant="caption" tone="muted" numberOfLines={2} style={{ flex: 1 }}>
            {previewOf(conversation)}
          </Text>

          {unread ? (
            <View
              testID={`chat-unread-${conversation.id}`}
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                paddingHorizontal: 6,
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Past 99 the exact number stops being information and the badge
                  starts stretching the row. */}
              <Text variant="caption" tone="onAccent" style={{ fontSize: 11, fontWeight: "700" }}>
                {conversation.unreadMessages > 99 ? "99+" : conversation.unreadMessages}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
