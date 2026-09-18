/**
 * One message.
 *
 * ── THE DECISION THE REFERENCES DISAGREED ON ──────────────────────────────
 * **The user's words go in a bubble. The assistant's answer does not.**
 * Claude's shape over ChatGPT's and Tolan's, and the reason is what these
 * answers are: paragraphs drawn from somebody's own notes, loans and contacts.
 * A bubble caps a paragraph's comfortable width and makes an answer about
 * somebody's money look like a remark.
 *
 * The answer is also set in a SERIF (`variant="answer"`), which is the same
 * argument carried into type: a serif is what makes a paragraph read as a
 * document rather than a text message, and it means authorship is legible by
 * shape before anybody reads a word.
 *
 * `sentByMe` decides the side, and it comes FROM THE SERVER — the serializer
 * derives it from the requesting user. Re-deriving it here from user ids would
 * be a second implementation of a question already answered, and the two would
 * disagree the first time an id arrived as a string.
 */
import { View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import type { ChatMessage, MessageLink } from "@/api/ai";
import { SourceChips } from "./SourceChips";
import { AnswerActions } from "./AnswerActions";

export function MessageRow({
  message,
  onOpenSource,
  showUndo = false,
  onUndone,
}: {
  message: ChatMessage;
  onOpenSource: (source: MessageLink) => void;
  /** True only for the NEWEST undoable reply — see AnswerActions. */
  showUndo?: boolean;
  onUndone?: (updated: ChatMessage) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();

  if (message.deleted) {
    return (
      <View style={{ paddingVertical: metrics.space.sm }}>
        <Text variant="caption" tone="muted">
          This message was deleted.
        </Text>
      </View>
    );
  }

  // The assistant, and anyone else's words in a people thread.
  const mine = message.role === "user" && message.sentByMe;

  if (mine) {
    return (
      <View style={{ alignItems: "flex-end", paddingVertical: metrics.space.sm }}>
        <View
          style={{
            // Capped so a long question still reads as a question and leaves
            // the answer its full measure.
            maxWidth: "85%",
            backgroundColor: colors.userBubble,
            borderRadius: metrics.radius.lg,
            paddingHorizontal: metrics.space.lg,
            paddingVertical: metrics.space.md,
          }}
        >
          <Text selectable style={{ color: colors.userBubbleInk }}>
            {message.body}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ paddingVertical: metrics.space.md, gap: metrics.space.xs }}>
      {/* Selectable: an answer about somebody's money is something they will
          want to copy out, and no width cap inherited from a bubble. */}
      <Text variant="answer" selectable testID="assistant-answer">
        {message.body}
      </Text>

      {/* TWO ROWS, NEVER ONE. `sources` are the records the answer was drawn
          FROM; `links` are the records it CREATED. `AI_ASSISTANT.md` §5b:
          mixing them made "What is Husna's birthday?" cite a taxi fare, and a
          confirmation is not an answer from data. A reply that created
          something cites nothing, and shows what it made instead. */}
      <SourceChips sources={message.sources} label="From" onOpen={onOpenSource} />
      <SourceChips sources={message.links} label="Created" onOpen={onOpenSource} />

      <AnswerActions
        message={message}
        showUndo={showUndo}
        onUndone={(updated) => onUndone?.(updated)}
      />
    </View>
  );
}
