// EXPECTED TO FAIL LINT — see README.md.
// NativeWind's interop drops a function `style` on Pressable whole.
import { Pressable } from "react-native";

export function Bad() {
  return <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })} />;
}
