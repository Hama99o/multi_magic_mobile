/**
 * What this can do WITH THEIR OWN DATA — and the suggestions are DERIVED, never
 * written down.
 *
 * His instruction: *"the three prompts which show for first conversation should
 * be linked to its data — it is important, it should not be a random thing."*
 *
 * Three invented sentences read as though they satisfy the spec's "example
 * questions drawn from the apps that exist". They do not: this app's whole
 * claim is that it answers from his own data, so three questions with nothing
 * behind them are that claim with nothing behind it — and one naming an app he
 * has never used produces "I could not find anything" to a question the app
 * itself suggested.
 *
 * **When nothing can be derived, there are no suggestions at all** — one plain
 * line and an empty composer. That is honest; three guesses are not.
 *
 * No mascot, no illustration, no "How can I help you today?". The suggestions
 * are tappable, because the fastest way to learn what a thing answers is to
 * watch it answer.
 */
import { Pressable, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useTranslation } from "react-i18next";

export function EmptyState({
  onPick,
  prompts = [],
}: {
  onPick: (question: string) => void;
  /** Derived. Empty is a legitimate state, not a missing one. */
  prompts?: { text: string }[];
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();

  return (
    <View style={{ gap: metrics.space.lg, paddingVertical: metrics.space.xl }} testID="chat-empty">
      <Text tone="muted">{t("chat.emptyTitle")}</Text>

      <View style={{ gap: metrics.space.sm }}>
        {prompts.map((prompt) => (
          <Pressable
            key={prompt.text}
            accessibilityRole="button"
            onPress={() => onPick(prompt.text)}
            style={{
              minHeight: metrics.touch,
              justifyContent: "center",
              paddingHorizontal: metrics.space.lg,
              borderRadius: metrics.radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Text>{prompt.text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
