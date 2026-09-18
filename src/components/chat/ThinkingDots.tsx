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
import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

/** Long enough that a normal slow answer never trips it. */
const SLOW_AFTER_MS = 45_000;

function Dot({ delay }: { delay: number }) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        // `useNativeDriver: false`: the native driver resolves a real view at
        // start, and under react-test-renderer there is none — the loop throws
        // "Unable to locate attached view in the native tree" and takes the
        // whole screen's test with it. Three dots fading is a trivial JS-driven
        // animation, so the driver buys nothing here and costs testability.
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: false }),
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
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={slow ? "Still working on your answer" : "Thinking"}
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
          Still working — this one is taking a while.
        </Text>
      ) : null}
    </View>
  );
}
