/**
 * The composer for a thread with a person.
 *
 * ── WHY NOT `components/chat/Composer.tsx` ────────────────────────────────
 * That one is the assistant's, and it is the sibling session's file. It still
 * carries one thing this screen must not offer: **the attachment `+`**,
 * because the upload path is per AI SESSION
 * (`api/v1/ai/sessions/:id/documents`) and there is no endpoint that puts a
 * file into a human thread. A `+` here would be a button that cannot work.
 *
 * ── DICTATION IS HERE NOW, AND IT USED NOT TO BE ─────────────────────────
 * This file argued that dictation "belongs to asking a question rather than to
 * texting somebody". He overruled that on 2026-09-21 — *"there should be
 * speech to text also"* — and he is right about his own product: talking is
 * how most people write a message on a phone, and the assistant having a mic
 * while a person does not reads as the human thread being the lesser screen.
 * The reasoning is left standing rather than deleted, because a decision that
 * was reversed is more useful than one that was quietly rewritten.
 *
 * The mic is the ASSISTANT'S mic — `useSpeechToText`, the same hook, the same
 * `mm-stt-lang` preference, the same strings. Two recognisers with two
 * language settings would be the drift the shared `ScrollToBottom` exists to
 * avoid.
 *
 * So this is the same pill shape (`IDENTITY.md` §4) reduced to what exists: a
 * field, an `✕` to clear a draft (Tolan), a mic, and send.
 *
 * ── TYPING RIDES THE SOCKET AND THE MESSAGE DOES NOT ──────────────────────
 * `performOnChannel` returns false when the subscription is not up
 * (`cable.ts:250-259`) and the caller must treat that as "it did not happen".
 * For `typing` that is fine — nobody notices a lost typing indicator. For a
 * message it is the worst failure a chat can have, which is why multi_magic
 * moved sending onto HTTP (`conversation_channel.rb:6-10`) and why `onSend`
 * below is an HTTP call.
 */
import { useEffect, useRef } from "react";
import { Pressable, TextInput, View } from "react-native";
import { ArrowUp, Mic, Square, X } from "@/components/icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LANGUAGES, useSpeechToText } from "@/hooks/useSpeechToText";
import { LengthCounter, isTooLong } from "@/components/chat/LengthCounter";
import { anticipateKeyboard } from "@/components/KeyboardLift";

/** Long enough that a pause between words does not re-announce. */
const TYPING_THROTTLE_MS = 3_000;

export function PersonComposer({
  value,
  onChange,
  onSend,
  onTyping,
  disabled = false,
  /** Set while an edit is in flight, so the field says what it will do. */
  editing = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onTyping?: () => void;
  disabled?: boolean;
  editing?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const lastTyping = useRef(0);

  const speech = useSpeechToText((final) => {
    // APPENDED, never replacing. Somebody who typed half a message and
    // dictated the rest must keep both halves.
    onChange(value ? `${value.trim()} ${final}` : final);
  });

  useEffect(() => {
    if (!value || !onTyping) return;
    const now = Date.now();
    if (now - lastTyping.current < TYPING_THROTTLE_MS) return;
    lastTyping.current = now;
    onTyping();
  }, [value, onTyping]);

  const canSend = value.trim().length > 0 && !disabled && !isTooLong(value);

  return (
    <View style={{ gap: metrics.space.xs }}>
      {/* Interim words while listening: proof it is hearing them, and NOT part
          of the committed text until the recogniser says they are final. */}
      {speech.listening ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: metrics.space.sm,
            paddingHorizontal: metrics.space.md,
          }}
          testID="people-composer-listening"
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {speech.interim || t("composer.listening")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("composer.cancelDictation")}
            hitSlop={16}
            onPress={speech.cancel}
            testID="people-composer-dictation-cancel"
          >
            <X size={16} color={colors.inkMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* A refusal degrades to the keyboard WITH a reason, rather than a mic
          that silently does nothing. */}
      {speech.refused ? (
        <Text
          variant="caption"
          tone="muted"
          style={{ paddingHorizontal: metrics.space.md }}
          testID="people-composer-mic-refused"
        >
          {t("composer.micRefused")}
        </Text>
      ) : null}

      {/* A recogniser that exists but cannot work right now says so in one
          line. Stopping silently reads as "the mic is broken". */}
      {speech.problem ? (
        <Text
          variant="caption"
          tone="muted"
          style={{ paddingHorizontal: metrics.space.md }}
          testID="people-composer-mic-problem"
        >
          {speech.problem}
        </Text>
      ) : null}

    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: metrics.space.sm,
        paddingVertical: metrics.space.sm,
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.sm,
          backgroundColor: colors.surface,
          borderRadius: metrics.radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: metrics.space.lg,
          minHeight: metrics.touch,
        }}
      >
        <TextInput
          testID="people-composer-input"
        onFocus={anticipateKeyboard}
          value={value}
          onChangeText={onChange}
          placeholder={editing ? t("thread.editMessage") : t("thread.message")}
          placeholderTextColor={colors.inkMuted}
          multiline
          // Five lines, then it scrolls — a pasted paragraph must not take the
          // whole screen and push the thread out of view.
          style={{
            flex: 1,
            color: colors.ink,
            fontSize: 16,
            paddingVertical: metrics.space.md,
            maxHeight: 120,
          }}
          accessibilityLabel={editing ? t("thread.editMessage") : t("thread.message")}
        />

        {/* Tolan's `✕` inside the field. Only when there is something to clear. */}
        {value.length > 0 ? (
          <Pressable
            onPress={() => onChange("")}
            accessibilityRole="button"
            accessibilityLabel={t("composer.clear")}
            hitSlop={8}
          >
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}

        {/* ABSENT, not disabled, when the device has no recogniser — the same
            rule as the assistant's. A control that cannot work is worse than
            no control. */}
        {speech.available ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              speech.listening
                ? t("composer.stopDictating")
                : t("composer.dictateIn", {
                    language: LANGUAGES.find((l) => l.code === speech.lang)?.label ?? speech.lang,
                  })
            }
            hitSlop={8}
            onPress={() => (speech.listening ? speech.stop() : void speech.start())}
            onLongPress={() => {
              // Long press switches language and remembers it — one preference
              // shared with the assistant, not a second one to keep in step.
              const next = LANGUAGES.find((l) => l.code !== speech.lang);
              if (next) speech.setLang(next.code);
            }}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
            testID="people-composer-mic"
          >
            {speech.listening ? (
              <Square size={18} color={colors.danger} fill={colors.danger} />
            ) : (
              <Mic size={22} color={colors.inkMuted} />
            )}
          </Pressable>
        ) : null}
      </View>

      <Pressable
        testID="people-composer-send"
        onPress={onSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel={t("composer.send")}
        accessibilityState={{ disabled: !canSend }}
        style={{
          width: metrics.touch,
          height: metrics.touch,
          borderRadius: metrics.radius.pill,
          backgroundColor: canSend ? colors.accent : colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ArrowUp size={20} color={canSend ? colors.onAccent : colors.inkMuted} />
      </Pressable>
    </View>
      <LengthCounter length={value.length} />
    </View>
  );
}
