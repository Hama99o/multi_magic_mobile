/**
 * A password field with show/hide, first written for `app/change-password.tsx`
 * and shared since the security and email-change screens ask for the same
 * thing. The value lives only in the caller's state.
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export function SecretField({
  label,
  value,
  onChange,
  testID,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  testID: string;
  invalid?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);

  return (
    <View style={{ gap: metrics.space.xs }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: invalid ? colors.danger : colors.border,
          borderRadius: metrics.radius.md,
          paddingHorizontal: metrics.space.lg,
          minHeight: metrics.touch,
        }}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          style={{ flex: 1, color: colors.ink, fontSize: 16 }}
        />
        {/* Five of six references have this, and it is the only defence
            against a typo you cannot see. */}
        {/* 34 x 34 before this, and the neighbour here is the FIELD — so slop
            is the wrong tool twice over: this Pressable is the later sibling,
            so its hit area wins the overlap and quietly eats the last 8 dp of
            the password field. The box grows instead. `alignSelf: "stretch"`
            is free height: the row is already `minHeight: touch`.

            The directional rule this comes from — which way slop may point,
            and why a scalar `hitSlop={n}` claims all four sides are empty —
            is written once, in `components/reusables/input.tsx`. */}
        <Pressable
          testID={`${testID}-reveal`}
          onPress={() => setShown((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={shown ? t("password.hide", { label }) : t("password.show", { label })}
          hitSlop={{ top: 0, bottom: 0, left: 0, right: 8 }}
          style={{
            alignSelf: "stretch",
            justifyContent: "center",
            paddingHorizontal: metrics.space.md,
          }}
        >
          {shown ? (
            <EyeOff size={18} color={colors.inkMuted} />
          ) : (
            <Eye size={18} color={colors.inkMuted} />
          )}
        </Pressable>
      </View>
    </View>
  );
}
