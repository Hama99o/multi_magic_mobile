/**
 * PHOTOS, AS DRIVE SHOWS THEM (QA_DEEP #10): dark and full width, swipe to
 * the next photo in the same folder, pinch to zoom, drag when zoomed,
 * double-tap to zoom in and back out.
 *
 * Built on React Native's own `PanResponder` and `Animated`, not on
 * gesture-handler/Reanimated: neither is used anywhere else in this app yet
 * (no `GestureHandlerRootView` at the root), and the two built-ins behave the
 * same on iOS and Android. A `ScrollView`'s `maximumZoomScale` would have
 * been simpler, but it zooms on iOS only.
 *
 * The strip is a paging `FlatList` of the folder's images, in the folder's
 * default order (name, ascending), starting on the one that was tapped.
 * While a photo is zoomed, the strip stops paging, so a drag moves the photo
 * instead of changing it.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, FlatList, PanResponder, Pressable, View, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { Image as ExpoImage } from "expo-image";
import type { PageNode } from "@/api/pages";

const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_SCALE = 2.5;

/** Distance between two touches, for the pinch. Pure, so it is tested. */
export function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** Keep a zoom within 1×–4×. */
export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(1, scale));
}

function ZoomableImage({ node, width, height, onZoomChange }: { node: PageNode; width: number; height: number; onZoomChange: (zoomed: boolean) => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const state = useRef({ scale: 1, x: 0, y: 0, pinchStart: 0, scaleStart: 1, lastTap: 0 });

  const settle = useCallback(
    (next: number, x = 0, y = 0) => {
      state.current.scale = next;
      state.current.x = x;
      state.current.y = y;
      Animated.parallel([
        Animated.spring(scale, { toValue: next, useNativeDriver: true, friction: 7 }),
        Animated.spring(tx, { toValue: x, useNativeDriver: true, friction: 7 }),
        Animated.spring(ty, { toValue: y, useNativeDriver: true, friction: 7 }),
      ]).start();
      onZoomChange(next > 1.01);
    },
    [scale, tx, ty, onZoomChange],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Two fingers always; one finger only once zoomed (else the strip pages).
        onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2 || state.current.scale > 1.01,
        onPanResponderGrant: (e) => {
          state.current.pinchStart = touchDistance(e.nativeEvent.touches);
          state.current.scaleStart = state.current.scale;
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches.length === 2) {
            if (!state.current.pinchStart) {
              state.current.pinchStart = touchDistance(touches);
              state.current.scaleStart = state.current.scale;
            }
            const next = clampScale((state.current.scaleStart * touchDistance(touches)) / state.current.pinchStart);
            state.current.scale = next;
            scale.setValue(next);
          } else if (state.current.scale > 1.01) {
            tx.setValue(state.current.x + g.dx);
            ty.setValue(state.current.y + g.dy);
          }
        },
        onPanResponderRelease: (_e, g) => {
          state.current.pinchStart = 0;
          if (state.current.scale <= 1.01) {
            settle(1);
            return;
          }
          // Keep the photo on screen: at most half its overflow either way.
          const maxX = (width * (state.current.scale - 1)) / 2;
          const maxY = (height * (state.current.scale - 1)) / 2;
          const x = Math.max(-maxX, Math.min(maxX, state.current.x + g.dx));
          const y = Math.max(-maxY, Math.min(maxY, state.current.y + g.dy));
          settle(state.current.scale, x, y);
        },
        onPanResponderTerminationRequest: () => state.current.scale <= 1.01,
      }),
    [scale, tx, ty, settle, width, height],
  );

  const onTap = useCallback(
    (_e: GestureResponderEvent) => {
      const now = Date.now();
      if (now - state.current.lastTap < DOUBLE_TAP_MS) {
        settle(state.current.scale > 1.01 ? 1 : DOUBLE_TAP_SCALE);
        state.current.lastTap = 0;
      } else {
        state.current.lastTap = now;
      }
    },
    [settle],
  );

  return (
    <Pressable onPress={onTap} style={{ width, height, overflow: "hidden" }} accessibilityLabel={node.title} testID="pages-gallery-image">
      <Animated.View {...responder.panHandlers} style={{ width, height, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>
        {node.attachmentUrl ? <ExpoImage source={{ uri: node.attachmentUrl }} style={{ width, height }} contentFit="contain" transition={150} recyclingKey={String(node.id)} /> : null}
      </Animated.View>
    </Pressable>
  );
}

export function ImageGallery({ images, startId, onShown }: { images: PageNode[]; startId: number; onShown: (node: PageNode) => void }) {
  const { t } = useTranslation();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoomed, setZoomed] = useState(false);
  const start = Math.max(0, images.findIndex((n) => n.id === startId));
  const [index, setIndex] = useState(start);

  const onEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!size.width) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / size.width);
      if (next !== index && images[next]) {
        setIndex(next);
        onShown(images[next]);
      }
    },
    [size.width, index, images, onShown],
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }} onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} testID="pages-gallery">
      {size.width > 0 ? (
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          initialScrollIndex={start}
          getItemLayout={(_d, i) => ({ length: size.width, offset: size.width * i, index: i })}
          keyExtractor={(n) => String(n.id)}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onEnd}
          renderItem={({ item }) => <ZoomableImage node={item} width={size.width} height={size.height} onZoomChange={setZoomed} />}
          testID="pages-gallery-strip"
        />
      ) : null}
      {images.length > 1 ? (
        <View pointerEvents="none" style={{ position: "absolute", bottom: 12, alignSelf: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.55)" }}>
          <Animated.Text style={{ color: "#FFFFFF", fontSize: 13 }} accessibilityLabel={t("pages.view.position", { n: index + 1, total: images.length })} testID="pages-gallery-position">
            {t("pages.view.position", { n: index + 1, total: images.length })}
          </Animated.Text>
        </View>
      ) : null}
    </View>
  );
}
