/**
 * Every screen is a `<Screen>`. Safe-area insets and the ground colour live
 * here so a screen cannot forget either, and so the app's feel comes from
 * tokens at the root of the tree rather than from each screen.
 *
 * `measure` is the one thing this does that Karwan's does not: IDENTITY.md §8
 * says at 800 dp the content takes a max width and centres rather than
 * stretching. A tablet is the one place a wide screen needs a decision instead
 * of a resize — a 760 dp line of serif text is unreadable.
 */
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors, useMetrics } from "@/hooks/useColors";

export type ScreenProps = {
  children: ReactNode;
  /** Wrap in a ScrollView. Off for screens that own their own list. */
  scroll?: boolean;
  /** Cap the content width and centre it — see the header. */
  measure?: boolean;
  /** Lift content above the keyboard. On for anything with a text field. */
  avoidKeyboard?: boolean;
};

export function Screen({
  children,
  scroll = false,
  measure = true,
  avoidKeyboard = false,
}: ScreenProps) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();

  const inner = (
    <View
      style={{
        flex: 1,
        width: "100%",
        maxWidth: measure ? metrics.maxMeasure : undefined,
        alignSelf: "center",
        // 16dp gutter. At 360 dp this is the difference between a form that
        // breathes and one that touches both edges.
        paddingHorizontal: metrics.space.lg,
      }}
    >
      {children}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {inner}
    </ScrollView>
  ) : (
    inner
  );

  const content = avoidKeyboard ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      // "padding" is right on iOS; on Android the system already resizes the
      // window, and adding padding on top double-counts it and leaves a gap.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.ground,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      {content}
    </View>
  );
}
