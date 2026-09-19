/**
 * THE CONFIRM WHOSE JOB IS TO NAME WHAT IS *NOT* DESTROYED.
 *
 * His requirement, in his words: *"deleting session did not delete data of apps
 * like loan, contact etc."* — and the guarantee holds in code by scoping, which
 * is the kind that cannot drift. `Ai::Sessions.destroy` deletes
 * `AiChunk.where(conversation_id: …)`, and a chunk made from a Note, Loan or
 * Contact carries no `conversation_id` at all: the column is nullable while
 * `source_type`/`source_id` are `NOT NULL`. The scope cannot reach them.
 *
 * LINE ships this exact shape — *"Hiding chats doesn't delete their messages"* —
 * a dialog that exists to state what survives.
 *
 * ── Two strings, and the reason is not pedantry ───────────────────────────
 * "and the 0 files in it" is the kind of sentence that tells a user nobody
 * looked, and a person who notices that stops trusting the sentence underneath
 * it — which is the one that matters. So the file clause appears only when
 * there are files.
 *
 * The guarantee sentence is in BOTH, because the moment of deleting is exactly
 * when somebody wants to read it.
 */
import { Modal, Pressable, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useTranslation } from "react-i18next";
import { t as translate } from "@/i18n";

/**
 * The guarantee, as a function of the current language.
 *
 * It was a `const`, and a const is evaluated once at import — before the
 * stored language has been read, and never again after a switch. The tests
 * compare against this same call, so the sentence and its assertion cannot
 * drift apart.
 */
export function safeSentence(): string {
  return translate("deleteConversation.safe");
}

export function deleteQuestion(fileCount: number): string {
  if (fileCount > 0) {
    return translate("deleteConversation.questionWithFiles", { count: fileCount });
  }
  return translate("deleteConversation.question");
}

export function DeleteConfirm({
  visible,
  fileCount,
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  fileCount: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          alignItems: "center",
          justifyContent: "center",
          padding: metrics.space.lg,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 420,
            backgroundColor: colors.ground,
            borderRadius: metrics.radius.lg,
            padding: metrics.space.xl,
            gap: metrics.space.lg,
          }}
          // `delete-conversation-*`, never a bare `delete-confirm`: the account
          // screen has a delete too, and the two must not share a handle any
          // more than they may share a look (2026-09-19).
          testID="delete-conversation-confirm"
        >
          <Text variant="title" testID="delete-conversation-question">
            {deleteQuestion(fileCount)}
          </Text>

          {/* The guarantee. Present whether or not there are files. */}
          <Text tone="muted" testID="delete-conversation-safe">
            {t("deleteConversation.safe")}
          </Text>

          <View style={{ gap: metrics.space.sm }}>
            <Button
              label={t("deleteConversation.confirm")}
              tone="danger"
              busy={busy}
              onPress={onConfirm}
              testID="delete-conversation-yes"
            />
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              disabled={busy}
              hitSlop={8}
              style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
              testID="delete-conversation-cancel"
            >
              <Text tone="muted">{t("deleteConversation.keep")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
