// EXPECTED TO FAIL LINT — see README.md.
// KeyboardAvoidingView "height" on Android: measured 2026-11-21 leaving Save
// under the keyboard (Pages text editor, flow 33). Both spellings are flagged.
import { KeyboardAvoidingView, Platform, View } from "react-native";

export function Bad() {
  return (
    <View>
      <KeyboardAvoidingView behavior="height" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} />
    </View>
  );
}
