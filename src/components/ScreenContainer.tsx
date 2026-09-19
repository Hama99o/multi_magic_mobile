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
 * 2. **Android does not always resize any more.** `app.json` sets
 *    `edgeToEdgeEnabled: true`, and an edge-to-edge window is not resized for
 *    the IME — the app is expected to consume that inset itself. So on the
 *    very configuration this app ships, `behavior={undefined}` means nothing
 *    moves and the composer goes under the keyboard.
 *
 * Measured on a device by the QA session: on a people thread with the
 * keyboard up, the composer was not merely covered — it was off-screen, and
 * `people-composer-send` was absent from the hierarchy entirely.
 *
 * **Why `09-keyboard` passed anyway** is the part worth keeping: that flow
 * runs on an AVD where Gboard is in FLOATING mode, and its own header says a
 * floating keyboard "produces no inset at all, so it is the easy case, not
 * the hard one". A green flow, on the wrong keyboard mode, on the one screen
 * that was checked.
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
