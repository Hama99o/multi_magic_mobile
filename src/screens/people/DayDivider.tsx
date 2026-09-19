/**
 * `Today` · `Yesterday` · `12 Sep` between days, and `UNREAD` on the boundary.
 *
 * Both are from X's thread (`../../../docs/design/people-chat/references/
 * x-thread-day-separator-new-divider.webp`) and corner's, which marks the
 * unread boundary with a ruled line reading `UNREAD MESSAGES`. Six of the eight
 * thread references separate days; two of them also mark the boundary, and it is
 * the one that does real work — it is where somebody's eye should land when
 * they open a thread with nine new messages in it.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

/** `Today`, `Yesterday`, or a short date. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(then, now)) return "Today";

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(then, yesterday)) return "Yesterday";

  // The year only when it is not this one — "12 Sep 2024" on a thread from last
  // year, "12 Sep" on one from March.
  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function DayDivider({ label }: { label: string }) {
  const metrics = useMetrics();
  return (
    <View style={{ alignItems: "center", paddingVertical: metrics.space.md }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/**
 * The unread boundary — a rule with a word in it, so it reads as a place in the
 * thread rather than as a message.
 *
 * It is drawn from the count the row carried BEFORE `mark_read` fired, which is
 * why the thread screen captures that in a ref: asking how many were unread
 * after marking them read gets zero, every time.
 */
export function UnreadDivider() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();

  return (
    <View
      testID="unread-divider"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.sm,
        paddingVertical: metrics.space.md,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: colors.accent, opacity: 0.4 }} />
      {/* The capitals are a STYLE, not the string. Written as a literal in
          English this was the one word on this screen a French reader saw in
          English, and `textTransform` also spares French an all-caps
          accented word, which several fonts render badly. */}
      <Text
        variant="caption"
        tone="accent"
        style={{ letterSpacing: 1, textTransform: "uppercase" }}
      >
        {t("thread.unread")}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.accent, opacity: 0.4 }} />
    </View>
  );
}
