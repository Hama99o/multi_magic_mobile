/**
 * THE ASSISTANT, ONE TAP AWAY FROM ANY SCREEN — the owner, 2026-11-06: the
 * app opens on a home page, and the AI becomes a button at the top that
 * opens it over wherever you are, like the web's floating chat window.
 *
 * It pushes `/chat`, which the root Stack presents as a MODAL
 * (`app/_layout.tsx`): the screen underneath stays mounted, so closing the
 * assistant returns to it exactly as it was, scroll and state. The
 * conversation itself lives on the server and in `useDraft`, so it is the
 * same conversation every time it opens.
 */
import { Pressable } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Sparkles } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export function AiButton({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => router.push("/chat")}
      accessibilityRole="button"
      accessibilityLabel={t("home.askAi")}
      hitSlop={6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 40,
        paddingHorizontal: compact ? 10 : 14,
        borderRadius: metrics.radius.pill,
        backgroundColor: `${colors.accent}22`,
        borderWidth: 1,
        borderColor: `${colors.accent}55`,
      }}
      testID="ai-button"
    >
      <Sparkles size={18} color={colors.accent} />
      {compact ? null : (
        <Text variant="label" tone="accent">
          {t("home.ai")}
        </Text>
      )}
    </Pressable>
  );
}
