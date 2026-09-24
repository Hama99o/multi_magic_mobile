// EXPECTED TO FAIL LINT — see README.md.
// `StyleSheet.absoluteFillObject` is gone in the React Native SDK 57 ships, and
// spreading the missing name leaves a scrim with no size.
import { Pressable, StyleSheet } from "react-native";

export function Bad() {
  return <Pressable style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "#0008" }} />;
}
