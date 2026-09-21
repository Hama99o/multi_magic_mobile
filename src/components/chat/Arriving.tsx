/**
 * A MESSAGE ARRIVING, RATHER THAN BEING SUDDENLY THERE.
 *
 * His words, two days ago and untouched since: *"mm mobile miss animation
 * man."* This is the smallest thing that answers it, and it is deliberately
 * one thing rather than a motion language invented in an evening.
 *
 * ── RULE ZERO: THE REFERENCES CAME FIRST ─────────────────────────────────
 * `docs/design/README.md` — search Mobbin, then decide. Looked at on
 * 2026-09-21, four assistants, iOS:
 *
 * - **Grok** (`mobbin.com/flows/26a5a345-d3f3-47d5-9ab9-63701f486740`) — the
 *   answer does not appear whole. Its trailing words sit at a lower opacity
 *   and resolve, so the text reads as being written rather than pasted.
 * - **Microsoft Copilot** (`c84e4462-2fc6-4780-877f-91dfae35d40c`) — the
 *   conversations list arrives staggered, each row a little behind the one
 *   above and each fading rather than sliding.
 * - **Meta AI** (`1ff5cedd-78c4-44ea-8791-1451c25f674b`) — prompts cross-fade
 *   out as the conversation starts; nothing slides.
 * - **Klarna** (`42b2cb68-706b-46ea-9612-9acbe53917da`) — same, fade only.
 *
 * WHAT WE TAKE: **fade, and only fade.** Not one of the four moves a message
 * horizontally or bounces it. WHAT WE REJECT: a slide-up. It is the obvious
 * chat animation and no reference uses it, and here it would be actively
 * dangerous — `useAwayFromBottom` chases a content height that four commits
 * tonight were spent getting right, and a transform that changes layout is the
 * one thing that could unsettle it. **Opacity changes no layout.**
 *
 * ── AND ONLY THE NEWEST ROW ──────────────────────────────────────────────
 * A `FlatList` mounts rows as they scroll into view, so fading every row on
 * mount would flicker the whole history under a finger. `arriving` is passed
 * for the last row only: on a fresh answer that is the answer, and on opening
 * a conversation it is one quiet fade at the bottom.
 *
 * ── REDUCE MOTION IS NOT A DETAIL ────────────────────────────────────────
 * Somebody who has asked their phone for less movement has asked for a reason.
 * With it on, this renders at full opacity immediately and never animates —
 * `docs/ACCESSIBILITY.md`. It is checked once per mount rather than subscribed
 * to, because a message that is already on screen should not fade because a
 * setting changed while it sat there.
 *
 * ── RN `Animated`, NOT REANIMATED, AND THAT IS MEASURED ──────────────────
 * `ThinkingDots` is the existing precedent and its comment says why:
 * `useNativeDriver: false`, because the native driver resolves a real view at
 * start and under react-test-renderer there is none — it throws "Unable to
 * locate attached view in the native tree" and takes the whole screen's test
 * with it. `react-native-reanimated` is in `package.json` and has no babel
 * plugin configured, so its worklets would not run here anyway.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated } from "react-native";

/** Long enough to be felt, short enough not to be waited for. */
const FADE_MS = 180;

export function Arriving({ arriving, children }: { arriving: boolean; children: ReactNode }) {
  // Starts opaque. A row that is NOT arriving must never flicker, and a row
  // that is arriving is set back to 0 below before the first paint.
  const opacity = useRef(new Animated.Value(1)).current;
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!arriving || checked) return;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!alive) return;
        setChecked(true);
        if (reduced) return;
        opacity.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: false,
        }).start();
      })
      .catch(() => {
        // No accessibility service to ask. Movement is the smaller risk than a
        // message that never becomes visible, so leave it opaque.
        if (alive) setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, [arriving, checked, opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}
