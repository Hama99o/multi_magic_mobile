/**
 * One conversation in the list.
 *
 * Speak's row: the counts the serializer already carries — `message_count` and
 * `document_count`. The file count is not decoration: it is what makes the
 * delete copy honest, because the confirm has to name a number.
 *
 * Cleo's relative time ABOVE the title, because the list is ordered by
 * `updated_at` and that is the field explaining the order.
 *
 * The coloured dot is the icon's own vocabulary, keyed on the session id rather
 * than its position — a dot must not change colour when a session floats to the
 * top, which it does on every reply.
 */
import { Pressable, View } from "react-native";
import { MoreVertical } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { categoryColorFor } from "@/theme/tokens";
import { relativeTime } from "@/lib/relativeTime";
import type { AiSession } from "@/api/ai";

export function SessionRow({
  session,
  active,
  onOpen,
  onMenu,
}: {
  session: AiSession;
  active: boolean;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();

  const counts = [
    `${session.messageCount} ${session.messageCount === 1 ? "message" : "messages"}`,
    // Only mentioned when there are any — same reasoning as the delete copy.
    session.documentCount > 0
      ? `${session.documentCount} ${session.documentCount === 1 ? "file" : "files"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${session.title}, ${counts}`}
        onPress={onOpen}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.md,
          minHeight: metrics.touch + 8,
          paddingHorizontal: metrics.space.sm,
          borderRadius: metrics.radius.md,
          backgroundColor: active ? colors.surface : "transparent",
        }}
        testID={`session-row-${session.id}`}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: categoryColorFor(session.id),
          }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="muted">
            {relativeTime(session.updatedAt)}
          </Text>
          <Text numberOfLines={1}>{session.title}</Text>
          <Text variant="caption" tone="muted">
            {counts}
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Options for ${session.title}`}
        hitSlop={8}
        onPress={onMenu}
        style={{
          width: metrics.touch,
          height: metrics.touch,
          alignItems: "center",
          justifyContent: "center",
        }}
        testID={`session-menu-${session.id}`}
      >
        <MoreVertical size={20} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}
