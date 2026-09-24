// EXPECTED TO PASS — the legitimate forms of everything the rules forbid.
// A rule that fires on these is over-broad, which this test catches too.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

// A literal require of a name written out: the form the app actually uses.
let audio: unknown = null;
try {
  audio = require("expo-audio");
} catch {
  audio = null;
}
export { audio };

// A plain object style, with `pressed` tracked in state instead.
export function ObjectStyle() {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ opacity: pressed ? 0.5 : 1 }}
    />
  );
}

// `selectable` with NO long press anywhere near it — the assistant's answer,
// the question bubble, the privacy text.
export function SelectableWithoutLongPress() {
  return (
    <View>
      <Text selectable>an answer somebody may want to copy</Text>
    </View>
  );
}

// Accessibility strings that come from t(), and data-derived ones.
declare function t(key: string, values?: Record<string, unknown>): string;
export function TranslatedNames({ title, when }: { title: string; when: string }) {
  return (
    <View>
      <Pressable accessibilityHint={t("calendar.eventHint")} />
      <Pressable accessibilityLabel={t("calendar.event", { title, when })} />
      <Pressable accessibilityLabel={`${title}, ${when}`} />
      <Pressable accessibilityLabel={title ?? ""} />
    </View>
  );
}

// Covering the parent, the forms that survive SDK 57.
const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;
export function Scrims() {
  return (
    <View>
      <Pressable style={{ ...FILL, backgroundColor: "#0008" }} />
      <View style={StyleSheet.absoluteFill} />
    </View>
  );
}
