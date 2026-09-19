/**
 * Read this answer aloud — the control under an assistant reply.
 *
 * ChatGPT's placement (per-answer actions under the reply, not floating), the
 * web player's behaviour (`useSpeech.ts`, 940b356), and one rule from the
 * composer's mic: the control is ABSENT when the phone cannot do it, never
 * present and broken.
 *
 * Two pieces, because the actions row is horizontal and a sentence is not:
 * `ReadAloudButtons` sits in the row; `ReadAloudNotice` sits under it. Both
 * render nothing while `READ_ALOUD_ENABLED` is false, so the flag flips in one
 * place and nothing else changes.
 *
 * Each row selects only the booleans it draws from, so a status tick on the
 * one answer speaking cannot re-render the whole transcript.
 */
import { ActivityIndicator, Pressable, View } from "react-native";
import { Pause, Play, RotateCcw, Square, Volume2 } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { READ_ALOUD_ENABLED } from "@/config/features";
import { useReadAloud, type ReadAloudMessage } from "@/stores/readAloud.store";

function readable(message: ReadAloudMessage & { deleted?: boolean }): boolean {
  return READ_ALOUD_ENABLED && !message.deleted && Boolean(message.body?.trim());
}

export function ReadAloudButtons({ message }: { message: ReadAloudMessage & { deleted?: boolean } }) {
  const colors = useColors();
  const metrics = useMetrics();
  const supported = useReadAloud((s) => s.supported);
  const speaking = useReadAloud((s) => s.speakingId === message.id);
  const loading = useReadAloud((s) => s.loadingId === message.id);
  // Only meaningful while THIS answer is speaking; selected as such so another
  // answer's pause does not redraw this row.
  const voice = useReadAloud((s) => (s.speakingId === message.id ? s.voice : null));
  const paused = useReadAloud((s) => s.speakingId === message.id && s.paused);
  const toggle = useReadAloud((s) => s.toggle);
  const pause = useReadAloud((s) => s.pause);
  const resume = useReadAloud((s) => s.resume);
  const restart = useReadAloud((s) => s.restart);

  if (!readable(message) || !supported) return null;

  const button = (
    key: string,
    label: string,
    onPress: () => void,
    child: React.ReactNode,
    disabled = false,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: key === "read" && loading }}
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      style={{ minHeight: 36, minWidth: 36, alignItems: "center", justifyContent: "center" }}
      testID={`answer-${key}`}
    >
      {child}
    </Pressable>
  );

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }} testID="answer-read-controls">
      {button(
        "read",
        speaking ? "Stop reading" : "Read aloud",
        () => void toggle(message),
        loading ? (
          // The FIRST play waits on synthesis; a replay is instant because the
          // server caches by message id. So this is honest, and absent on a
          // replay.
          <ActivityIndicator size="small" color={colors.accent} />
        ) : speaking ? (
          <Square size={15} color={colors.accent} fill={colors.accent} />
        ) : (
          <Volume2 size={17} color={colors.inkMuted} />
        ),
        loading,
      )}

      {/* Pause, resume and restart ONLY for the server voice: it is a file and
          they are exact. A device voice resumes from a word boundary, so
          offering them there is a control that repeats half a sentence. */}
      {speaking && voice === "server"
        ? [
            paused
              ? button("read-resume", "Resume reading", resume, <Play size={15} color={colors.inkMuted} />)
              : button("read-pause", "Pause reading", pause, <Pause size={15} color={colors.inkMuted} />),
            button("read-restart", "Start reading again", restart, <RotateCcw size={15} color={colors.inkMuted} />),
          ]
        : null}

      {/* SAY WHICH VOICE IS SPEAKING. He asked for a real voice; if he is
          getting the phone's instead, he should be told rather than left
          thinking the good one sounds like that. */}
      {speaking && voice === "device" ? (
        <Text variant="caption" tone="muted" style={{ fontStyle: "italic" }} testID="answer-read-device-voice">
          your phone&apos;s voice
        </Text>
      ) : null}
    </View>
  );
}

export function ReadAloudNotice({ message }: { message: ReadAloudMessage & { deleted?: boolean } }) {
  const supported = useReadAloud((s) => s.supported);
  const notice = useReadAloud((s) => (s.notice?.messageId === message.id ? s.notice.text : null));

  if (!readable(message) || !supported || !notice) return null;

  return (
    <Text variant="caption" tone="muted" testID="answer-read-notice">
      {notice}
    </Text>
  );
}
