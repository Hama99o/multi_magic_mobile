/**
 * Small controls the Doc screens share: a segmented switch, chips, colour
 * swatches and a −/+ stepper. Each is a 48 dp target with its state said to
 * a screen reader (`accessibilityState.selected`), and none animates.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, type LucideIcon } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export function Segmented<K extends string>({ value, options, onChange, testID }: { value: K; options: { key: K; label: string }[]; onChange: (k: K) => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} accessibilityRole="tablist" style={{ flexDirection: "row", padding: 4, borderRadius: metrics.radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testID}-${o.key}`}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.pill, backgroundColor: on ? colors.accent : "transparent" }}
          >
            <Text variant="label" tone={on ? "onAccent" : "default"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress, testID, icon: Icon, fontFamily, disabled }: { label: string; selected: boolean; onPress: () => void; testID: string; icon?: LucideIcon; fontFamily?: string; disabled?: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      style={{
        minHeight: metrics.touch,
        paddingHorizontal: metrics.space.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.xs,
        borderRadius: metrics.radius.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: colors.surface,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {Icon ? <Icon size={16} color={colors.ink} /> : null}
      <Text variant="label" style={fontFamily ? { fontFamily, fontWeight: "normal", fontSize: 20, lineHeight: 28 } : undefined} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Swatches({ values, value, onChange, testID }: { values: readonly { value: string; label: string }[]; value: string; onChange: (v: string) => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
      {values.map((s) => {
        const on = s.value === value;
        const transparent = s.value === "transparent";
        return (
          <Pressable
            key={s.value}
            testID={`${testID}-${s.value.replace("#", "")}`}
            onPress={() => onChange(s.value)}
            accessibilityRole="button"
            accessibilityLabel={on ? t("doc.creator.swatch", { name: t(s.label) }) : t(s.label)}
            accessibilityState={{ selected: on }}
            style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: transparent ? "transparent" : s.value,
                borderWidth: on ? 3 : 1,
                borderStyle: transparent && !on ? "dashed" : "solid",
                borderColor: on ? colors.accent : colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {on ? <Check size={16} color={transparent || isLight(s.value) ? colors.ink : "#ffffff"} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function isLight(hex: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return true;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}

export function Stepper({ label, value, onMinus, onPlus, minusLabel, plusLabel, testID }: { label: string; value: string; onMinus: () => void; onPlus: () => void; minusLabel: string; plusLabel: string; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const button = (text: string, a11y: string, onPress: () => void, id: string) => (
    <Pressable
      testID={`${testID}-${id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{ width: metrics.touch, height: metrics.touch, borderRadius: metrics.touch / 2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}
    >
      <Text variant="title" style={{ fontSize: 22, lineHeight: 26 }}>
        {text}
      </Text>
    </Pressable>
  );
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
      <Text variant="label" style={{ flex: 1 }}>
        {label}
      </Text>
      {button("−", minusLabel, onMinus, "minus")}
      <Text variant="label" style={{ minWidth: 56, textAlign: "center" }} accessibilityLiveRegion="polite">
        {value}
      </Text>
      {button("+", plusLabel, onPlus, "plus")}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="label" tone="muted" accessibilityRole="header">
      {children}
    </Text>
  );
}
