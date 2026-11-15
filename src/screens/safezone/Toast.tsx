/** A short line that slides up from the bottom and goes (a copy's answer). */
import { useEffect } from "react";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { Check } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export const TOAST_MS = 2_500;

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  useEffect(() => {
    const id = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(id);
  }, [message, onDone]);
  return (
    <Animated.View
      testID="safezone-toast"
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(200)}
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        left: metrics.space.lg,
        right: metrics.space.lg,
        bottom: metrics.space.xl,
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.sm,
        paddingHorizontal: metrics.space.md,
        paddingVertical: metrics.space.sm + 2,
        borderRadius: 999,
        backgroundColor: colors.ink,
      }}
    >
      <Check size={18} color={colors.ground} />
      <Text style={{ color: colors.ground, flex: 1 }}>{message}</Text>
    </Animated.View>
  );
}
