/**
 * PLACING A SIGNATURE ON A PAGE (SPEC §C.5; web `DocPdfSigner.tsx`,
 * `DocImageSigner.tsx`).
 *
 * Tap the page to put the chosen signature there (22 % of the page width, the
 * web's size). Then drag to move, pinch to resize, twist to turn — the phone
 * does this better than the web's 20 px handles. The same three changes are
 * buttons too (`StampBar`), for one hand and for a screen reader.
 *
 * Placements are kept as ratios of the page as shown, the server's contract:
 * x/y the centre from the top-left, width a share of the page width, height
 * following the signature's own proportions.
 *
 * Not a list: one page and a few stamps, so a rotate transform here is a
 * plain style, not a recycled cell (the owner's FlashList rule does not
 * apply, and nothing animates).
 */
import { useRef } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image as ExpoImage } from "expo-image";
import { useTranslation } from "react-i18next";
import type { Placement } from "@/api/doc";
import { RotateCw, Trash2, ZoomIn, ZoomOut } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { clamp } from "./files";

export const DEFAULT_WIDTH = 0.22;
export const MIN_WIDTH = 0.05;
export const MAX_WIDTH = 0.95;

/** A placement and which saved signature it stamps. */
export interface Stamp extends Placement {
  key: string;
  signatureId: number;
}

export function placeAt(page: number, x: number, y: number, signatureId: number): Stamp {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, page, x: clamp(x, 0, 1), y: clamp(y, 0, 1), width: DEFAULT_WIDTH, rotation: 0, signatureId };
}

export function resize(stamp: Stamp, factor: number): Stamp {
  return { ...stamp, width: clamp(stamp.width * factor, MIN_WIDTH, MAX_WIDTH) };
}

/** Degrees, normalised to (-180, 180]. */
export function turn(stamp: Stamp, by: number): Stamp {
  let r = (stamp.rotation + by) % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return { ...stamp, rotation: Math.round(r * 10) / 10 };
}

/** What the server is sent: ratios only, rounded, the page 0-based. */
export function toPlacements(stamps: Stamp[]): Placement[] {
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return stamps.map((s) => ({ page: s.page, x: r(s.x), y: r(s.y), width: r(s.width), rotation: Math.round(s.rotation) }));
}

export function StampView({
  stamp,
  page,
  imageUri,
  aspect,
  selected,
  onSelect,
  onChange,
  onActive,
}: {
  stamp: Stamp;
  page: { width: number; height: number };
  imageUri: string | null;
  /** width / height of the signature picture. */
  aspect: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: Stamp) => void;
  /**
   * True while a finger is on the stamp: the screen stops scrolling only
   * then. Measured on qa_phone3 2026-11-20: locking the scroll for as long
   * as a stamp was SELECTED left the size bar and Save below the fold at
   * 360 dp, out of reach.
   */
  onActive?: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const start = useRef(stamp);
  const w = stamp.width * page.width;
  const h = w / (aspect || 3);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .averageTouches(true)
    .onBegin(() => {
      start.current = stamp;
      onSelect();
      onActive?.(true);
    })
    .onFinalize(() => onActive?.(false))
    .onUpdate((e) => onChange({ ...start.current, ...latest(), x: clamp(start.current.x + e.translationX / page.width, 0, 1), y: clamp(start.current.y + e.translationY / page.height, 0, 1) }));
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      start.current = stamp;
    })
    .onUpdate((e) => onChange({ ...latest(), width: clamp(start.current.width * e.scale, MIN_WIDTH, MAX_WIDTH) }));
  const rotate = Gesture.Rotation()
    .runOnJS(true)
    .onBegin(() => {
      start.current = stamp;
    })
    .onUpdate((e) => onChange(turn({ ...latest(), rotation: start.current.rotation }, (e.rotation * 180) / Math.PI)));
  const tap = Gesture.Tap().runOnJS(true).onEnd(onSelect);

  // The freshest stamp, so pinch and twist at once do not undo each other.
  const current = useRef(stamp);
  current.current = stamp;
  function latest(): Stamp {
    return current.current;
  }

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate, tap)}>
      <View
        testID="doc-stamp"
        accessible
        accessibilityRole="image"
        accessibilityLabel={t("doc.sign.signature", { n: stamp.page + 1 })}
        accessibilityState={{ selected }}
        style={{
          position: "absolute",
          left: stamp.x * page.width - w / 2,
          top: stamp.y * page.height - h / 2,
          width: w,
          height: h,
          transform: [{ rotate: `${stamp.rotation}deg` }],
          borderWidth: selected ? 1.5 : 0,
          borderStyle: "dashed",
          borderColor: APP_COLORS.doc,
        }}
      >
        {imageUri ? <ExpoImage source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} contentFit="contain" accessible={false} /> : null}
      </View>
    </GestureDetector>
  );
}

/** Resize, turn and remove the selected stamp without a gesture. */
export function StampBar({ onSmaller, onBigger, onTurn, onRemove }: { onSmaller: () => void; onBigger: () => void; onTurn: () => void; onRemove: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const item = (Icon: typeof ZoomIn, label: string, onPress: () => void, id: string, danger = false) => (
    <Pressable
      key={id}
      testID={`doc-stamp-${id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flex: 1, minHeight: metrics.touch, alignItems: "center", justifyContent: "center", gap: 2 }}
    >
      <Icon size={20} color={danger ? colors.danger : colors.ink} />
      <Text variant="caption" tone={danger ? "danger" : "default"} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View testID="doc-stamp-bar" style={{ flexDirection: "row", borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      {item(ZoomOut, t("doc.sign.smaller"), onSmaller, "smaller")}
      {item(ZoomIn, t("doc.sign.bigger"), onBigger, "bigger")}
      {item(RotateCw, t("doc.sign.turn"), onTurn, "turn")}
      {item(Trash2, t("doc.sign.remove"), onRemove, "remove", true)}
    </View>
  );
}
