/**
 * Long-press a message: six emoji in a pill, then the actions.
 *
 * ── SIX APPS, ONE SHAPE ───────────────────────────────────────────────────
 * WhatsApp, X, Discord, PlayStation, Believe and Retro all put a horizontal
 * emoji row above the message and an action menu beneath it. That is a
 * convention, not a decision — so we take it whole.
 *
 * ── WHAT WE REJECTED: THE `+` ─────────────────────────────────────────────
 * Three of the six offer a `+` to the full emoji keyboard. We do not. The
 * server takes any string (`reactions_controller.rb:12`), so the set is purely
 * a client choice and can widen later without touching the API — while a system
 * emoji keyboard inside a long-press sheet is a second interaction to get
 * right, and the whole justification for this screen is that people chat is
 * ~30% more work than the assistant, not double.
 *
 * ── AND THE TOGGLE IS THE PRESS ITSELF ────────────────────────────────────
 * `routes.rb:295`: "A reaction is a toggle: the same emoji twice takes it
 * back." So an emoji already reacted with is shown selected, and pressing it
 * removes it. There is no separate remove, and none of the six references
 * offers one either.
 *
 * Sheet invariants (Karwan's, and they hold here): Android hardware back
 * closes it, the scrim is tappable, and it respects the bottom safe-area inset.
 */
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, Pencil, Trash2 } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { REACTION_EMOJI } from "@/api/conversations";
import type { ChatMessage } from "@/api/ai";

export function ReactionSheet({
  message,
  onReact,
  onCopy,
  onEdit,
  onDelete,
  onClose,
}: {
  /** Null closes it — one piece of state in the screen, not two. */
  message: ChatMessage | null;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();

  if (!message) return null;

  /**
   * Edit and Delete are offered only on your own message, because that is what
   * the server will allow: `messages_controller.rb:54,67` authorise `update?`
   * and `destroy?` on the message, and `MessagePolicy` grants them to the
   * author. Offering a command that will be refused is the mistake the event
   * serializer's `current_user_permission` comment records Pages making.
   */
  const mine = message.sentByMe;

  const actions = [
    { key: "copy", label: "Copy", icon: Copy, tone: "default" as const, run: onCopy },
    ...(mine
      ? [
          { key: "edit", label: "Edit", icon: Pencil, tone: "default" as const, run: onEdit },
          // Last and red — X's ordering, and the one destructive row.
          { key: "delete", label: "Delete", icon: Trash2, tone: "danger" as const, run: onDelete },
        ]
      : []),
  ];

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Android's hardware back. A `<Modal>` there is its own native window, so
      // this is the only thing that closes it.
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{ flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" }}
      >
        {/* Stops a press inside the sheet from reaching the scrim behind it. */}
        <Pressable
          testID="reaction-sheet"
          onPress={() => {}}
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            paddingBottom: metrics.space.lg + insets.bottom,
            gap: metrics.space.md,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              backgroundColor: colors.surface,
              borderRadius: metrics.radius.pill,
              padding: metrics.space.sm,
            }}
          >
            {REACTION_EMOJI.map(({ emoji, id }) => {
              const mineAlready = message.reactions.some((r) => r.emoji === emoji && r.mine);
              return (
                <Pressable
                  key={id}
                  testID={`reaction-${id}`}
                  onPress={() => onReact(emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={mineAlready ? `Remove ${emoji}` : `React ${emoji}`}
                  accessibilityState={{ selected: mineAlready }}
                  style={{
                    width: metrics.touch,
                    height: metrics.touch,
                    borderRadius: metrics.radius.pill,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: mineAlready ? colors.accent : "transparent",
                  }}
                >
                  <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>

          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: metrics.radius.md,
              overflow: "hidden",
            }}
          >
            {actions.map((action, index) => (
              <Pressable
                key={action.key}
                testID={`message-action-${action.key}`}
                onPress={action.run}
                accessibilityRole="button"
                android_ripple={{ color: colors.border }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: metrics.space.md,
                  paddingHorizontal: metrics.space.lg,
                  minHeight: metrics.touch,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <action.icon
                  size={18}
                  color={action.tone === "danger" ? colors.danger : colors.ink}
                />
                <Text tone={action.tone === "danger" ? "danger" : "default"}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
