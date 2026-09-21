/**
 * "Back to the newest" — the way out of having scrolled up.
 *
 * His request: *"when we scroll up we dont have scroll to down button in
 * conversation it should exist both for ai and message conversation."* So this
 * is shared by both threads rather than written twice — the assistant's
 * conversation and a people thread are the same problem and must not drift
 * into two answers.
 *
 * ── IT IS NOT AN ACCENT CONTROL ──────────────────────────────────────────
 * `docs/design/IDENTITY.md` §1 spends the accent on one thing: send, the live
 * mic, a focused field. This is navigation — it returns you to where you
 * already were — so it is a raised surface with a border and a muted glyph.
 * An accent-coloured button here would compete with send, which is the one
 * control on the screen that should pull the eye.
 *
 * ── AND IT APPEARS ONLY WHEN IT MEANS SOMETHING ──────────────────────────
 * Rendered only while the reader is genuinely away from the bottom. A control
 * that is always there is one more thing over the conversation; one that
 * appears when you have scrolled is an answer to something you just did.
 */
import { Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useColors, useMetrics } from "@/hooks/useColors";

/**
 * How far from the bottom counts as "away".
 *
 * Deliberately larger than a stray finger. At a smaller threshold the button
 * blinks in and out while somebody reads the newest reply, which is worse than
 * not having it — a control that flickers reads as a fault in the screen.
 */
const AWAY = 160;

/** Tracks whether the reader has left the bottom, for the button and for the
 *  auto-scroll that must not fight them. */
export function useAwayFromBottom() {
  const [awayFromBottom, setAway] = useState(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const fromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setAway(fromBottom > AWAY);
  }, []);

  return { awayFromBottom, onScroll, setAway };
}

export function ScrollToBottom({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: metrics.space.md,
        alignItems: "center",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("chat.scrollToBottom")}
        onPress={onPress}
        android_ripple={{ color: colors.border, borderless: true }}
        style={{
          width: metrics.touch,
          height: metrics.touch,
          borderRadius: metrics.radius.pill,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
        testID="scroll-to-bottom"
      >
        <ChevronDown size={20} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}
