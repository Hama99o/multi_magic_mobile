// EXPECTED TO FAIL LINT — see README.md.
// A sentence written straight into <Text> ships untranslated.
import { Text } from "react-native";

export function Bad() {
  return <Text>No conversations yet</Text>;
}
