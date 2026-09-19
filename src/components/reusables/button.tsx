/**
 * The button.
 *
 * NOT lifted from Karwan's, and the difference is deliberate: Karwan requires
 * an `icon` on every button, because its primary users are couriers tapping
 * one-handed with gloves on a moving phone, and an icon-only or label-only
 * button is a reading problem there. This app is a keyboard-and-reading app on
 * a phone held still, and "Sign in" needs no pictogram. Carrying that rule over
 * would mean inventing an icon for every action to satisfy a constraint that
 * does not apply.
 *
 * What IS carried, because the reasons do apply:
 * - **`minHeight` never below 48** — the touch-target floor.
 * - **`hitSlop`** extends the touch area past the visual bounds.
 * - **`style` IS A PLAIN OBJECT, NEVER A FUNCTION.** With
 *   `jsxImportSource: "nativewind"` every component goes through the interop
 *   wrapper, and that wrapper drops a function style on Pressable — silently.
 *   Not "the pressed state stops working": the WHOLE style is discarded, so the
 *   button loses its background, its height, its padding and its centring, and
 *   renders as bare text. On a light ground that text is `onAccent` white, i.e.
 *   invisible.
 *
 *   This shipped in the first build of this file, because the warning was in
 *   this header while the code below took `({ pressed }) => ({ ... })`. Nothing
 *   caught it: every unit test passed, `tsc` passed, and it bundled — the only
 *   thing that found it was looking at the screen. Pressed state is tracked in
 *   state instead, which keeps the style an object.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, View, type PressableProps } from "react-native";
import { useColors, useMetrics } from "@/hooks/useColors";
import { Text } from "./text";

export type ButtonTone = "primary" | "neutral" | "danger";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  label: string;
  tone?: ButtonTone;
  block?: boolean;
  /** Shows a spinner and blocks presses. Distinct from `disabled`. */
  busy?: boolean;
};

export function Button({
  label,
  tone = "primary",
  block = true,
  busy = false,
  disabled,
  ...rest
}: ButtonProps) {
  const colors = useColors();
  const metrics = useMetrics();
  const [pressed, setPressed] = useState(false);
  const inert = disabled || busy;

  const background = {
    primary: colors.accent,
    neutral: colors.surface,
    danger: colors.danger,
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      // WRITTEN, not inherited from the label Text below. `busy` swaps that Text
      // for a spinner, so a name derived from children disappeared at exactly
      // the moment a person most needs to know what they pressed — and
      // `accessibilityState.busy` says that something is working, never what.
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(inert), busy }}
      disabled={inert}
      hitSlop={8}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      {...rest}
      style={{
        minHeight: metrics.touch,
        borderRadius: metrics.radius.md,
        paddingHorizontal: metrics.space.lg,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: block ? "stretch" : "flex-start",
        backgroundColor: background,
        borderWidth: tone === "neutral" ? 1 : 0,
        borderColor: colors.border,
        // Dimmed rather than hidden: a pressed state that only changes colour
        // is invisible on a bright screen outdoors.
        opacity: inert ? 0.5 : pressed ? 0.85 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color={tone === "neutral" ? colors.ink : colors.onAccent} />
      ) : (
        <View>
          <Text variant="label" tone={tone === "neutral" ? "default" : "onAccent"}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
