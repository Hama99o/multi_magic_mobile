/**
 * The six-digit pad (`SPEC.md` §C.1, `SECURITY.md` §1). A custom pad, not a
 * `TextInput`: no keyboard suggestions, no autofill or keyboard learning, and
 * a screen reader hears "3 of 6 digits", never a digit typed. The sixth digit
 * submits, and the digits are cleared at that moment, whatever the answer.
 */
import { useReducer, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Delete } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { EMPTY_PIN, PIN_LENGTH, pinReducer } from "./pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

export function PinPad({
  onComplete,
  disabled = false,
  testID = "safezone-pin",
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [pin, dispatch] = useReducer(pinReducer, EMPTY_PIN);
  const [pressed, setPressed] = useState<string | null>(null);

  const press = (key: (typeof KEYS)[number]) => {
    if (disabled) return;
    if (key === "back") return dispatch({ type: "back" });
    const next = pinReducer(pin, { type: "digit", digit: key });
    if (next.complete) {
      dispatch({ type: "clear" });
      onComplete(next.digits);
      return;
    }
    dispatch({ type: "digit", digit: key });
  };

  return (
    <View testID={testID} style={{ alignItems: "center", gap: metrics.space.xl, opacity: disabled ? 0.4 : 1 }}>
      <View
        testID={`${testID}-dots`}
        accessible
        accessibilityLabel={t("safezone.pin.progress", { typed: pin.digits.length, total: PIN_LENGTH })}
        style={{ flexDirection: "row", gap: metrics.space.md }}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              borderWidth: 2,
              borderColor: colors.ink,
              backgroundColor: i < pin.digits.length ? colors.ink : "transparent",
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", width: 3 * 84, justifyContent: "center" }}>
        {KEYS.map((key, i) =>
          key === "" ? (
            <View key={`gap-${i}`} style={{ width: 84, height: 64 }} />
          ) : (
            <Pressable
              key={key}
              testID={`${testID}-key-${key}`}
              onPress={() => press(key)}
              onPressIn={() => setPressed(key)}
              onPressOut={() => setPressed(null)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={key === "back" ? t("safezone.pin.delete") : key}
              style={{
                width: 84,
                height: 64,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: metrics.radius.lg,
                backgroundColor: pressed === key ? colors.surface : "transparent",
              }}
            >
              {key === "back" ? <Delete size={26} color={colors.ink} /> : <Text style={{ fontSize: 28, lineHeight: 34 }}>{key}</Text>}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}
