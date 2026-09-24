/**
 * "WHAT WAS WRONG?" — asked once, right after a thumbs-down.
 *
 * multi_magic `357dd7a`: a reason sent with a thumbs-down reaches the model in
 * the rating turn (`rag_chat_job.rb`, "Why: …"), so "wrong Aisha" is
 * something the next answer can act on. Without it the phone's thumbs-down
 * was a bare signal.
 *
 * Rule Zero, Mobbin searched first (2026-09-24): Grok
 * (`mobbin.com/screens/89aa24a2-3f17-4384-aa2f-35bf8de5954d`), a small centred
 * dialog with one field and Cancel / Submit; WhatsApp's Meta AI
 * (`mobbin.com/screens/bb0de6d3-2358-4149-ae9e-29bbf8293f9b`) and Structured
 * (`mobbin.com/screens/eca4ec57-bf56-4fc1-860c-d5ec7599038a`), a sheet.
 * TAKE: ask OUTSIDE the thread, so nothing in the conversation moves as it
 * appears, and Grok's single free line. REJECT: preset reason chips; the
 * model reads free words better than a category, and the web asks one line.
 *
 * The thumb is ALREADY saved when this opens; Skip loses nothing. Asked only
 * in the moment: the server does not return a comment, so a reason cannot be
 * shown again, and editing one blind later would overwrite what nobody can see.
 */
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { Input } from "@/components/reusables/input";
import { useColors, useMetrics } from "@/hooks/useColors";

/** What the model is shown of it (`rag_chat_job.rb` truncates to 300). */
export const REASON_LIMIT = 300;

export function FeedbackReasonDialog({
  visible,
  busy,
  onSkip,
  onSend,
}: {
  visible: boolean;
  busy?: boolean;
  onSkip: () => void;
  onSend: (reason: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);

  if (!visible) return null;
  const trimmed = reason.trim();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onSkip}>
      {/* `padding` on both platforms, for RenameDialog's reason: a Modal is
          its own window and is not resized for the keyboard. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
            testID="feedback-reason"
          >
            <Text variant="title" accessibilityRole="header">
              {t("answer.whyTitle")}
            </Text>
            <Input
              label={t("answer.whyLabel")}
              placeholder={t("answer.whyPlaceholder")}
              value={reason}
              onChangeText={setReason}
              maxLength={REASON_LIMIT}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => trimmed && onSend(trimmed)}
              testID="feedback-reason-input"
            />
            <View style={{ gap: metrics.space.sm }}>
              <Button
                label={t("answer.whySend")}
                busy={busy}
                disabled={trimmed.length === 0}
                onPress={() => onSend(trimmed)}
                testID="feedback-reason-send"
              />
              <Pressable
                accessibilityRole="button"
                onPress={onSkip}
                disabled={busy}
                hitSlop={8}
                style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
                testID="feedback-reason-skip"
              >
                <Text tone="muted">{t("answer.whySkip")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
