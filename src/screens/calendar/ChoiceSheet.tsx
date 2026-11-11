/**
 * Pick one of a few: a bottom sheet of radio rows (Strava's "Repeats every",
 * SPEC §B). Used for repeat and for a guest's access. A tap picks and closes;
 * the sheet never needs a Done button for a single choice.
 */
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FILL } from "@/theme/fill";

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export function ChoiceSheet<T extends string>({
  open,
  title,
  choices,
  value,
  onPick,
  onClose,
  testID,
}: {
  open: boolean;
  title: string;
  choices: Choice<T>[];
  value: T;
  onPick: (value: T) => void;
  onClose: () => void;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View
          testID={testID}
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            paddingBottom: metrics.space.lg + insets.bottom,
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
            maxHeight: "80%",
          }}
        >
          <Text variant="title" accessibilityRole="header" style={{ paddingBottom: metrics.space.sm }}>
            {title}
          </Text>
          <ScrollView>
            {choices.map((choice) => {
              const selected = choice.value === value;
              return (
                <Pressable
                  key={choice.value}
                  testID={`${testID}-${choice.value}`}
                  onPress={() => {
                    onPick(choice.value);
                    onClose();
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={choice.label}
                  accessibilityState={{ checked: selected }}
                  style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch + 4 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text>{choice.label}</Text>
                    {choice.hint ? (
                      <Text variant="caption" tone="muted">
                        {choice.hint}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Check size={20} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
