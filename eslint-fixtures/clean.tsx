// EXPECTED TO PASS — the legitimate forms of everything the rules forbid.
// A rule that fires on these is over-broad, which this test catches too.
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import Animated, { FadeIn } from "react-native-reanimated";

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
export function SelectableWithoutLongPress({ answer }: { answer: string }) {
  return (
    <View>
      <Text selectable>{answer}</Text>
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

// Icons: a TYPE import from the index is erased, so it is allowed.
export type AnyIcon = LucideIcon;

// Text children that are not words: a separator, and a value.
export function NotWords({ count }: { count: number }) {
  return (
    <View>
      <Text> · </Text>
      <Text>{count}</Text>
    </View>
  );
}

// Requests: a mutation's mutate() from an effect, a pure parser in an effect,
// and an API call in an event handler, are all allowed (api-in-effect).
declare const messagesApi: { parseOne: (raw: unknown) => { id: number } };
declare const markRead: { mutate: (id: number) => void };
declare const pagesApi: { trash: (id: number) => Promise<void> };
export function NotRequestsInEffects({ id, frame }: { id: number; frame: unknown }) {
  useEffect(() => {
    markRead.mutate(id);
    messagesApi.parseOne(frame);
  }, [id, frame]);
  return <Pressable onPress={() => void pagesApi.trash(id)} />;
}

// A list's empty state and a one-off card may animate: neither is a recycled
// cell, and neither reads an index.
export function EmptyFade() {
  return <Animated.View entering={FadeIn.duration(260)} />;
}

// Keyboard: "padding" is allowed (kav-height): it computes the overlap from
// the keyboard's own position, so it is 0 wherever the window did resize.
export function PaddingIsFine() {
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} />;
}

// pane-nav: a type-only router, the other expo-router names, and the hooks themselves.
import type { router as RouterType } from "expo-router";
import { Link, useNavigation, usePathname } from "expo-router";
import { useNav, useNavParams } from "@/lib/nav";
export type PushTarget = Parameters<typeof RouterType.push>[0];
export function PaneSafe() {
  const nav = useNav();
  const { id } = useNavParams<{ id: string }>();
  const navigation = useNavigation();
  const path = usePathname();
  return <Link href="/" onPress={() => nav.push("/notes")}>{`${id}${path}${navigation ? "" : ""}`}</Link>;
}
