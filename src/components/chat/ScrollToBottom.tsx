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
import {
  Pressable,
  View,
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ChevronDown } from "@/components/icons";
import { useCallback, useRef, useState, type RefObject } from "react";
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

/**
 * THE NEWEST MESSAGE AS THE LIST'S OWN ANCHOR — for an `inverted` FlatList.
 *
 * Chosen 2026-09-24 over the chase it replaced (`useAwayFromBottom`, deleted
 * in the same change — read it in git history at `915c54b`), after that was
 * measured on `qa_phone4`. The chase aimed at a bottom it computed from two
 * height sources that disagreed while the keyboard was up (a jump "to 374"
 * landing at 269), corrected every resize a frame or more after the native
 * layout had already been drawn, and fought its own animated scroll after a
 * send (+81 / -81 / +81 px). Every one of those is a JS program trying to hold
 * a position the native list could hold by itself.
 *
 * Inverted, offset 0 IS the newest message. The keyboard opening, the composer
 * wrapping, a reply growing while it arrives: each changes a height at the
 * bottom edge, and a list anchored at offset 0 stays at offset 0. Nothing here
 * issues a scroll for any of them. What is left for JS:
 *
 *   - whether the reader has left the newest (`awayFromBottom`, the button);
 *   - the button itself, one animated scroll to 0;
 *   - `maintainVisibleContentPosition`, so a message arriving while they read
 *     history does not shove the history under their finger, and so one
 *     arriving while they are AT the newest still shows (the autoscroll
 *     threshold).
 *
 * What dies with the chase, so nobody rediscovers it: the "scroll issued
 * inside onContentSizeChange travels to the OLD bottom" problem, the
 * `scrollToEnd` approximation for an unmeasured tall last cell
 * (`VirtualizedList.getCellMetricsApprox`), the retries and the settle clock.
 * None of those can occur when no scroll is issued. They remain TRUE of a
 * non-inverted list: anyone tempted to un-invert should read that hook's
 * header at `915c54b` first, because each of them cost a commit to learn.
 */
/** One object for the life of the app: a fresh literal per render would be a
 *  new prop every render, and `FlatList` is a PureComponent. */
const KEEP_POSITION = { minIndexForVisible: 0, autoscrollToTopThreshold: AWAY } as const;

export function useNewestAnchor<T>(listRef: RefObject<FlatList<T> | null>) {
  const [awayFromBottom, setAway] = useState(false);
  const away = useRef(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Inverted: the offset IS the distance from the newest.
    const next = e.nativeEvent.contentOffset.y > AWAY;
    // Only on a flip — a scroll event re-rendering the screen on every frame
    // would cost more than the button is worth.
    if (next !== away.current) {
      away.current = next;
      setAway(next);
    }
  }, []);

  const toBottom = useCallback(() => {
    // Already at the newest: nothing to do, and `maintainVisibleContentPosition`
    // shows what arrives. Animating anyway is the send-shake this replaced.
    if (!away.current) return;
    away.current = false;
    setAway(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [listRef]);

  return {
    awayFromBottom,
    onScroll,
    toBottom,
    maintainVisibleContentPosition: KEEP_POSITION,
  };
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
