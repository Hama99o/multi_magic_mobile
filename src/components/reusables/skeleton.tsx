/**
 * THE SHAPE OF WHAT IS COMING, WHILE IT COMES.
 *
 * The owner, 2026-09-24: the first load "is not good". It was a blank screen —
 * the chat list rendered `null` while the session and messages loaded, the
 * photo was a "?" — and then everything popped in at once.
 *
 * Rule Zero, searched on Mobbin before deciding (2026-09-24):
 * - ChatGPT (`mobbin.com/screens/67e1a762-dead-4784-b2a1-3a17d48d4834`) —
 *   soft grey bars where the conversation will be; the composer already there.
 * - Telegram (`mobbin.com/screens/a8d272e2-66cd-46d0-8761-f85b0dac21e0`) —
 *   placeholder ROWS in the real rows' shape: a circle and two lines.
 * - Believe (`mobbin.com/screens/6862f715-2538-41e7-9b64-8263109d781b`) —
 *   placeholder BUBBLES in a thread's shape.
 * TAKE: placeholders shaped like the real content, in a quiet tone, with the
 * screen's own chrome (header, composer) drawn and usable at once.
 * REJECT: a spinner in the middle of the screen, which none of them uses and
 * which says "wait" without saying for what. And a travelling shimmer: a slow
 * pulse is enough to read as "loading" and cheaper to run.
 *
 * The pulse is on the NATIVE driver, like `ThinkingDots`, so a busy JS thread
 * during the first load (it is at its busiest then) cannot freeze it. Reduce
 * Motion holds it still. Every piece is hidden from the screen reader: a
 * skeleton has no content to announce, and the screen says "loading" once.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, View, type DimensionValue } from "react-native";
import { useColors, useMetrics } from "@/hooks/useColors";

/** One slow breath: dim to bright and back. */
const PULSE_MS = 900;

function usePulse() {
  const opacity = useRef(new Animated.Value(1)).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (!alive) return;
        if (reduced) {
          setStill(true);
          return;
        }
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.45, duration: PULSE_MS, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
          ]),
        );
        loop.start();
      });
    return () => {
      alive = false;
      loop?.stop();
    };
  }, [opacity]);

  return still ? 1 : opacity;
}

/** The pulsing wrapper every skeleton shares, so they breathe together. */
function Pulse({ children, testID }: { children: ReactNode; testID?: string }) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{ opacity }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

export function SkeletonBar({
  width,
  height = 12,
  radius,
}: {
  width: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius ?? metrics.radius.sm,
        backgroundColor: colors.border,
      }}
    />
  );
}

/**
 * The assistant's thread: a question on the right, an answer's lines on the
 * left, twice — the shape `MessageRow` will fill, so nothing jumps when the
 * real thread arrives.
 */
export function ThreadSkeleton({ testID = "thread-skeleton" }: { testID?: string }) {
  const metrics = useMetrics();
  const turn = (question: DimensionValue, lines: DimensionValue[]) => (
    <View style={{ gap: metrics.space.md }}>
      <View style={{ alignItems: "flex-end" }}>
        <SkeletonBar width={question} height={40} radius={metrics.radius.lg} />
      </View>
      <View style={{ gap: metrics.space.sm }}>
        {lines.map((w, i) => (
          <SkeletonBar key={i} width={w} height={14} />
        ))}
      </View>
    </View>
  );
  return (
    <Pulse testID={testID}>
      <View style={{ gap: metrics.space.xl, paddingVertical: metrics.space.lg }}>
        {turn("55%", ["92%", "86%", "64%"])}
        {turn("40%", ["88%", "52%"])}
      </View>
    </Pulse>
  );
}

/** A thread with a person: bubbles on both sides, like `PersonMessageRow`. */
export function BubblesSkeleton({ testID = "bubbles-skeleton" }: { testID?: string }) {
  const metrics = useMetrics();
  const bubble = (mine: boolean, width: DimensionValue) => (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
      <SkeletonBar width={width} height={40} radius={metrics.radius.lg} />
    </View>
  );
  return (
    <Pulse testID={testID}>
      <View style={{ gap: metrics.space.md, paddingVertical: metrics.space.lg }}>
        {bubble(false, "48%")}
        {bubble(true, "62%")}
        {bubble(false, "36%")}
        {bubble(true, "44%")}
      </View>
    </Pulse>
  );
}

/** A list of conversations: a circle and two lines per row, Telegram's shape. */
export function RowsSkeleton({ rows = 6, testID = "rows-skeleton" }: { rows?: number; testID?: string }) {
  const metrics = useMetrics();
  return (
    <Pulse testID={testID}>
      <View style={{ gap: metrics.space.lg, paddingVertical: metrics.space.md }}>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
            <SkeletonBar width={44} height={44} radius={metrics.radius.pill} />
            <View style={{ flex: 1, gap: metrics.space.sm }}>
              <SkeletonBar width={i % 2 ? "42%" : "56%"} height={13} />
              <SkeletonBar width={i % 2 ? "74%" : "66%"} height={11} />
            </View>
          </View>
        ))}
      </View>
    </Pulse>
  );
}
