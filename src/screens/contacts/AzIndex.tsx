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

/** Which letter a touch at `y` (in the strip) means, given where the letter
 *  block sits in the strip. Clamped: above the block is the first letter,
 *  below it the last. */
export function letterIndexAt(y: number, top: number, height: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(((y - top) / Math.max(1, height)) * count)));
}

export function AzIndex({ letters, onJump, testID }: { letters: string[]; onJump: (letter: string) => void; testID: string }) {
  const colors = useColors();
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  // Where the letters sit inside the strip: the strip stretches to the
  // list's height and the letters are centred in it, so a touch is mapped
  // onto the letter block, not onto the whole strip (device, 2026-11-12).
  const block = useRef({ y: 0, height: 1 });
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
    const i = letterIndexAt(y, block.current.y, block.current.height, list.length);
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
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t("contacts.list.index")}
      accessibilityValue={{ text: letters[at] }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      {...pan.panHandlers}
      style={{ paddingHorizontal: 4, paddingVertical: 6, justifyContent: "center", alignItems: "center" }}
    >
      {/* The letters take no touches: React Native reports `locationY`
          relative to the view under the finger, so with the letters as
          targets every tap measured ~0 and jumped to A (device, 2026-11-12).
          The strip itself is the only target, and y runs along all of it. */}
      <View
        testID={`${testID}-letters`}
        pointerEvents="none"
        style={{ alignItems: "center" }}
        onLayout={(e: LayoutChangeEvent) => {
          block.current = { y: e.nativeEvent.layout.y, height: Math.max(1, e.nativeEvent.layout.height) };
        }}
      >
        {letters.map((letter) => (
          <Text key={letter} testID={`${testID}-${letter}`} variant="caption" style={{ color: colors.accent, fontWeight: "600", fontSize: 11, lineHeight: 15 }}>
            {letter}
          </Text>
        ))}
      </View>
    </View>
  );
}
