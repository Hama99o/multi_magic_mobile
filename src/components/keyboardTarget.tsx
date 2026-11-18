/**
 * KEEPING A FORM'S BUTTON ABOVE THE KEYBOARD.
 *
 * Device QA 2026-11-18, AI keys: with the keyboard up, "Vérifier et
 * enregistrer" sat under it. `KeyboardPadding` shrinks the scroll area and
 * Android scrolls the FOCUSED FIELD into view — and stops there. The button
 * just below the field stays covered, and a tap meant for it lands on the
 * keyboard's suggestion bar. Every scrolling form with its button under its
 * last field had the same shape.
 *
 * A button registers itself: `Button` does, always; a hand-built one is
 * wrapped in `<KeyboardTarget>`. (Not a hook in the screen: a screen renders
 * its own `<Screen>`, so a hook there sits above this context and registers
 * nothing — that is what the device showed on AI keys.) With the keyboard up,
 * `Screen` scrolls the nearest registered button BELOW the focused field into
 * view, by the least amount, never so far that the field leaves the top; with
 * no button below, it brings the field itself into view, which Android under
 * edge-to-edge did not do either.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { View } from "react-native";
import type { Box } from "@/lib/measure";

export type KeyboardTargets = { add: (node: unknown) => () => void };
export const KeyboardTargetContext = createContext<KeyboardTargets | null>(null);

/** A ref for a button that must stay reachable above the keyboard. */
export function useKeyboardTarget() {
  const targets = useContext(KeyboardTargetContext);
  const release = useRef<(() => void) | null>(null);
  useEffect(() => () => release.current?.(), []);
  return (node: unknown) => {
    release.current?.();
    release.current = node && targets ? targets.add(node) : null;
  };
}

/** Wraps a hand-built submit so it stays reachable above the keyboard. */
export function KeyboardTarget({ children }: { children: ReactNode }) {
  const ref = useKeyboardTarget();
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}

/** Where to scroll to, or null to leave the scroll where it is. */
export function scrollTargetFor({
  scrollY,
  viewport,
  margin,
  field,
  buttons,
}: {
  scrollY: number;
  viewport: number;
  margin: number;
  field: Box | null;
  buttons: Box[];
}): number | null {
  if (!field) return null;
  const fieldBottom = field.y + field.height;
  const below = buttons.filter((b) => b.y >= fieldBottom).sort((a, b) => a.y - b.y)[0];
  const bottom = below ? below.y + below.height : fieldBottom;
  const wanted = Math.min(bottom + margin - viewport, field.y - margin);
  return wanted > scrollY ? wanted : null;
}
