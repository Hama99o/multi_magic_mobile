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
import { useTranslation } from "react-i18next";

export type InputProps = Omit<TextInputProps, "style"> & {
  label: string;
  /** Shown under the field in the danger tone. */
  error?: string | null;
  /** A handle for the error line, so a flow can assert WHICH field complained. */
  errorTestID?: string;
  /** Adds the reveal toggle and starts obscured. */
  secure?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, errorTestID, secure = false, onFocus, onBlur, ...rest },
  ref,
) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
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

        {/* ── WHICH DIRECTION MAY `hitSlop` POINT? ─────────────────────
            Only at space nothing else can be pressed.

              toward the screen edge or the container's own padding — always
              toward a neighbour nobody can press (text, an icon, a spacer) — fine
              toward ANOTHER PRESSABLE — never
              toward a TEXT INPUT — never, and this is the one that bites

            **A scalar `hitSlop={n}` is a claim that all four sides are
            empty.** When any side faces something pressable, write the object
            form and put a 0 on that side. When two hit areas overlap, the
            LATER SIBLING WINS — hit-testing walks children in reverse order —
            so the control declared last silently takes the other's edge.

            This exact field is why the rule is written here. It was
            `hitSlop={12}` over a bare icon: 44 high, and 12 dp of it reaching
            left across the text input. The reveal is the later sibling, so
            **the last 12 dp of every password field in the app was a reveal
            button.** Nobody would ever file that — it looks like a typo in
            your own password, or a keyboard that did not open.

            No gate can catch it: whether two hit areas overlap is a question
            about layout, and Jest has none. The comment is the instrument.

            So: the box grows instead (`alignSelf: "stretch"` is free height,
            the row is already `minHeight: touch`), and the slop that remains
            points right, at the container's padding. */}
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t("password.hidePassword") : t("password.showPassword")}
            hitSlop={{ top: 0, bottom: 0, left: 0, right: 8 }}
            onPress={() => setRevealed((v) => !v)}
            style={{
              alignSelf: "stretch",
              justifyContent: "center",
              paddingHorizontal: metrics.space.md,
            }}
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
        <Text
          variant="caption"
          tone="danger"
          testID={errorTestID}
          // The error appears AFTER a press, so nothing moves focus to it and a
          // screen reader user gets silence where a sighted user gets a red line.
          // `polite` waits for the current utterance rather than cutting it off.
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});
