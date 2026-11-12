/**
 * The A–Z index on the trailing edge (Outlook, Telegram — SPEC §C.1). Only
 * the letters that have contacts; a tap or a drag along it jumps.
 *
 * For a screen reader it is ONE adjustable element ("Index, B"): swipe up or
 * down moves letter by letter, and each move jumps the list. Twenty-seven
 * tiny buttons would be a wall of noise and each under the 48 dp target.
 */
import { useEffect, useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors } from "@/hooks/useColors";

export function AzIndex({ letters, onJump, testID }: { letters: string[]; onJump: (letter: string) => void; testID: string }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const height = useRef(1);
  const lettersRef = useRef(letters);
  const jumpRef = useRef(onJump);
  // In an effect, not in render: the React Compiler refuses a ref written
  // during render (see `useAssistantEcho`). The pan reads them in callbacks.
  useEffect(() => {
    lettersRef.current = letters;
    jumpRef.current = onJump;
  }, [letters, onJump]);

  const jumpAt = (y: number) => {
    const list = lettersRef.current;
    if (!list.length) return;
    const i = Math.max(0, Math.min(list.length - 1, Math.floor((y / height.current) * list.length)));
    setCurrent(i);
    jumpRef.current(list[i]);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => jumpAt(e.nativeEvent.locationY),
      onPanResponderMove: (e) => jumpAt(e.nativeEvent.locationY),
    }),
  ).current;

  if (letters.length < 2) return null;
  const at = Math.min(current, letters.length - 1);
  const step = (delta: number) => {
    const i = Math.max(0, Math.min(letters.length - 1, at + delta));
    setCurrent(i);
    onJump(letters[i]);
  };

  return (
    <View
      testID={testID}
      onLayout={(e: LayoutChangeEvent) => {
        height.current = Math.max(1, e.nativeEvent.layout.height);
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t("contacts.list.index")}
      accessibilityValue={{ text: letters[at] }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      {...pan.panHandlers}
      style={{ paddingHorizontal: 4, paddingVertical: 6, justifyContent: "center", alignItems: "center" }}
    >
      {letters.map((letter) => (
        <Text key={letter} testID={`${testID}-${letter}`} variant="caption" style={{ color: colors.accent, fontWeight: "600", fontSize: 11, lineHeight: 15 }}>
          {letter}
        </Text>
      ))}
    </View>
  );
}
