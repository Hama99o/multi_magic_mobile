// EXPECTED TO FAIL LINT — see README.md.
// On Android the text-selection ActionMode takes the long press first.
import { Pressable, Text } from "react-native";

export function Bad({ onLongPress }: { onLongPress: () => void }) {
  return (
    <Pressable onLongPress={onLongPress}>
      <Text selectable>a message somebody wants to react to</Text>
    </Pressable>
  );
}
