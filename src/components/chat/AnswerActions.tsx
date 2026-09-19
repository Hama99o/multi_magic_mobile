/**
 * What you can do with an answer: copy it, rate it, and take it back.
 *
 * ChatGPT's placement — under the reply, not floating.
 *
 * ── UNDO IS THE ONE THAT MATTERS, AND IT IS A SAFETY FEATURE ──────────────
 * The assistant does not only answer; it CREATES records in the user's real
 * notes, contacts and money. `Ai::Undo`'s own header gives the case: *"I sent
 * 10 to Anisa"* read as a loan leaves a debt on somebody's books that nobody
 * owes. So every turn that writes records how to reverse itself.
 *
 * **Only the most recent undoable reply is offered.** That is
 * `AI_ASSISTANT.md`'s decision and it is the UI's job, not the serializer's: a
 * stack of reversals is a second thing to learn, and the mistake somebody wants
 * gone is almost always the one they are looking at.
 *
 * A reply that has already been undone says so instead of offering again.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { feedbackApi, undoApi, type ChatMessage } from "@/api/ai";
import { apiErrorMessage } from "@/api/http";
import { ReadAloudButtons, ReadAloudNotice } from "./ReadAloud";

export function AnswerActions({
  message,
  showUndo,
  onUndone,
}: {
  message: ChatMessage;
  /** True only for the newest undoable reply — see the header. */
  showUndo: boolean;
  onUndone: (updated: ChatMessage) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<"positive" | "negative" | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    if (!message.body) return;
    await Clipboard.setStringAsync(message.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function rate(next: "positive" | "negative") {
    // Optimistic: a thumb is upserted server-side, so pressing again replaces
    // rather than duplicating, and a failed rating is not worth interrupting
    // somebody to report.
    setRating(next);
    try {
      await feedbackApi.rate(message.id, next);
    } catch {
      setRating(null);
    }
  }

  async function undo() {
    setUndoing(true);
    setError(null);
    try {
      const { message: updated } = await undoApi.undo(message.id);
      onUndone(updated);
    } catch (e) {
      setError(apiErrorMessage(e) ?? t("answer.undoFailed"));
    } finally {
      setUndoing(false);
    }
  }

  const iconButton = (
    key: string,
    label: string,
    Icon: typeof Copy,
    onPress: () => void,
    active = false,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={10}
      onPress={onPress}
      style={{ minHeight: 36, minWidth: 36, alignItems: "center", justifyContent: "center" }}
      testID={`answer-${key}`}
    >
      <Icon size={17} color={active ? colors.accent : colors.inkMuted} />
    </Pressable>
  );

  return (
    <View style={{ gap: metrics.space.xs }} testID="answer-actions">
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        {iconButton("copy", copied ? t("answer.copied") : t("answer.copy"), Copy, () => void copy())}
        {iconButton("up", t("answer.good"), ThumbsUp, () => void rate("positive"), rating === "positive")}
        {iconButton("down", t("answer.bad"), ThumbsDown, () => void rate("negative"), rating === "negative")}

        {/* Read aloud — behind READ_ALOUD_ENABLED; renders nothing until it
            flips. See ReadAloud.tsx. */}
        <ReadAloudButtons message={message} />

        {message.undoneAt ? (
          <Text variant="caption" tone="muted" testID="answer-undone">
            {t("answer.undone")}
          </Text>
        ) : showUndo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("answer.undoLabel")}
            accessibilityState={{ busy: undoing }}
            disabled={undoing}
            hitSlop={10}
            onPress={() => void undo()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: metrics.space.xs,
              minHeight: 36,
              paddingHorizontal: metrics.space.sm,
              borderRadius: metrics.radius.pill,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: undoing ? 0.5 : 1,
            }}
            testID="answer-undo"
          >
            <Undo2 size={15} color={colors.inkMuted} />
            <Text variant="caption" tone="muted">
              {undoing ? t("answer.undoing") : t("answer.undo")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {copied ? (
        <Text variant="caption" tone="muted" testID="answer-copied">
          {t("answer.copied")}
        </Text>
      ) : null}

      <ReadAloudNotice message={message} />

      {error ? (
        <Text variant="caption" tone="danger" testID="answer-undo-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
