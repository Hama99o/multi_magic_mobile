/**
 * The assistant's coral → pink gradient, filling its parent exactly.
 *
 * Measured, not "100%": an <Svg width="100%"> laid out absolutely inside a
 * row stopped short of the right edge on the device (app-shell QA,
 * 2026-11-17: the switcher's "Ask the assistant" band ended at about 85%).
 * The parent gives the size through onLayout, and the gradient is drawn at
 * that size in pixels.
 */
import { useState } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ASSISTANT_GRADIENT } from "@/theme/appColors";
import { FILL } from "@/theme/fill";

export function GradientFill({ id }: { id: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      pointerEvents="none"
      style={FILL}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      testID={`${id}-gradient`}
    >
      {size ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={ASSISTANT_GRADIENT[0]} />
              <Stop offset="1" stopColor={ASSISTANT_GRADIENT[1]} />
            </LinearGradient>
          </Defs>
          <Rect width={size.w} height={size.h} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}
