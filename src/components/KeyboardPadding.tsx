/**
 * ANDROID'S KEYBOARD LIFT, ANIMATED — because RN's `KeyboardAvoidingView`
 * never animates on Android, and that is in its source, not a guess.
 *
 * Measured 2026-09-24 on `qa_phone4`: when the keyboard opens, the chat's
 * content jumps ~694 px (~264 dp) in ONE frame. `d49e1b0` put that down to
 * `LayoutAnimation` not animating on this build. The framework source says
 * something narrower and certain: KAV only animates `if (duration && easing)`
 * (`KeyboardAvoidingView.js`, `_updateBottomIfNecessary`), and Android's only
 * keyboard emitter sends `putDouble("duration", 0)` (`ReactRootView.java`,
 * `createKeyboardEventPayload`). So on Android KAV does not TRY: the padding
 * is set in a single step on every open and close, on every screen.
 *
 * This keeps KAV's arithmetic exactly — the overlap is
 * `max(frame.y + frame.height - keyboard.screenY, 0)`, so it is still 0
 * wherever the window resized itself — and eases a spacer to that height
 * instead of jumping to it.
 *
 * NOT THE NATIVE DRIVER, and it cannot be: the native driver takes transform
 * and opacity only, and a lift that shrinks the list is a change of layout.
 * The cheaper-looking alternative, translating the content with the native
 * driver, opens a 264 dp gap under the header for the length of the motion.
 * So this runs on the JS thread, and it stutters if the JS thread is busy
 * while the keyboard opens. Focusing a field is not a send, so it usually is
 * not, but that is a device observation and has not been made yet.
 *
 * The timing is CHOSEN, not sourced: 250 ms up, 200 ms down, decelerating.
 * The recording decides whether it tracks the keyboard.
 */
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Keyboard, View, type LayoutRectangle } from "react-native";

export const RISE_MS = 250;
export const FALL_MS = 200;

export function KeyboardPadding({ children }: { children: ReactNode }) {
  const frame = useRef<LayoutRectangle | null>(null);
  // Where the keyboard's top edge is, or null while it is down. Seeded for a
  // screen that mounts with the keyboard already up.
  const keyboardY = useRef<number | null>(
    Keyboard.isVisible() ? (Keyboard.metrics()?.screenY ?? null) : null,
  );
  const bottom = useRef(new Animated.Value(0)).current;
  const target = useRef(0);

  const update = useCallback(() => {
    const f = frame.current;
    const next =
      f && keyboardY.current != null ? Math.max(f.y + f.height - keyboardY.current, 0) : 0;
    if (next === target.current) return;
    const rising = next > target.current;
    target.current = next;
    Animated.timing(bottom, {
      toValue: next,
      duration: rising ? RISE_MS : FALL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [bottom]);

  // WINDOW coordinates, because the keyboard's screenY is in them. onLayout's
  // y is relative to the parent: under a header that put the wrapper ~110 dp
  // too high and Save stayed under the keyboard (device, Pages flow 33,
  // 2026-11-24). onLayout's frame stays the fallback where nothing can be
  // measured (a test renderer with no host node).
  const host = useRef<View | null>(null);
  const measure = useCallback(() => {
    const node = host.current as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
    // Update at once from what we have, then correct when the window frame
    // arrives (measureInWindow is async on device, a no-op under Jest's mock).
    update();
    node?.measureInWindow?.((x, y, width, height) => {
      if (height > 0) frame.current = { x, y, width, height };
      update();
    });
  }, [update]);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (e) => {
      keyboardY.current = e.endCoordinates.screenY;
      measure();
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardY.current = null;
      update();
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [measure, update]);


  return (
    // The wrapper's frame never changes with the keyboard (the spacer is
    // inside it), which is what makes the overlap stable, as KAV's padding is.
    <View
      ref={host}
      collapsable={false}
      style={{ flex: 1 }}
      onLayout={(e) => {
        frame.current = e.nativeEvent.layout;
        measure();
      }}
    >
      <View style={{ flex: 1 }}>{children}</View>
      <Animated.View testID="keyboard-padding" style={{ height: bottom }} />
    </View>
  );
}
