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
 * ── The mic is ABSENT, not disabled, when the device cannot dictate ───────
 * A disabled mic invites a tap that can never work and gives no reason. On a
 * cheap Android with no recogniser installed that is a real state, not a
 * hypothetical — so `available: false` renders nothing at all. A REFUSED
 * permission is different: the user can fix that, so it degrades to the
 * keyboard with one line of explanation (Speak's "I can't speak now").
 *
 * The `+` opens the attachment sheet when `onAttach` is given, and is disabled
 * with a label when it is not — a screen without a session id yet has nothing
 * to attach a file TO.
 *
 * ── Offline is SAID, and send is off ──────────────────────────────────────
 * `offline` comes from the reachability store: MultiMagic did not answer the
 * last request and has not answered a probe since. Sending would only produce
 * the same failure; the draft is kept and the pill says why in one line. The
 * field stays editable — being unable to reach the server is no reason to stop
 * somebody writing their question.
 */
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ArrowUp, Mic, Plus, Square, X } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LANGUAGES, useSpeechToText } from "@/hooks/useSpeechToText";

export function Composer({
  value,
  onChange,
  onSend,
  busy = false,
  offline = false,
  onAttach,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  /** A question is in flight; sending another would race it. */
  busy?: boolean;
  /** MultiMagic is not answering. Send is off and the pill says so. */
  offline?: boolean;
  /** Opens the attachment sheet. Absent means attachments are not available. */
  onAttach?: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();

  const speech = useSpeechToText((final) => {
    // APPENDED, never replacing. Someone who typed half a question and dictated
    // the rest must keep both halves.
    onChange(value ? `${value.trim()} ${final}` : final);
  });

  const canSend = value.trim().length > 0 && !busy && !offline;
  // A file cannot be uploaded to a server that is not answering either.
  const canAttach = Boolean(onAttach) && !offline;

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
          testID="composer-listening"
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {speech.interim || t("composer.listening")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("composer.cancelDictation")}
            hitSlop={8}
            onPress={speech.cancel}
            testID="composer-dictation-cancel"
          >
            <X size={16} color={colors.inkMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* Speak's fallback: a refusal degrades to the keyboard WITH a reason,
          rather than a mic that silently does nothing. */}
      {speech.refused ? (
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: metrics.space.md }} testID="composer-mic-refused">
          {t("composer.micRefused")}
        </Text>
      ) : null}

      {/* A recogniser that exists but cannot work right now — no connection
          for a server-based engine, a microphone another app holds — says so
          in one line. Stopping silently reads as "the mic is broken", and
          the person taps it again. */}
      {speech.problem ? (
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: metrics.space.md }} testID="composer-mic-problem">
          {speech.problem}
        </Text>
      ) : null}

      {/* Not a failure — a state. The question is kept, and the line says what
          will happen next rather than what went wrong. */}
      {offline ? (
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: metrics.space.md }} testID="composer-offline">
          {t("composer.offline")}
        </Text>
      ) : null}

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
        accessibilityLabel={t("composer.attach")}
        accessibilityState={{ disabled: !canAttach }}
        disabled={!canAttach}
        hitSlop={8}
        onPress={onAttach}
        style={{
          width: 40,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          opacity: canAttach ? 1 : 0.4,
        }}
        testID="composer-attach"
      >
        <Plus size={22} color={colors.inkMuted} />
      </Pressable>

      <TextInput
        value={value}
        onChangeText={onChange}
        // Short enough to stay on ONE line at 360 dp: the long version
        // wrapped, which made the pill taller and left the + floating against
        // two lines of grey text.
        placeholder={t("composer.placeholder")}
        placeholderTextColor={colors.inkMuted}
        accessibilityLabel={t("composer.yourQuestion")}
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
          accessibilityLabel={t("composer.clear")}
          hitSlop={8}
          onPress={() => onChange("")}
          style={{ width: 32, height: 40, alignItems: "center", justifyContent: "center" }}
          testID="composer-clear"
        >
          <X size={18} color={colors.inkMuted} />
        </Pressable>
      ) : null}

      {/* ABSENT, not disabled, when the device has no recogniser. */}
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
            // Long press switches language and remembers it — the web keeps the
            // same preference in localStorage.
            const next = LANGUAGES.find((l) => l.code !== speech.lang);
            if (next) speech.setLang(next.code);
          }}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          testID="composer-mic"
        >
          {speech.listening ? (
            <Square size={18} color={colors.danger} fill={colors.danger} />
          ) : (
            <Mic size={22} color={colors.inkMuted} />
          )}
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("composer.send")}
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
    </View>
  );
}
