/**
 * WHICH ANIMATIONS ACTUALLY STARTED — the only way a test here may watch
 * `Animated` (`.eslintrc.js` refuses `jest.spyOn(Animated, …)` elsewhere).
 *
 * `docs/TESTING.md` §19. A spy on `Animated.timing` sees an animation being
 * BUILT, and building one does nothing. Measured 2026-09-24: with `.start()`
 * removed from `ThinkingDots`, `Arriving`, the skeleton and `KeyboardPadding`,
 * all four suites stayed green. In `Arriving` that is a new message set to
 * opacity 0 and never faded back, and in `KeyboardPadding` a composer left
 * under the keyboard.
 *
 * This wraps each timing's own `start`, so it records the ones that ran,
 * whether started directly or by a `loop`, `sequence`, `parallel` or
 * `stagger` around them (a composite starts its children through that same
 * method).
 */
import { Animated } from "react-native";

export type TimingConfig = Animated.TimingAnimationConfig;

export function watchTimings() {
  const real = Animated.timing;
  const built: TimingConfig[] = [];
  const started: TimingConfig[] = [];
  jest.spyOn(Animated, "timing").mockImplementation((value, config) => {
    built.push(config);
    const animation = real(value, config);
    const start = animation.start.bind(animation);
    animation.start = (callback) => {
      started.push(config);
      start(callback);
    };
    return animation;
  });
  return { built, started };
}

/** Every started step asked for the native driver, and at least one started. */
export function allNative(started: TimingConfig[]): boolean {
  return started.length > 0 && started.every((c) => c.useNativeDriver === true);
}
