/**
 * The composer: ONE PILL that never changes mode.
 *
 * Alan's shape — `+`, the field, and the send arrow in a single rounded bar.
 * When dictation lands it happens INSIDE this pill (waveform, timer, `✕` to
 * cancel) rather than the screen becoming a recording screen, which is why the
 * layout leaves room for it rather than being rebuilt around it later.
 *
 * Tolan's `✕` inside the field clears a draft.
 *
 * ── What is deliberately not here yet ─────────────────────────────────────
 * The `+` (attachments) and the mic (dictation) are their own rows on the
 * board. They are rendered as DISABLED with an accessible label rather than
 * omitted, so the pill's proportions are the real ones now and the screen does
 * not visibly rearrange when they arrive. The mic specifically must be ABSENT
 * rather than disabled when a device has no recogniser — that is a decision for
 * the dictation row, and it is why this one does not pretend to own it.
 */
import { Pressable, TextInput, View } from "react-native";
import { ArrowUp, Plus, X } from "lucide-react-native";
import { useColors, useMetrics } from "@/hooks/useColors";

export function Composer({
  value,
  onChange,
  onSend,
  busy = false,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  /** A question is in flight; sending another would race it. */
  busy?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const canSend = value.trim().length > 0 && !busy;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: metrics.space.sm,
        backgroundColor: colors.surface,
        borderRadius: metrics.radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: metrics.space.sm,
        paddingVertical: metrics.space.xs,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attach a file (coming soon)"
        accessibilityState={{ disabled: true }}
        disabled
        hitSlop={8}
        style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: 0.4 }}
      >
        <Plus size={22} color={colors.inkMuted} />
      </Pressable>

      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Ask about your notes, money, contacts…"
        placeholderTextColor={colors.inkMuted}
        accessibilityLabel="Your question"
        multiline
        // Grows with the question, then scrolls. A dictated paragraph is long,
        // and a single-line field that hides its own start is unusable.
        style={{
          flex: 1,
          color: colors.ink,
          fontSize: 16,
          maxHeight: 140,
          paddingTop: metrics.space.md,
          paddingBottom: metrics.space.md,
        }}
        testID="composer-input"
      />

      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear"
          hitSlop={8}
          onPress={() => onChange("")}
          style={{ width: 32, height: 40, alignItems: "center", justifyContent: "center" }}
          testID="composer-clear"
        >
          <X size={18} color={colors.inkMuted} />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        hitSlop={8}
        onPress={onSend}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: canSend ? colors.accent : colors.border,
          opacity: canSend ? 1 : 0.6,
        }}
        testID="composer-send"
      >
        <ArrowUp size={20} color={canSend ? colors.onAccent : colors.inkMuted} />
      </Pressable>
    </View>
  );
}
