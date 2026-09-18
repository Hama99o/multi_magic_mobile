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

export const SAFE_SENTENCE = "Your notes, contacts, loans and money are not touched.";

export function deleteQuestion(fileCount: number): string {
  if (fileCount === 1) return "Delete this conversation and the 1 file in it?";
  if (fileCount > 1) return `Delete this conversation and the ${fileCount} files in it?`;
  return "Delete this conversation?";
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
          testID="delete-confirm"
        >
          <Text variant="title" testID="delete-confirm-question">
            {deleteQuestion(fileCount)}
          </Text>

          {/* The guarantee. Present whether or not there are files. */}
          <Text tone="muted" testID="delete-confirm-safe">
            {SAFE_SENTENCE}
          </Text>

          <View style={{ gap: metrics.space.sm }}>
            <Button
              label="Delete conversation"
              tone="danger"
              busy={busy}
              onPress={onConfirm}
              testID="delete-confirm-yes"
            />
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              disabled={busy}
              hitSlop={8}
              style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
              testID="delete-confirm-cancel"
            >
              <Text tone="muted">Keep it</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
