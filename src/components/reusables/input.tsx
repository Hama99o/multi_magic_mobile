/**
 * A labelled text field.
 *
 * The spec's shape, taken from Preply: the label sits ABOVE the field rather
 * than floating inside it, the focused field takes a coloured border (Upside),
 * and a password field carries an eye to reveal it.
 *
 * The label is a real `<Text>` above the input rather than a placeholder,
 * because a placeholder disappears the moment somebody types — which is exactly
 * when they are most likely to check which field they are in.
 */
import { forwardRef, useState } from "react";
import {
  Pressable, TextInput, View, type TextInputProps,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { useColors, useMetrics } from "@/hooks/useColors";
import { Text } from "./text";

export type InputProps = Omit<TextInputProps, "style"> & {
  label: string;
  /** Shown under the field in the danger tone. */
  error?: string | null;
  /** Adds the reveal toggle and starts obscured. */
  secure?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, secure = false, onFocus, onBlur, ...rest },
  ref,
) {
  const colors = useColors();
  const metrics = useMetrics();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={{ gap: metrics.space.xs }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface,
          borderRadius: metrics.radius.md,
          borderWidth: 1,
          borderColor: error ? colors.danger : focused ? colors.accent : colors.border,
          paddingHorizontal: metrics.space.md,
          minHeight: metrics.touch,
        }}
      >
        <TextInput
          ref={ref}
          secureTextEntry={secure && !revealed}
          placeholderTextColor={colors.inkMuted}
          // The field is the thing the label names, so the label IS its name.
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
          style={{
            flex: 1,
            color: colors.ink,
            fontSize: 16,
            // Android centres text in a taller box unless this is cleared.
            paddingVertical: metrics.space.md,
          }}
        />

        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={12}
            onPress={() => setRevealed((v) => !v)}
            style={{ paddingLeft: metrics.space.sm }}
          >
            {revealed ? (
              <EyeOff size={20} color={colors.inkMuted} />
            ) : (
              <Eye size={20} color={colors.inkMuted} />
            )}
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
});
