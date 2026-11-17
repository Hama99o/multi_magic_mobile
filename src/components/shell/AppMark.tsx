/**
 * An app's badge: its own colour (src/theme/appColors.ts) with its glyph, the
 * assistant's in its coral → pink gradient. The same square in the header,
 * the switcher, the Profile list and on Home, so an app is recognised by one
 * shape everywhere. Home has no app colour of its own: it takes the accent,
 * the app's one colour for "this is MultiMagic".
 */
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ASSISTANT_GRADIENT, tileColors } from "@/theme/appColors";
import { useColors, useScheme } from "@/hooks/useColors";
import { appEntry, type AppKey } from "@/apps/registry";

export function AppMark({ app, size, testID }: { app: AppKey; size: number; testID?: string }) {
  const colors = useColors();
  const scheme = useScheme();
  const Icon = appEntry(app).icon;
  const tint = app === "home" ? { badge: colors.accent, glyph: colors.onAccent } : tileColors(app, scheme);
  const radius = Math.round(size * 0.3);
  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: tint.badge,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {app === "assistant" ? (
        <Svg width={size} height={size} style={{ position: "absolute" }}>
          <Defs>
            <LinearGradient id={`mark-${size}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={ASSISTANT_GRADIENT[0]} />
              <Stop offset="1" stopColor={ASSISTANT_GRADIENT[1]} />
            </LinearGradient>
          </Defs>
          <Rect width={size} height={size} fill={`url(#mark-${size})`} />
        </Svg>
      ) : null}
      <Icon size={Math.round(size * 0.52)} color={tint.glyph} />
    </View>
  );
}
