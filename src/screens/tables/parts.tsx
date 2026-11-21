/**
 * Small pieces the Tables screens share.
 */
import { Pressable, ScrollView, View } from "react-native";
import { Table2 } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { baseColor } from "./logic";

/** A base's square: its colour as a tint, the glyph in the colour (as Flow's ProjectBadge, so it reads on both grounds). */
export function BaseBadge({ color, size = 40 }: { color: string | null; size?: number }) {
  const hex = baseColor(color);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: `${hex}33`, borderWidth: 1, borderColor: `${hex}88`, alignItems: "center", justifyContent: "center" }}>
      <Table2 size={size * 0.5} color={hex} />
    </View>
  );
}

/** A row of chips, one chosen; scrolls sideways when the words are long (French at 360 dp). */
export function SortChips<T extends string>({ value, options, onChange, testID }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID} accessibilityRole="tablist" contentContainerStyle={{ gap: metrics.space.xs }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testID}-${o.value}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={{ minHeight: 36, borderRadius: metrics.radius.pill, paddingHorizontal: metrics.space.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}
          >
            <Text variant="label" tone={on ? "onAccent" : "default"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
