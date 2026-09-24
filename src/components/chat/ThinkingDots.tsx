/**
 * Three dots WHERE THE ANSWER WILL APPEAR.
 *
 * Load-bearing, not decorative. The reply arrives over a socket from a
 * background job, so between posting a question and the answer landing there is
 * nothing else on screen at all — this indicator is the only thing standing
 * between a posted question and silence on a bad connection. Mindvalley's
 * dots-in-place rather than a centred spinner, because it occupies the exact
 * spot the answer will fill.
 *
 * ── The timeout is the part that matters ──────────────────────────────────
 * After ~45 seconds the copy changes. **A socket that died silently must not
 * look like a model that is thinking**, and dots that animate forever are
 * indistinguishable from a lost connection. The wait is real — RAG plus a
 * provider call is genuinely slow — so this does not fail, it says so.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useTranslation } from "react-i18next";

/** Long enough that a normal slow answer never trips it. */
const SLOW_AFTER_MS = 45_000;

function Dot({ delay }: { delay: number }) {
  const colors = useColors();
  // `useState` with an initialiser rather than `useRef(new …).current`: the
  // ref form reads `.current` during render, which the React Compiler rejects,
  // AND constructs a throwaway `Animated.Value` on every render to hand to a
  // `useRef` that ignores it. This builds exactly one.
  const [opacity] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        // NATIVE driver. This said "the driver buys nothing here"; measured
        // 2026-09-24 on `qa_phone4` it buys the whole thing: the dots are on
        // screen during the 0.3-1 s JS stall after a send, and a JS-driven
        // loop freezes for exactly that long. Tests refuse the driver in
        // `src/__tests__/setup.ts`, which was the old reason to go without.
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        Animated.delay(800 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, opacity]);

  return (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: colors.inkMuted,
        opacity,
      }}
    />
  );
}

export function ThinkingDots() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  /**
   * SPOKEN, because the copy change above is the whole point of this component
   * and a label that changes inside a view nobody is watching changes nothing.
   *
   * The header says it: a socket that died silently must not look like a model
   * that is thinking. Someone who cannot see the dots has no other way to tell
   * those two apart, so they are the person this sentence was written for.
   * `announceForAccessibility` is a no-op when no screen reader is running.
   */
  useEffect(() => {
    if (slow) AccessibilityInfo.announceForAccessibility(t("chat.slow"));
  }, [slow, t]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={slow ? t("chat.stillWorking") : t("chat.thinking")}
      accessibilityLiveRegion="polite"
      style={{ paddingVertical: metrics.space.md, gap: metrics.space.sm }}
      testID="thinking"
    >
      <View style={{ flexDirection: "row", gap: metrics.space.xs }}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
      {slow ? (
        <Text variant="caption" tone="muted" testID="thinking-slow">
          {t("chat.slow")}
        </Text>
      ) : null}
    </View>
  );
}
