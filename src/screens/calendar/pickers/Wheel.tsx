/**
 * One column of a time wheel (WhatsApp, Evernote, Nextdoor — SPEC §B).
 *
 * A snapping vertical list, five rows tall with the chosen one in the middle
 * band. Three ways to set it, so no one way has to be perfect:
 *   - scroll and let it snap (the platform gesture);
 *   - TAP a row (the precise one, and the one a test can drive);
 *   - with a screen reader, swipe up / down: the column is ONE `adjustable`
 *     element that says its value, which is how iOS's own picker reads.
 */
import { useEffect, useRef } from "react";
import { ScrollView, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export const ROW = 40;
const VISIBLE = 5;

export interface WheelItem<T extends string | number> {
  value: T;
  label: string;
}

export function Wheel<T extends string | number>({
  items,
  value,
  onChange,
  label,
  testID,
  width = 64,
}: {
  items: WheelItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  testID: string;
  width?: number;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const scroller = useRef<ScrollView>(null);
  const index = Math.max(0, items.findIndex((item) => item.value === value));
  const lastIndex = useRef(index);

  // Follow a value changed from outside (another column, a reset).
  useEffect(() => {
    if (lastIndex.current !== index) {
      lastIndex.current = index;
      scroller.current?.scrollTo({ y: index * ROW, animated: true });
    }
  }, [index]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(items.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.y / ROW)));
    if (next !== lastIndex.current) {
      lastIndex.current = next;
      onChange(items[next].value);
    }
  };

  const step = (delta: number) => {
    const next = Math.min(items.length - 1, Math.max(0, index + delta));
    if (next !== index) onChange(items[next].value);
  };

  return (
    // An UNNAMED parent: naming it would group the rows inside it, and on iOS
    // a named group hides its controls (`a11y.test.tsx`, ACCESSIBILITY.md N1).
    <View testID={testID} style={{ width, height: ROW * VISIBLE }}>
      <ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        nestedScrollEnabled
        contentOffset={{ x: 0, y: index * ROW }}
        contentContainerStyle={{ paddingVertical: ROW * 2 }}
        onMomentumScrollEnd={settle}
        // Android delivers no momentum event when the finger lifts without a
        // fling, so the drag's own end has to settle it too.
        onScrollEndDrag={settle}
        // The rows are for fingers; a screen reader gets the one adjustable
        // element below instead of 24 separate hours.
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {items.map((item, at) => (
          <Pressable
            key={String(item.value)}
            testID={`${testID}-${item.value}`}
            onPress={() => onChange(item.value)}
            accessibilityLabel={item.label}
            style={{ height: ROW, alignItems: "center", justifyContent: "center" }}
          >
            <Text variant={at === index ? "title" : "body"} tone={at === index ? "default" : "muted"} style={{ fontSize: at === index ? 20 : 17, fontVariant: ["tabular-nums"] }}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {/* The selection band, and the column's ONE accessibility element: it
          says its value and moves with a swipe up or down, as iOS's own
          picker does. `pointerEvents="none"` keeps fingers on the rows. */}
      <View
        testID={`${testID}-adjust`}
        pointerEvents="none"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: items[index]?.label ?? "" }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => step(event.nativeEvent.actionName === "increment" ? 1 : -1)}
        style={{ position: "absolute", left: 0, right: 0, top: ROW * 2, height: ROW, borderRadius: metrics.radius.sm, backgroundColor: colors.border, opacity: 0.45 }}
      />
    </View>
  );
}
