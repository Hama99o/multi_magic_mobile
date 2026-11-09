/**
 * A right-edge fade over a horizontal row, so the row reads as "continues
 * this way" rather than as text cut off by a bug (the type chips clipped
 * "Documents" at 411 dp). Drawn with react-native-svg, already a
 * dependency, rather than adding a gradient package for one strip.
 */
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export function LinearFade({ color, width }: { color: string; width: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
      </Svg>
    </View>
  );
}
