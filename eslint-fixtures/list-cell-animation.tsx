// EXPECTED TO FAIL — a layout animation on a recycled list cell, three ways.
import { FlatList, SectionList, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";

// 1. Inline in renderItem: the shape 1.3.0 shipped eight times.
export function Inline({ rows }: { rows: string[] }) {
  return (
    <FlatList
      data={rows}
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 35)}>
          <Text>{item}</Text>
        </Animated.View>
      )}
    />
  );
}

// 2. A section header leaving.
export function Sections({ sections }: { sections: { title: string; data: string[] }[] }) {
  return (
    <SectionList
      sections={sections}
      renderItem={({ item }) => <Text>{item}</Text>}
      renderSectionHeader={({ section }) => (
        <Animated.View exiting={FadeOut}>
          <Text>{section.title}</Text>
        </Animated.View>
      )}
    />
  );
}

// 3. A row component that staggers itself by its index (GroupCard, SafeZone's Row).
export function Row({ label, index }: { label: string; index: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 35)}>
      <View>
        <Text>{label}</Text>
      </View>
    </Animated.View>
  );
}
