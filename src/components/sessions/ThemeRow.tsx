/**
 * System · Light · Dark, as three swatches rather than three words.
 *
 * Bolt Food's treatment (`karwan-mobile/docs/design/customer/profile/references/
 * boltfood-theme-swatches.webp`): a theme control should show the thing it
 * does. A row of words asks somebody to imagine the result; a row of swatches
 * IS the result, in the actual palette, which is also the only version that
 * survives translation.
 *
 * The swatches carry the real tokens — `TOKENS.light.ground` and
 * `TOKENS.dark.ground` with the accent on top — so the control cannot drift
 * from the palette it is choosing between. "System" shows both halves, because
 * that is exactly what it means: whichever the phone is.
 */
import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { TOKENS } from "@/theme/tokens";
import { useThemeStore, type ThemeChoice } from "@/stores/theme.store";
import { useTranslation } from "react-i18next";

const CHOICES: { key: ThemeChoice; labelKey: string }[] = [
  { key: "system", labelKey: "appearance.system" },
  { key: "light", labelKey: "appearance.light" },
  { key: "dark", labelKey: "appearance.dark" },
];

function Swatch({ choice, selected }: { choice: ThemeChoice; selected: boolean }) {
  const colors = useColors();
  const size = 40;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        flexDirection: "row",
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.accent : colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* "System" is both, split down the middle — whichever the phone is. */}
      {choice !== "dark" ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: choice === "system" ? size / 2 : size,
            backgroundColor: TOKENS.light.ground,
          }}
        />
      ) : null}
      {choice !== "light" ? (
        <View
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: choice === "system" ? size / 2 : size,
            backgroundColor: TOKENS.dark.ground,
          }}
        />
      ) : null}
      {selected ? (
        <Check
          size={16}
          color={choice === "light" ? TOKENS.light.accent : TOKENS.dark.accent}
        />
      ) : null}
    </View>
  );
}

export function ThemeRow() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const choice = useThemeStore((s) => s.choice);
  const setChoice = useThemeStore((s) => s.setChoice);

  return (
    <View style={{ gap: metrics.space.sm }} testID="theme-row">
      <Text variant="label" tone="muted" style={{ paddingHorizontal: metrics.space.sm }}>
        {t("appearance.title")}
      </Text>
      <View style={{ flexDirection: "row", gap: metrics.space.lg, paddingHorizontal: metrics.space.sm }}>
        {CHOICES.map((option) => {
          const selected = option.key === choice;
          const label = t(option.labelKey);
          return (
            <Pressable
              key={option.key}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={() => setChoice(option.key)}
              hitSlop={6}
              style={{ alignItems: "center", gap: metrics.space.xs, minHeight: metrics.touch }}
              testID={`theme-${option.key}`}
            >
              <Swatch choice={option.key} selected={selected} />
              <Text variant="caption" tone={selected ? "accent" : "muted"}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
