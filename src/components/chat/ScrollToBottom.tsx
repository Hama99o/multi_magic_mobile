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
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
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
 * How many times one growth may be chased before we believe the list rather
 * than ourselves.
 *
 * His second report: *"when the send message is very big and it takes all
 * screen then it did not scroll to bottom, still have this problem but with
 * big message."* Two separate things go wrong when one message is taller than
 * the viewport, and the first is native:
 *
 * **A scroll issued inside `onContentSizeChange` is handed to the list before
 * the new height is committed**, so it travels to the OLD bottom. With one
 * more line of text that undershoot is invisible. With an answer that fills
 * the screen it is a whole screen short — which is why this only ever showed
 * itself on a big message. So every chase is repeated on the next frame, when
 * the height it needs has been committed.
 *
 * The second was mine. A chase that never arrived kept `chasing` true for
 * ever, and while it is true no measurement may raise the button — so the one
 * case where somebody is stranded was the one case offering no way back. After
 * this many attempts the hook stops insisting, reports where it actually is,
 * and the button appears. Being wrong quietly is the thing to avoid.
 */
const CHASE_RETRIES = 3;

/**
 * How long after a jump to stop waiting for it and say where we actually are.
 *
 * His third report, and it describes the hole exactly: *"it scroll to this and
 * it stop, and when i move then it show the arrow to down, and when i click
 * then it goto down."*
 *
 * **A jump that moves the list nowhere fires no scroll event at all.** Every
 * attempt above was counted in `onScroll`, so a chase that had already gone as
 * far as the list would take it was never counted out: `chasesLeft` stayed
 * positive, and while it is positive no measurement may raise the button. The
 * list stopped, nothing more arrived, and the one thing that would have told
 * the truth was his own finger — which is why the arrow needed a drag.
 *
 * So the chase is also resolved by the clock, which does not need the list to
 * have moved. Long enough that an ordinary landing reports first and the
 * button never blinks; short enough to be the same gesture.
 */
const SETTLE_MS = 300;

