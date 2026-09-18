/**
 * The composer for a thread with a person.
 *
 * ── WHY NOT `components/chat/Composer.tsx` ────────────────────────────────
 * That one is the assistant's, and it is the sibling session's file. It also
 * carries two things this screen must not offer: **dictation**, which belongs
 * to asking a question rather than to texting somebody, and **the attachment
 * `+`**, because the upload path is per AI SESSION
 * (`api/v1/ai/sessions/:id/documents`) and there is no endpoint that puts a
 * file into a human thread. A `+` here would be a button that cannot work.
 *
 * So this is the same pill shape (`IDENTITY.md` §4) reduced to what exists: a
 * field, an `✕` to clear a draft (Tolan), and send.
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
import { ArrowUp, X } from "lucide-react-native";
import { useColors, useMetrics } from "@/hooks/useColors";

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
  const lastTyping = useRef(0);

  useEffect(() => {
    if (!value || !onTyping) return;
    const now = Date.now();
    if (now - lastTyping.current < TYPING_THROTTLE_MS) return;
    lastTyping.current = now;
    onTyping();
  }, [value, onTyping]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
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
          value={value}
          onChangeText={onChange}
          placeholder={editing ? "Edit message" : "Message"}
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
          accessibilityLabel={editing ? "Edit message" : "Message"}
        />

        {/* Tolan's `✕` inside the field. Only when there is something to clear. */}
        {value.length > 0 ? (
          <Pressable
            onPress={() => onChange("")}
            accessibilityRole="button"
            accessibilityLabel="Clear"
            hitSlop={8}
          >
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={onSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send"
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
  );
}
