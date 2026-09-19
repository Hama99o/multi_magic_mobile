/**
 * Every screen is a `<Screen>`. Safe-area insets and the ground colour live
 * here so a screen cannot forget either, and so the app's feel comes from
 * tokens at the root of the tree rather than from each screen.
 *
 * `measure` is the one thing this does that Karwan's does not: IDENTITY.md §8
 * says at 800 dp the content takes a max width and centres rather than
 * stretching. A tablet is the one place a wide screen needs a decision instead
 * of a resize — a 760 dp line of serif text is unreadable.
 */

/**
 * THE KEYBOARD, ON BOTH PLATFORMS — and the comment that used to be here was
 * wrong in a way that hid a real bug for a day.
 *
 * It said: *"padding is right on iOS; on Android the system already resizes
 * the window, and adding padding on top double-counts it and leaves a gap."*
 * The first half is true. The second is false twice over:
 *
 * 1. **It cannot double-count.** `KeyboardAvoidingView` does not assume; it
 *    MEASURES — `Math.max(frame.y + frame.height - keyboardY, 0)`
 *    (`KeyboardAvoidingView.js:109`). When the window has already resized,
 *    the view's bottom edge is above the keyboard, the subtraction goes
 *    negative and the padding is **0**. Passing `padding` on Android is
 *    therefore free in the case the comment was worried about.
 *
 * 2. **Android does not resize any more, and there is no longer a flag that
 *    could turn that back on.** Under SDK 54 this was a choice:
 *    `app.json` set `edgeToEdgeEnabled: true`, and an edge-to-edge window is
 *    not resized for the IME — the app is expected to consume that inset
 *    itself. **Under SDK 57 the key does not exist.** Edge to edge is
 *    unconditional on every Android build from here, and `expo-doctor`
 *    rejects the app config if you try to write the flag back.
 *
 *    So this `behavior="padding"` is **load-bearing, not belt-and-braces.**
 *    Deleting it does not restore a previous behaviour — there is no
 *    behaviour to restore. On Android it is the only thing that moves the
 *    composer out from under the keyboard, and point 1 is why passing it
 *    costs nothing on the platforms that do resize.
 *
 * Measured on a device by the QA session: on a people thread with the
 * keyboard up, the composer was not merely covered — it was off-screen, and
 * `people-composer-send` was absent from the hierarchy entirely.
 *
 * **Why `09-keyboard` did not catch it**, corrected 2026-09-19 — and the
 * first version of this paragraph was itself wrong, in a header about a
 * comment that was wrong.
 *
 * It said the flow had been passing against a FLOATING Gboard, the easy case,
 * so the green was vacuous. Neither half was true. **The flow had never been
 * run at all**, so there was no green to be vacuous, and that AVD's Gboard is
 * DOCKED and full width — `qa/reports/50-keyboard-up.png` from its first real
 * execution shows the composer sitting above it. The floating claim came from
 * the flow's own header and was believed because it was specific.
 *
 * A flow that is written and never run proves exactly as much as no flow, and
 * is worse in one way: it occupies the slot where somebody would notice the
 * gap. `docs/TESTING.md` §6.
 */
import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors, useMetrics } from "@/hooks/useColors";

export type ScreenProps = {
  children: ReactNode;
  /** Wrap in a ScrollView. Off for screens that own their own list. */
  scroll?: boolean;
  /** Cap the content width and centre it — see the header. */
  measure?: boolean;
  /** Lift content above the keyboard. On for anything with a text field. */
  avoidKeyboard?: boolean;
};

export function Screen({
  children,
  scroll = false,
  measure = true,
  avoidKeyboard = false,
}: ScreenProps) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();

  const inner = (
    <View
      style={{
        flex: 1,
        width: "100%",
        maxWidth: measure ? metrics.maxMeasure : undefined,
        alignSelf: "center",
        // 16dp gutter. At 360 dp this is the difference between a form that
        // breathes and one that touches both edges.
        paddingHorizontal: metrics.space.lg,
      }}
    >
      {children}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {inner}
    </ScrollView>
  ) : (
    inner
  );

  const content = avoidKeyboard ? (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.ground,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      {content}
    </View>
  );
}
