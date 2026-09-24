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
import { useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy, ThumbsDown, ThumbsUp, Undo2 } from "@/components/icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { feedbackApi, undoApi, type ChatMessage, type Rating } from "@/api/ai";
import { apiErrorMessage } from "@/api/http";
import { ReadAloudButtons, ReadAloudNotice } from "./ReadAloud";
import { FeedbackReasonDialog } from "./FeedbackReasonDialog";

export function AnswerActions({
  message,
  showUndo,
  onUndone,
  onRated,
}: {
  message: ChatMessage;
  /** True only for the newest undoable reply — see the header. */
  showUndo: boolean;
  onUndone: (updated: ChatMessage) => void;
  /** The rating the server now holds, merged back into the transcript so the
   *  thumb is still lit after a scroll, a reload or a new session. */
  onRated?: (updated: ChatMessage) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  // STARTS FROM THE SERVER'S ANSWER, not from null. It used to be local state
  // starting at null, so a rating vanished on every remount and the owner,
  // pressing a thumb and coming back, saw nothing had happened (2026-09-24).
  const [rating, setRating] = useState<Rating | null>(message.rating ?? null);
  useEffect(() => setRating(message.rating ?? null), [message.rating]);
  const [undoing, setUndoing] = useState(false);
  // The optional "what was wrong?" after a thumbs-DOWN — see the dialog.
  const [asking, setAsking] = useState(false);
  const [sendingReason, setSendingReason] = useState(false);
  const [reasonSent, setReasonSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    if (!message.body) return;
    await Clipboard.setStringAsync(message.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /**
   * A TOGGLE, AND ONLY ONE THUMB AT A TIME — the owner's words: "when we
   * click it should work toggle style, you can't click both."
   *
   * Pressing the other thumb replaces (the server upserts on message + user).
   * Pressing the lit one clears it: a toggle that only goes one way turns a
   * mis-tap into a permanent rating. Optimistic, and on failure the thumb goes
   * back to what it WAS, not to null: with a rating that persists, snapping to
   * null would claim a change the server never made.
   */
  async function toggle(pressed: Rating) {
    const before = rating;
    const next = before === pressed ? null : pressed;
    void Haptics.selectionAsync();
    setRating(next);
    // Asked at once, in parallel with the save, never INSTEAD of it: the
    // thumb is recorded whether or not a reason follows.
    if (next === "negative") {
      setReasonSent(false);
      setAsking(true);
    }
    try {
      if (next) await feedbackApi.rate(message.id, next);
      else await feedbackApi.clear(message.id);
      onRated?.({ ...message, rating: next });
    } catch {
      setRating(before);
    }
  }

  async function sendReason(reason: string) {
    setSendingReason(true);
    try {
      await feedbackApi.rate(message.id, "negative", reason);
      setAsking(false);
      setReasonSent(true);
      setTimeout(() => setReasonSent(false), 2500);
    } catch {
      // Stays open with the words still in it, so a failed send loses
      // nothing and claims nothing. Skip is still there.
    } finally {
      setSendingReason(false);
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
        {iconButton("up", t("answer.good"), ThumbsUp, () => void toggle("positive"), rating === "positive")}
        {iconButton("down", t("answer.bad"), ThumbsDown, () => void toggle("negative"), rating === "negative")}

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
      {reasonSent ? (
        <Text variant="caption" tone="muted" testID="answer-reason-sent" accessibilityLiveRegion="polite">
          {t("answer.whySent")}
        </Text>
      ) : null}
      <FeedbackReasonDialog
        visible={asking}
        busy={sendingReason}
        onSkip={() => setAsking(false)}
        onSend={(reason) => void sendReason(reason)}
      />

      <ReadAloudNotice message={message} />

      {error ? (
        <Text variant="caption" tone="danger" testID="answer-undo-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
