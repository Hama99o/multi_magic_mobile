/**
 * Rename a conversation.
 *
 * The first question titles a session automatically (`Ai::Sessions.autotitle`),
 * so this exists for when that first question was a bad name for the thread —
 * not because sessions arrive untitled.
 *
 * The 60-character cap is the server's (`TITLE_LIMIT`) and is enforced HERE, so
 * a long title is trimmed by the field rather than rejected by a round trip.
 */
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { Input } from "@/components/reusables/input";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LIMITS } from "@/api/ai";
import { useTranslation } from "react-i18next";

export function RenameDialog({
  visible,
  initialTitle,
  busy,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initialTitle: string;
  busy?: boolean;
  onCancel: () => void;
  onSave: (title: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);

  // Reopening on a different row must not show the previous row's title.
  useEffect(() => {
    if (visible) setTitle(initialTitle);
  }, [visible, initialTitle]);

  if (!visible) return null;

  const trimmed = title.trim();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      {/* `padding` on BOTH platforms — see ScreenContainer's header. A Modal
          is its own window, so it is not resized under edge-to-edge either,
          and the measurement makes the padding 0 wherever the window IS
          resized. RenameDialog autofocuses, so on a short phone the field
          would be under the keyboard from the moment it opens. */}
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
          testID="rename-dialog"
        >
          <Text variant="title">{t("sessions.renameTitle")}</Text>

          <Input
            label={t("sessions.name")}
            value={title}
            onChangeText={setTitle}
            maxLength={LIMITS.titleLimit}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => trimmed && onSave(trimmed)}
            testID="rename-input"
          />
          {/* `maxLength` stops the typing silently; the count says why it
              stopped. 60 is the server's `TITLE_LIMIT`, so the number a person
              sees is the one that would otherwise have come back as a 422. */}
          <Text variant="caption" tone="muted" testID="rename-count">
            {title.length} / {LIMITS.titleLimit}
          </Text>

          <View style={{ gap: metrics.space.sm }}>
            <Button
              label={t("common.save")}
              busy={busy}
              disabled={trimmed.length === 0}
              onPress={() => onSave(trimmed)}
              testID="rename-save"
            />
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              disabled={busy}
              hitSlop={8}
              style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
              testID="rename-cancel"
            >
              <Text tone="muted">{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