/** Just enough of a `FlatList` to drive it, so a test can hand this a fake. */
type Scrollable = {
  scrollToEnd: (options?: { animated?: boolean }) => void;
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
};

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

  /**
   * HAS THE FIRST LANDING FINISHED?
   *
   * *"it did not go to bottom when i come to session."* Opening a conversation
   * puts the list at offset 0, which IS the top — so `onStartReached` fires on
   * mount, an older page is fetched, and it is prepended ABOVE us while we are
   * trying to land at the bottom. The target moves every time it arrives, and
   * the fetch was never wanted: nobody has reached the top, they have only not
   * left it yet.
   *
   * So the screens hold `onStartReached` until this is true. Loading older
   * history is for a reader who has travelled up to ask for it.
   */
  const [settled, setSettled] = useState(false);

  /** The last geometry anybody measured, from whichever callback saw it. */
  const geometry = useRef({ offset: 0, content: 0, layout: 0 });
  /** Are we trying to sit at the newest message? True until they scroll off. */
  const pinned = useRef(true);
  /** How many attempts this chase has left. 0 means no jump is in flight. */
  const chasesLeft = useRef(0);
  /** Resolves a chase the list never answered. Cleared on unmount. */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fromBottom = () => {
    const { offset, content, layout } = geometry.current;
    return content - layout - offset;
  };

  /**
   * GO TO THE BOTTOM — BY MEASUREMENT, NOT BY `scrollToEnd`.
   *
   * His report: *"when i click on arrow it go top and stop on big message each
   * time, but for small message it works."* Going to the TOP is not a near
   * miss, and `VirtualizedList.js` says why in its own source:
   *
   *     const frame = this._listMetrics.getCellMetricsApprox(veryLast, …);
   *     const offset = Math.max(0, frame.offset + frame.length
   *                                + this._footerLength - visibleLength);
   *
   * **Approx.** A cell that is not currently rendered has no measured height,
   * so the last one is estimated from the average row — and when one message
   * is ten screens tall while the rest are two lines, that estimate is not
   * slightly wrong, it is an order out. The `Math.max(0, …)` then turns an
   * underestimate into **offset 0**, which is the top of the conversation.
   * Small messages estimate correctly, which is exactly the split he saw.
   *
   * We are not guessing, though. `contentSize.height` on a scroll event and
   * the height in `onContentSizeChange` are both reported by the native view
   * and are the real thing, so `scrollToOffset` with our own arithmetic beats
   * the list's approximation. `scrollToEnd` stays only for the first moments,
   * before anything has been measured at all.
   */
  const jumpTo = useCallback(
    (animated: boolean) => {
      const list = listRef.current;
      if (!list) return;
      const { content, layout } = geometry.current;
      if (content > 0 && layout > 0) {
        list.scrollToOffset({ offset: Math.max(0, content - layout), animated });
        return;
      }
      list.scrollToEnd({ animated });
    },
    [listRef],
  );

  const jump = useCallback(() => jumpTo(false), [jumpTo]);

  /** Stop waiting on a jump — it arrived, or a finger took over. */
  const endChase = useCallback(() => {
    setSettled(true);
    chasesLeft.current = 0;
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  /**
   * Resolve the chase on the clock as well as on scroll events, because a jump
   * that moves nothing produces no scroll event to resolve it with.
   */
  const scheduleSettle = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      chasesLeft.current = 0;
      setSettled(true);
      // Whatever the list did, this is where it ended up. The offset is the
      // last one anybody measured, which is still true precisely BECAUSE
      // nothing moved.
      setAway(fromBottom() > AWAY);
    }, SETTLE_MS);
  }, []);

  /** Chase the bottom, but only while that is still what we are trying to do. */
  const follow = useCallback(() => {
    if (!pinned.current) return;
    chasesLeft.current = CHASE_RETRIES;
    jump();
    // AND AGAIN NEXT FRAME, against the height that is committed by then.
    requestAnimationFrame(jump);
    scheduleSettle();
  }, [jump, scheduleSettle]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    geometry.current = {
      offset: contentOffset.y,
      content: contentSize.height,
      layout: layoutMeasurement.height,
    };

    const away = fromBottom() > AWAY;

    if (chasesLeft.current > 0) {
      // Ours, not theirs. A jump we asked for says nothing about what the
      // reader wants, so it may not move the pin.
      if (!away) {
        endChase(); // arrived
        setAway(false);
        return;
      }
      chasesLeft.current -= 1;
      if (chasesLeft.current > 0) {
        // Short of the bottom, and the height may have moved again under us.
        requestAnimationFrame(jump);
        return;
      }
      // OUT OF ATTEMPTS — say where we really are, so there is a way back.
      //
      // But stay pinned. A failed chase is not the reader choosing to be here,
      // and an answer this tall is very likely still laying out: the next
      // growth deserves a fresh set of attempts rather than an app that has
      // given up following. Only a finger, below, decides that.
      chasesLeft.current = 0;
      setSettled(true);
      setAway(true);
      return;
    }

    pinned.current = !away;
    setAway(away);
  }, [jump, endChase]);

  /**
   * A finger on the list. Whatever we were chasing, the position is theirs
   * from here — which is also the one thing that can rescue a chase that never
   * arrives.
   */
  const onScrollBeginDrag = useCallback(() => {
    endChase();
  }, [endChase]);

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

  // A timer outliving the screen is the "worker process failed to exit"
  // class of bug in `docs/TESTING.md` §7. It costs one line not to have it.
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  /** The button, and anywhere the app itself should return to the newest. */
  const toBottom = useCallback(() => {
    pinned.current = true;
    chasesLeft.current = CHASE_RETRIES;
    scheduleSettle();
    setAway(false);
    jumpTo(true);
  }, [jumpTo, scheduleSettle]);

  return {
    awayFromBottom,
    settled,
    onScroll,
    onScrollBeginDrag,
    onContentSizeChange,
    onListLayout,
    toBottom,
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
