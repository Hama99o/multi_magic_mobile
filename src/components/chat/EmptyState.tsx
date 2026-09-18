/**
 * What this can do WITH THEIR OWN DATA.
 *
 * No mascot, no illustration, no "How can I help you today?" — one line and
 * three example questions drawn from the apps that actually exist. Answering
 * from their own notes, money, contacts and calendar is the ENTIRE difference
 * between this and any chat app they could install instead, so the empty state
 * is the one place to say it before they have asked anything.
 *
 * The examples are tappable: the fastest way to learn what a thing answers is
 * to watch it answer.
 */
import { Pressable, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

const EXAMPLES = [
  "Do I owe anyone money?",
  "What did I note about the apartment?",
  "When did I last speak to Ahmad?",
];

export function EmptyState({ onPick }: { onPick: (question: string) => void }) {
  const colors = useColors();
  const metrics = useMetrics();

  return (
    <View style={{ gap: metrics.space.lg, paddingVertical: metrics.space.xl }} testID="chat-empty">
      <Text tone="muted">
        Ask about anything you have kept in MultiMagic — your notes, money, contacts and
        calendar.
      </Text>

      <View style={{ gap: metrics.space.sm }}>
        {EXAMPLES.map((example) => (
          <Pressable
            key={example}
            accessibilityRole="button"
            onPress={() => onPick(example)}
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
            <Text>{example}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
