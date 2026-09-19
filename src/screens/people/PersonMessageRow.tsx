/**
 * One message from a PERSON — and it is bubbled on both sides, which is where
 * this screen deliberately parts company with the assistant's.
 *
 * ── WHY NOT `components/chat/MessageRow.tsx` ──────────────────────────────
 * `IDENTITY.md` §3 puts the assistant's reply outside a bubble, and gives the
 * reason: "these answers are paragraphs drawn from his own notes, loans and
 * contacts… a bubble caps a paragraph's comfortable width." **That reasoning
 * does not transfer.** A message from a person is a remark, not a document;
 * all eight thread references bubble both sides; and the serif that carries an
 * assistant answer exists to make a paragraph read as a document, which is the
 * wrong claim about "ok, see you at 6".
 *
 * ── AND THE TWO MUST NEVER BE MISTAKEN FOR EACH OTHER ─────────────────────
 * Hamma9900, 2026-09-18: *"the design did not mix like ai assistance and chat
 * should not have same style so people did not mix, we should see the
 * different."* So the divergence is not a by-product — it is a requirement,
 * and it is carried by **four** signals rather than one, because one can be
 * missed at a glance:
 *
 *   1. **Colour.** My message here is a SOLID `accent` bubble, the way every
 *      thread reference fills the sent side with the app's own colour (X blue,
 *      talabat orange, Instagram purple). The assistant screen's user bubble is
 *      the muted `userBubble` tint and stays that way. Same screen shape, two
 *      unmistakable colours.
 *   2. **Both sides bubbled.** The assistant's answer has no bubble at all, so
 *      a glance at the left-hand side already tells you which screen you are on.
 *   3. **Type.** People speak in the UI grotesque; the assistant answers in the
 *      SERIF (`variant="answer"`). Nothing in this folder may use that variant —
 *      authorship is legible by shape before a word is read (`IDENTITY.md` §2).
 *   4. **Avatars.** People have them, everywhere — rows, group senders, the
 *      thread header. The assistant has none, by rule (`IDENTITY.md` §7: "No
 *      avatar for the assistant"). Their presence IS the signal.
 *
 * `components/chat/MessageRow.tsx` stays the assistant's and is not touched.
 *
 * ── `sentByMe` DECIDES THE SIDE, AND THE SERVER ANSWERED IT ───────────────
 * `message_serializer.rb:25-27` derives it from the requesting user. The client
 * comparing ids would be a second implementation of a settled question — and
 * would disagree the first time an id arrived as a string.
 *
 * The catch, and it is why the thread reads messages off `MessageChannel`: the
 * copy broadcast on `ConversationChannel` is rendered with `user: nil`
 * (`messaging/broadcast.rb:28`), so `sent_by_me` is false for EVERYBODY there,
 * the sender included. See `docs/design/people-chat/SPEC.md` §0.2.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, CheckCheck, RefreshCw } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import type { ChatMessage } from "@/api/ai";

function timeOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function PersonMessageRow({
  message,
  /** Groups name the sender above a received bubble (talabat). Off for a direct
   *  chat, where the header already says who it is. */
  senderName,
  /** The tick goes under the LAST sent message only — never under every one. */
  isLastSent,
  onLongPress,
  onRetry,
  /** Posted locally and not yet accepted by the server. */
  pending = false,
  failed = false,
}: {
  message: ChatMessage;
  senderName?: string | null;
  isLastSent?: boolean;
  onLongPress?: () => void;
  onRetry?: () => void;
  pending?: boolean;
  failed?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const mine = message.sentByMe;

  /**
   * A deleted message KEEPS ITS PLACE. `messages_controller.rb:64-65`: "the
   * other side has already read it, and a hole in the thread reads as a bug."
   */
  if (message.deleted) {
    return (
      <View
        style={{
          width: "100%",
          alignItems: mine ? "flex-end" : "flex-start",
          paddingVertical: metrics.space.xs,
        }}
      >
        <Text variant="caption" tone="muted" style={{ fontStyle: "italic" }}>
          This message was deleted
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        // Explicit, so `maxWidth: "78%"` on the bubble below has a definite
        // parent width to resolve against rather than depending on the row
        // being stretched by its container. Defensive rather than a fix: the
        // layout measured correctly without it.
        width: "100%",
        alignItems: mine ? "flex-end" : "flex-start",
        paddingVertical: metrics.space.xs,
      }}
    >
      {senderName && !mine ? (
        <Text variant="caption" tone="muted" style={{ marginBottom: 2, marginLeft: metrics.space.sm }}>
          {senderName}
        </Text>
      ) : null}

      <Pressable
        // `mine`/`theirs` in the handle, so a flow can assert WHICH SIDE a
        // message landed on — the exact thing the ConversationChannel
        // `sent_by_me` trap would have got wrong, and the one bug no unit
        // test in this repo can catch.
        testID={`msg-${mine ? "mine" : "theirs"}-${message.id}`}
        onLongPress={onLongPress}
        // Long-press only: a tap on a message does nothing, and giving it a
        // press state would promise otherwise.
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={message.body ?? ""}
        accessibilityHint={onLongPress ? t("thread.reactHint") : undefined}
        // ── A STATIC STYLE OBJECT, NOT THE `({ pressed }) => …` FORM ────────
        // Measured on a device at 360 dp: with the function form the bubble's
        // `backgroundColor` never painted. The ground sampled `#F7F9F9` where
        // the fill should have been, while the TEXT colour — read from the same
        // `colors` object, one line below — applied correctly as pure white.
        // So the palette resolved; the function style did not reach the native
        // view. White text on a white ground is an invisible message, which is
        // the worst way for this to fail: nothing errors and the thread just
        // looks empty.
        //
        // Nothing is lost by dropping it. A tap on a message does nothing here
        // (long-press is the only gesture), so the pressed state was decoration
        // over an interaction that does not exist.
        style={{
          // Of the MEASURE, not of the screen: at 800 dp `ScreenContainer`
          // caps the column at METRICS.maxMeasure, so a line of chat cannot
          // run 700 dp wide. IDENTITY.md §8.
          maxWidth: "78%",
          // SOLID accent, not the assistant's muted `userBubble` tint — signal
          // 1 of the four in this file's header. The two screens must not be
          // mistakable for one another.
          backgroundColor: mine ? colors.accent : colors.surface,
          // The received side is outlined, which the assistant's page-flow
          // answer never is: at a glance, outlined-left means a person.
          borderWidth: mine ? 0 : 1,
          borderColor: colors.border,
          borderRadius: metrics.radius.lg,
          // The corner nearest its own side is squared off, which is what makes
          // a run of bubbles read as one side speaking.
          borderBottomRightRadius: mine ? metrics.radius.sm : metrics.radius.lg,
          borderBottomLeftRadius: mine ? metrics.radius.lg : metrics.radius.sm,
          paddingHorizontal: metrics.space.lg,
          paddingVertical: metrics.space.md,
          opacity: pending ? 0.6 : 1,
        }}
      >
        {/* Never `variant="answer"`. The serif belongs to the assistant, and
            it is signal 3 of the four — see this file's header. */}
        <Text selectable style={{ color: mine ? colors.onAccent : colors.ink }}>
          {message.body}
        </Text>
      </Pressable>

      {/* Counted chips UNDER the message (Believe), left-aligned to the bubble.
          `mine: true` tints the chip — and pressing it takes the reaction back,
          because the endpoint is a toggle and there is no separate remove. */}
      {message.reactions.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: metrics.space.xs,
            marginTop: metrics.space.xs,
          }}
        >
          {message.reactions.map((reaction) => (
            <View
              key={reaction.emoji}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: metrics.space.sm,
                paddingVertical: 2,
                borderRadius: metrics.radius.pill,
                backgroundColor: reaction.mine ? colors.accent : colors.surface,
                borderWidth: 1,
                borderColor: reaction.mine ? colors.accent : colors.border,
              }}
            >
              <Text style={{ fontSize: 13 }}>{reaction.emoji}</Text>
              <Text variant="caption" tone={reaction.mine ? "onAccent" : "muted"}>
                {reaction.count}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.xs,
          marginTop: 2,
          paddingHorizontal: metrics.space.xs,
        }}
      >
        <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
          {timeOf(message.createdAt)}
        </Text>

        {/* "a message that silently changes after somebody replied to it is
            worse than no editing at all" — `messages_controller.rb:50-52`. */}
        {message.editedAt ? (
          <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
            edited
          </Text>
        ) : null}

        {/* The tick is ALL-OR-NOTHING: `read_at` is nil unless every other
            member has read past it (`message_serializer.rb:29-39`). In a group
            of five that is a strong claim, which is why it is shown only under
            the last sent message rather than under each one. */}
        {mine && isLastSent && !pending && !failed ? (
          message.readAt ? (
            <CheckCheck size={14} color={colors.accent} />
          ) : (
            <Check size={14} color={colors.inkMuted} />
          )
        ) : null}
      </View>

      {/* A message that could not be sent STAYS ON SCREEN with a way back.
          `BRIEF.md` §5 — it "arrives, or says it did not", never vanishes into
          an optimistic bubble. */}
      {failed ? (
        <Pressable
          testID="msg-retry"
          onPress={onRetry}
          accessibilityRole="button"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: metrics.space.xs,
            marginTop: metrics.space.xs,
            minHeight: 32,
          }}
        >
          <RefreshCw size={13} color={colors.danger} />
          <Text variant="caption" tone="danger">
            Not sent. Tap to retry.
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
