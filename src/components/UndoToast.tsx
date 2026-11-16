/**
 * "Task deleted · Undo" at the bottom of the screen for five seconds: the
 * Contacts list's bar (`app/contacts/index.tsx`, `contacts-undo`), as one
 * component so Todo and Finance say it the same way. A live region, so a
 * screen reader hears what just happened and that it can be taken back.
 */
import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export const UNDO_MS = 5000;

export interface UndoOffer {
  message: string;
  /** Changes on every new offer, so a second delete restarts the five seconds. */
  at: number;
  /** None: a plain confirmation ("Saved as a template"), no button. */
  undo?: () => void;
}

export function UndoToast({ offer, onDone, testID, bottom = 0 }: { offer: UndoOffer | null; onDone: () => void; testID: string; bottom?: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [used, setUsed] = useState<number | null>(null);

  useEffect(() => {
    if (!offer) return;
    const id = setTimeout(onDone, UNDO_MS);
    return () => clearTimeout(id);
  }, [offer, onDone]);

  if (!offer || used === offer.at) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(160)}
      testID={testID}
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        left: metrics.space.lg,
        right: metrics.space.lg,
        bottom: insets.bottom + metrics.space.lg + bottom,
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.md,
        paddingHorizontal: metrics.space.lg,
        minHeight: 52,
        borderRadius: metrics.radius.md,
        backgroundColor: colors.ink,
      }}
    >
      <Text style={{ flex: 1, color: colors.ground }} numberOfLines={2}>
        {offer.message}
      </Text>
      {offer.undo ? (
      <Pressable
        testID={`${testID}-button`}
        onPress={() => {
          setUsed(offer.at);
          offer.undo?.();
          onDone();
        }}
        accessibilityRole="button"
        accessibilityLabel={t("common.undo")}
        hitSlop={8}
        style={{ minHeight: metrics.touch, justifyContent: "center" }}
      >
        <Text variant="label" style={{ color: colors.ground, textDecorationLine: "underline" }}>
          {t("common.undo")}
        </Text>
      </Pressable>
      ) : null}
    </Animated.View>
  );
}
