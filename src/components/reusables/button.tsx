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
 * - **`style` is a plain object, never a function.** NativeWind drops a
 *   function style on Pressable.
 */
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
  const inert = disabled || busy;

  const background = {
    primary: colors.accent,
    neutral: colors.surface,
    danger: colors.danger,
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inert), busy }}
      disabled={inert}
      hitSlop={8}
      {...rest}
      style={({ pressed }) => ({
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
      })}
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
