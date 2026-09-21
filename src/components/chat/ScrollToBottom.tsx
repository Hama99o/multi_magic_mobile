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
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ChevronDown } from "lucide-react-native";
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

/** Just enough of a `FlatList` to drive it, so a test can hand this a fake. */
type Scrollable = { scrollToEnd: (options?: { animated?: boolean }) => void };

/**
 * WHO IS IN CHARGE OF THE SCROLL POSITION — the reader, or the conversation.
 *
 * His report: *"when i open big conversation it did not scroll 1000 percent to
 * bottom man and i should see arrow button to go to latest message."* Both
 * halves of that are one bug, and the word that matters is BIG.
 *
 * ── WHY A LONG CONVERSATION LANDED HALF WAY ──────────────────────────────
 * A `FlatList` does not know how tall it is. It renders a batch, reports a
 * content height, renders more, reports a bigger one — so `scrollToEnd` on the
 * first batch scrolls to a bottom that is about to move. The screens handled
 * that by scrolling again on every `onContentSizeChange`, which is right, and
 * then gated it on `!awayFromBottom`, which is where it broke: **our own jump
 * fires a scroll event**, and that event is measured against a content height
 * that has already grown past the offset we just set. It reads as "the reader
 * has scrolled up", so the follow switched itself off — half way down a long
 * conversation, on the very first batch, and never chased again.
 *
 * A short conversation never showed it: one batch, nothing left to grow into.
 *
 * ── SO INTENT AND POSITION ARE NOW TWO DIFFERENT THINGS ──────────────────
 * `pinned` is intent — *we are trying to be at the newest message* — and it is
 * a ref, so it is read at the moment of the event rather than from whatever
 * React last committed. `awayFromBottom` is position, and it is what the
 * button reads. A jump we asked for changes position and must not change
 * intent; only the reader's own finger does that.
 *
 * `chasing` is how the two stay apart. While a chase is outstanding every
 * measurement belongs to us, so none of them can unpin. It ends when the
 * conversation actually reaches the bottom — or the moment a finger touches
 * the list, because at that point the position is theirs whatever we were
 * doing.
 */
export function useAwayFromBottom(listRef: RefObject<Scrollable | null>) {
  const [awayFromBottom, setAway] = useState(false);

  /** The last geometry anybody measured, from whichever callback saw it. */
  const geometry = useRef({ offset: 0, content: 0, layout: 0 });
  /** Are we trying to sit at the newest message? True until they scroll off. */
  const pinned = useRef(true);
  /** Is a jump of ours still in flight? */
  const chasing = useRef(false);

  const fromBottom = () => {
    const { offset, content, layout } = geometry.current;
    return content - layout - offset;
  };

  /** Chase the bottom, but only while that is still what we are trying to do. */
  const follow = useCallback(() => {
    if (!pinned.current) return;
    chasing.current = true;
    listRef.current?.scrollToEnd({ animated: false });
  }, [listRef]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    geometry.current = {
      offset: contentOffset.y,
      content: contentSize.height,
      layout: layoutMeasurement.height,
    };

    const away = fromBottom() > AWAY;

    if (chasing.current) {
      // Ours, not theirs. Says nothing about what the reader wants, so it may
      // move the button but never the pin — and it ends the chase only by
      // arriving.
      if (!away) chasing.current = false;
      return;
    }

    pinned.current = !away;
    setAway(away);
  }, []);

  /**
   * A finger on the list. Whatever we were chasing, the position is theirs
   * from here — which is also the one thing that can rescue a chase that never
   * arrives.
   */
  const onScrollBeginDrag = useCallback(() => {
    chasing.current = false;
  }, []);

  /** The list grew — another batch, or a new message. */
  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      geometry.current.content = height;
      follow();
    },
    [follow],
  );

  /**
   * THE KEYBOARD SHRINKS THE LIST AND NOTHING ELSE RE-SCROLLS.
   * `avoidKeyboard` pads the screen up, so the list's height changes while its
   * offset does not, and the newest message ends up behind the keyboard.
   */
  const onListLayout = useCallback(
    (e: LayoutChangeEvent) => {
      geometry.current.layout = e.nativeEvent.layout.height;
      follow();
    },
    [follow],
  );

  /** The button, and anywhere the app itself should return to the newest. */
  const toBottom = useCallback(() => {
    pinned.current = true;
    chasing.current = true;
    setAway(false);
    listRef.current?.scrollToEnd({ animated: true });
  }, [listRef]);

  return { awayFromBottom, onScroll, onScrollBeginDrag, onContentSizeChange, onListLayout, toBottom };
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
