/**
 * The palette, resolved for the current colour scheme.
 *
 * Karwan's version resolves per ROLE as well as per scheme; this app has no
 * roles, so it is one lookup. The indirection stays because the reason does: a
 * screen names a token, never a hex value, so a palette change is one file.
 */
import { useColorScheme } from "react-native";
import { METRICS, TOKENS, type Tokens } from "@/theme/tokens";
import { useThemeStore } from "@/stores/theme.store";

/**
 * Which palette is in force: the user's choice, or the phone's when they have
 * chosen "system".
 *
 * This is the ONE place a colour is resolved, which is what makes a theme
 * chooser a store and a hook rather than a change to every screen — and why
 * `useColors()` keeps the signature it has always had.
 */
export function useScheme(): "light" | "dark" {
  const choice = useThemeStore((s) => s.choice);
  const system = useColorScheme();

  if (choice === "light" || choice === "dark") return choice;
  // `useColorScheme()` returns null before the native module answers, and on a
  // device that null is a real frame. Dark is the app's designed default
  // (IDENTITY §1), so falling back to it means the first frame is never the
  // wrong one on the mode this app was built in.
  return system === "light" ? "light" : "dark";
}

export function useColors(): Tokens {
  return TOKENS[useScheme()];
}

export function useMetrics(): typeof METRICS {
  return METRICS;
}
