/**
 * ANDROID'S KEYBOARD LIFT THAT STARTS WITH THE KEYBOARD, NOT AFTER IT.
 *
 * React Native's `KeyboardAvoidingView` on Android acts on `keyboardDidShow`
 * (`KeyboardAvoidingView.js:212`), which fires only after the keyboard has
 * finished sliding up. Android has no "will show" event, and the
 * `LayoutAnimation` smoothing (line 171) needs a duration Android's event does
 * not carry. So the composer sat under the keyboard while it slid, then jumped
 * up in one step. Read from RN's source on 2026-09-24; the recording that
 * measures it against the bar in `docs/design/chat/SPEC.md` is still to come.
 *
 * This keeps the same arithmetic (the overlap of the keyboard's top edge and
 * this box's bottom, `screenY` against `measureInWindow`) and changes WHEN:
 * - the lift last measured is REMEMBERED, and when a composer gains focus
 *   (`anticipateKeyboard()`), the padding starts animating to it straight
 *   away, one native layout animation of about the IME's own 250 ms;
 * - `keyboardDidShow` then corrects it to the real overlap, a no-op when the
 *   keyboard is the same height as last time;
 * - `keyboardDidHide` animates back to 0.
 * The first opening of a session has nothing remembered and still steps once.
 *
 * No native module, so it works in Expo Go, in a real build and in the
 * emulator's dev client alike. iOS keeps RN's `KeyboardAvoidingView`, which
 * gets `keyboardWillShow` and already moves with the keyboard (`Screen`).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Keyboard, LayoutAnimation, View, type KeyboardEvent } from "react-native";

/** The IME's own open duration, near enough; the correction absorbs the rest. */
const LIFT_MS = 250;

let remembered = 0;
const anticipators = new Set<() => void>();

/** Called by a composer's `onFocus`: the keyboard is about to open. */
export function anticipateKeyboard(): void {
  anticipators.forEach((start) => start());
}

/** For tests: forget what the previous keyboard measured. */
export function __resetKeyboardLift(): void {
  remembered = 0;
}

function animateNext() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(LIFT_MS, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
  );
}

export function KeyboardLift({ children }: { children: ReactNode }) {
  const box = useRef<View>(null);
  const [lift, setLift] = useState(0);
  const current = useRef(0);

  const liftTo = (value: number) => {
    if (value === current.current) return;
    current.current = value;
    animateNext();
    setLift(value);
  };

  useEffect(() => {
    const anticipate = () => {
      if (remembered > 0) liftTo(remembered);
    };
    anticipators.add(anticipate);

    const shown = Keyboard.addListener("keyboardDidShow", (e: KeyboardEvent) => {
      const top = e.endCoordinates.screenY;
      box.current?.measureInWindow((_x, y, _w, height) => {
        const overlap = Math.max(0, Math.round(y + height - top));
        remembered = overlap;
        liftTo(overlap);
      });
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => liftTo(0));

    return () => {
      anticipators.delete(anticipate);
      shown.remove();
      hidden.remove();
    };
    // `liftTo` only touches refs and a state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // The OUTER box is measured, so its frame never includes the padding.
    <View ref={box} style={{ flex: 1 }} testID="keyboard-lift">
      <View style={{ flex: 1, paddingBottom: lift }} testID="keyboard-lift-inner">
        {children}
      </View>
    </View>
  );
}
