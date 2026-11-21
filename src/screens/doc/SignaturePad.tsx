/**
 * DRAW A SIGNATURE WITH A FINGER (SPEC §C.4; web `SignaturePad.tsx`).
 *
 * A pan gesture feeds points into the current stroke; `react-native-svg`
 * draws every stroke as a smooth path (`strokes.ts`). No canvas and no PNG
 * here: the strokes are saved and the server draws the picture (G7), so
 * nothing native is added.
 *
 * The gesture runs on the JS thread (`runOnJS(true)`): one stroke at finger
 * speed is a few dozen state updates a second, well inside budget, and it
 * keeps the whole pad in plain React state.
 */
import { useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import type { Stroke } from "@/api/doc";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { nextPoint, pathFor } from "./strokes";

export function SignaturePad({
  strokes,
  onChange,
  color,
  size,
  brush,
  background,
  height,
  onLayoutSize,
  onDrawing,
}: {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  color: string;
  size: number;
  brush: "pen" | "pencil";
  background: string;
  height: number;
  onLayoutSize: (size: { width: number; height: number }) => void;
  /** True while a finger is down: the screen stops scrolling under it. */
  onDrawing?: (drawing: boolean) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [live, setLive] = useState<Stroke | null>(null);
  const current = useRef<Stroke | null>(null);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => {
      onDrawing?.(true);
      current.current = { color, size, brush, points: [[e.x, e.y, 0.5]] };
      setLive({ ...current.current });
    })
    .onUpdate((e) => {
      const stroke = current.current;
      if (!stroke) return;
      const point = nextPoint(stroke.points[stroke.points.length - 1], e.x, e.y);
      if (!point) return;
      stroke.points.push(point);
      setLive({ ...stroke, points: [...stroke.points] });
    })
    .onFinalize(() => {
      onDrawing?.(false);
      const stroke = current.current;
      current.current = null;
      setLive(null);
      if (stroke && stroke.points.length) onChange([...strokes, stroke]);
    });

  const onLayout = (e: LayoutChangeEvent) => onLayoutSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const shown = live ? [...strokes, live] : strokes;
  const empty = shown.length === 0;

  return (
    <GestureDetector gesture={pan}>
      <View
        testID="doc-signature-pad"
        accessible
        accessibilityRole="image"
        accessibilityLabel={t("doc.creator.pad")}
        onLayout={onLayout}
        style={{
          height,
          borderRadius: metrics.radius.md,
          borderWidth: 1,
          borderStyle: background === "transparent" ? "dashed" : "solid",
          borderColor: colors.border,
          // Ink is dark: the pad stays paper in dark mode too (SPEC §B).
          backgroundColor: background === "transparent" ? "#ffffff" : background,
          overflow: "hidden",
        }}
      >
        {empty ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 28, alignItems: "center" }}>
            <View style={{ width: "70%", height: 1, backgroundColor: "#cbd5e1", marginBottom: 8 }} />
            <Text variant="caption" style={{ color: "#64748b" }}>
              {t("doc.creator.drawHere")}
            </Text>
          </View>
        ) : null}
        <Svg width="100%" height="100%" pointerEvents="none">
          {shown.map((s, i) => (
            <Path
              key={i}
              d={pathFor(s.points)}
              stroke={s.color}
              strokeWidth={s.brush === "pencil" ? s.size * 0.75 : s.size}
              strokeOpacity={s.brush === "pencil" ? 0.7 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>
    </GestureDetector>
  );
}
