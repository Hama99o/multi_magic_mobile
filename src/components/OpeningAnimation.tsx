/**
 * THE OPENING: the logo's eight tiles pop, then burst outward and fade,
 * revealing the assistant that has been loading underneath all along.
 *
 * The owner, 2026-09-24: "when you enter the app it shows the icon and then
 * MultiMagic. I don't want this, I want a good animation, like apps with
 * motion done properly... and first thing when we open, it should show the
 * assistant directly." Routing already lands on the assistant (`app/index.tsx`);
 * what was missing was the moment between the static splash and the screen.
 *
 * Rule Zero, Mobbin searched first (2026-09-24):
 * - Pinterest, logged-in splash (`mobbin.com/flows/90bba5c8-df1c-4d15-9edb-78911c7df563`):
 *   the logo with small shapes bursting around it, then straight to the feed.
 * - Arc Search (`mobbin.com/flows/b301625d-6a9f-4edc-9658-384217f1f8e7`): the
 *   logo sweeps in, then the app.
 * - Tubi (`mobbin.com/flows/1dac5696-38d4-4761-8668-4ffc6733676c`): the
 *   wordmark, then a shape transition into home.
 * The tiles are visible from the first frame (a bounce, not a fade-in), so
 * the hand-over from the native splash does not blink.
 * TAKE: short (≈0.45 s), made of the logo's own pieces, and it ENDS BY
 * BECOMING the app: the burst uncovers the real first screen instead of
 * playing and then cutting to it. REJECT: a wordmark reveal or anything that
 * holds the person on a branded screen; the assistant is what they came for.
 *
 * It runs WHILE the app loads (the chat and its skeleton render beneath it),
 * so it covers the wait rather than adding to it. Native driver, opacity and
 * transform only. Reduce Motion: the burst stops, a 150 ms fade. Never blocks a touch
 * (`pointerEvents="none"`) and says nothing to a screen reader.
 *
 * NOT IN EXPO GO'S LAUNCHER. On a phone running the app through Expo Go, the
 * icon + "MultiMagic" screen is Expo Go's own, shown while it downloads the
 * bundle, and no code in this app can style it. This plays after that. In a
 * real build there is no launcher, only our splash and then this.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { FILL } from "@/theme/fill";

/** The logo's tiles, read off `assets/splash-icon-512.png`: a 3×3 grid, the
 *  bottom-right cell empty. Row, column, colour. */
const TILES: { row: number; col: number; color: string }[] = [
  { row: 0, col: 0, color: "#4AB3E3" },
  { row: 0, col: 1, color: "#79B87B" },
  { row: 0, col: 2, color: "#EAAA4C" },
  { row: 1, col: 0, color: "#DC5F87" },
  { row: 1, col: 1, color: "#BE8BC9" },
  { row: 1, col: 2, color: "#4AA9A2" },
  { row: 2, col: 0, color: "#E8DD6E" },
  { row: 2, col: 1, color: "#EA8363" },
];

/** Sized to the native splash icon it replaces (~150 dp across, measured on
 *  `qa_phone4` 2026-09-24), so the hand-over is not a jump in size. */
const TILE = 44;
/** `assets/icon.svg`: 56-unit tiles, 12-unit gaps, 12-unit corners. */
const GAP = Math.round((TILE * 12) / 56);
const RADIUS = Math.round((TILE * 12) / 56);
/** The icon's star, in the bottom-right cell's own 56-unit box (from
 *  `assets/icon.svg`, x − 168, y − 168). */
const STAR =
  "27.5,9.7 32.4,24.2 47.8,24.4 35.5,33.6 40,48.2 27.5,39.4 15,48.2 19.5,33.6 7.2,24.4 22.6,24.2";
/** ≈0.45 s in all. Measured at 0.7 s designed / 1.63 s real, half of it still;
 *  something seen on every open should be short. */
const POP_MS = 130;
const STAGGER_MS = 15;
const BURST_MS = 220;
/** Total, for the test and for anybody tuning it: pop + stagger + burst. */
export const OPENING_MS = POP_MS + STAGGER_MS * (TILES.length - 1) + BURST_MS;

export function OpeningAnimation({ ground, onDone }: { ground: string; onDone: () => void }) {
  const [done, setDone] = useState(false);
  const cover = useRef(new Animated.Value(1)).current;
  const pops = useRef(TILES.map(() => new Animated.Value(0))).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    const finish = () => {
      if (!alive) return;
      setDone(true);
      onDone();
    };
    // STARTED AT ONCE, not after asking about Reduce Motion. Measured
    // 2026-09-24: awaiting that answer while the JS thread was busy with the
    // first load left the tiles frozen for 0.72 s of a 1.63 s opening.
    const burstThenReveal = Animated.sequence([
      // Each tile bounces in turn, the way the grid reads.
      Animated.stagger(
        STAGGER_MS,
        pops.map((p) =>
          Animated.timing(p, {
            toValue: 1,
            duration: POP_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ),
      ),
      // Then out: the tiles fly apart and the ground fades, uncovering the
      // screen that was underneath the whole time.
      Animated.parallel([
        Animated.timing(burst, {
          toValue: 1,
          duration: BURST_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        // EASE-OUT, so the last frames are the smallest step. Measured
        // 2026-09-24, the take ended in a cut; with `Easing.in` the final
        // 16 ms frame dropped opacity by ~0.14, the largest step of the run
        // (inferred as the cut, not isolated).
        Animated.timing(cover, {
          toValue: 0,
          duration: BURST_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);
    burstThenReveal.start(({ finished }) => {
      if (finished) finish();
    });
    // If Reduce Motion turns out to be on, the burst stops where it is and
    // the cover simply fades.
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (!alive || !reduced) return;
        // Redundant in practice: starting a fade on `cover` already stops the
        // parallel it belongs to, and with it the burst (a planted removal
        // stayed green). Said here so it reads as intent, not as the guard.
        burstThenReveal.stop();
        Animated.timing(cover, { toValue: 0, duration: 150, useNativeDriver: true }).start(finish);
      });
    return () => {
      alive = false;
      burstThenReveal.stop();
    };
  }, [burst, cover, onDone, pops]);

  if (done) return null;

  const span = TILE * 3 + GAP * 2;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ ...FILL, backgroundColor: ground, opacity: cover, alignItems: "center", justifyContent: "center" }}
      testID="opening"
    >
      <View style={{ width: span, height: span }}>
        {/* The icon's white star in the empty corner, so the hand-over from
            the native splash (which draws the icon) loses nothing. It stays
            put and fades with the cover; the tiles are what burst. */}
        <Svg
          width={TILE}
          height={TILE}
          viewBox="0 0 56 56"
          style={{ position: "absolute", left: 2 * (TILE + GAP), top: 2 * (TILE + GAP) }}
        >
          <Polygon points={STAR} fill="#FFFFFF" />
        </Svg>
        {TILES.map((tile, i) => {
          // Away from the grid's centre, so the burst reads as the logo opening.
          const dx = (tile.col - 1) * 180;
          const dy = (tile.row - 1) * 180;
          return (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                left: tile.col * (TILE + GAP),
                top: tile.row * (TILE + GAP),
                width: TILE,
                height: TILE,
                borderRadius: RADIUS,
                backgroundColor: tile.color,
                // Visible from the first frame, matching the static splash it
                // replaces: a tile that faded IN would blink the logo away.
                transform: [
                  { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                  { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
                  {
                    scale: Animated.multiply(
                      pops[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.15, 1] }),
                      burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }),
                    ),
                  },
                ],
              }}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}
