/**
 * The six-digit pad (`SPEC.md` §C.1, `SECURITY.md` §1). A custom pad, not a
 * `TextInput`: no keyboard suggestions, no autofill or keyboard learning, and
 * a screen reader hears "3 of 6 digits", never a digit typed. The sixth digit
 * submits, and the digits are cleared at that moment, whatever the answer.
 *
 * A lock screen's feel (owner, TestFlight 1.2.0, 2026-11-15: "not animated and
 * not well ui ux"; Jomo / Klarna on Mobbin, SPEC §B): round soft keys with a
 * light tap each, dots that grow in with a spring, and on a wrong PIN
 * (`wrongKey` changes) the dots shake and turn red for a moment.
 */
import { useEffect, useReducer, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Delete } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { EMPTY_PIN, PIN_LENGTH, pinReducer } from "./pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;
const KEY = 72;
const WRONG_MS = 700;

function Dot({ filled, wrong }: { filled: boolean; wrong: boolean }) {
  const colors = useColors();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (filled) scale.value = withSequence(withTiming(1.35, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 220 }));
  }, [filled, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tint = wrong ? colors.danger : colors.ink;
  return (
    <Animated.View
      style={[
        { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: tint, backgroundColor: filled || wrong ? tint : "transparent" },
        style,
      ]}
    />
  );
}

export function PinPad({
  onComplete,
  disabled = false,
  underDots,
  wrongKey = 0,
  testID = "safezone-pin",
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  /** Shown between the dots and the keys, never dimmed: "Forgot your PIN?"
   *  must stay on screen however short the phone (SPEC §C.5). */
  underDots?: ReactNode;
  /** Bumped by the screen on each wrong PIN: the dots shake and flash red. */
  wrongKey?: number;
  testID?: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [pin, dispatch] = useReducer(pinReducer, EMPTY_PIN);
  const [pressed, setPressed] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!wrongKey) return;
    setWrong(true);
    shake.value = withSequence(
      withTiming(-12, { duration: 50 }),
      withTiming(12, { duration: 70 }),
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    );
    const id = setTimeout(() => setWrong(false), WRONG_MS);
    return () => clearTimeout(id);
  }, [wrongKey, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const press = (key: (typeof KEYS)[number]) => {
    if (disabled) return;
    void Haptics.selectionAsync().catch(() => undefined);
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
    <View testID={testID} style={{ alignItems: "center", gap: metrics.space.xl }}>
      <Animated.View
        testID={`${testID}-dots`}
        accessible
        accessibilityLabel={t("safezone.pin.progress", { typed: pin.digits.length, total: PIN_LENGTH })}
        style={[{ flexDirection: "row", gap: metrics.space.md, opacity: disabled ? 0.4 : 1 }, shakeStyle]}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <Dot key={i} filled={i < pin.digits.length} wrong={wrong} />
        ))}
        {wrong ? <View testID={`${testID}-dots-wrong`} style={{ position: "absolute", width: 0, height: 0 }} /> : null}
      </Animated.View>
      {underDots}
      <View style={{ flexDirection: "row", flexWrap: "wrap", width: 3 * (KEY + 2 * metrics.space.md), justifyContent: "center", rowGap: metrics.space.md, opacity: disabled ? 0.4 : 1 }}>
        {KEYS.map((key, i) =>
          key === "" ? (
            <View key={`gap-${i}`} style={{ width: KEY, height: KEY, marginHorizontal: metrics.space.md }} />
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
                width: KEY,
                height: KEY,
                marginHorizontal: metrics.space.md,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: KEY / 2,
                backgroundColor: key === "back" ? "transparent" : pressed === key ? colors.border : colors.surface,
                transform: [{ scale: pressed === key ? 0.94 : 1 }],
              }}
            >
              {key === "back" ? <Delete size={26} color={colors.ink} /> : <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: "500" }}>{key}</Text>}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}
