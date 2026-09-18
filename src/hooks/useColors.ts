/**
 * The palette, resolved for the current colour scheme.
 *
 * Karwan's version resolves per ROLE as well as per scheme; this app has no
 * roles, so it is one lookup. The indirection stays because the reason does: a
 * screen names a token, never a hex value, so a palette change is one file.
 */
import { useColorScheme } from "react-native";
import { METRICS, TOKENS, type Tokens } from "@/theme/tokens";

export function useColors(): Tokens {
  // `useColorScheme()` returns null before the native module answers, and on a
  // device that null is a real frame. Dark is the app's designed default
  // (IDENTITY §1), so falling back to it means the first frame is never the
  // wrong one on the mode this app was built in.
  return TOKENS[useColorScheme() === "light" ? "light" : "dark"];
}

export function useMetrics(): typeof METRICS {
  return METRICS;
}
