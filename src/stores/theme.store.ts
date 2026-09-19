/**
 * System / Light / Dark — his instruction, alongside language.
 *
 * ── Why a store rather than reading the OS ────────────────────────────────
 * `useColors()` resolved straight from `useColorScheme()`, which means the app
 * follows the phone and the person has no say. That is a reasonable default and
 * a poor only-option: `IDENTITY.md` §1 calls DARK the app's own — the palette is
 * read off his icon and the icon's background IS the dark ground — so somebody
 * whose phone is in light mode has never seen the app as it was designed.
 *
 * Three choices, not two. **System is its own answer**, not the absence of one:
 * a phone that switches at sunset should take the app with it, and collapsing
 * that into "light" silently freezes it.
 *
 * ── Persisted, and read before the first paint ────────────────────────────
 * A theme that arrives a frame late is a white flash on a dark app, which is
 * the one moment it is most obvious. `hydrate()` runs in the root layout before
 * the splash is hidden, so the first frame is already the right one.
 */
import { create } from "zustand";
import { Appearance, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "mm-theme";

/**
 * THE NATIVE WINDOW FOLLOWS THE CHOICE — on iOS.
 *
 * `useColors()` resolves our palette from this store, so every View and Text
 * is right whichever mode the phone is in. What that cannot reach is what iOS
 * draws for us: the keyboard, `Alert`, the document and photo pickers, the
 * share sheet. Those read the window's `overrideUserInterfaceStyle`, and with
 * `userInterfaceStyle: "automatic"` in app.json that is the PHONE's setting —
 * so somebody who chose Dark on a light phone types into a white keyboard over
 * a #102125 ground, and every alert is a light box on a dark app.
 *
 * `Appearance.setColorScheme` sets that override on every window
 * (RCTAppearance.mm), and as a consequence `useColorScheme()` agrees with the
 * store too — the two can no longer disagree anywhere. `null` hands control
 * back to the phone, which is what "System" means.
 *
 * iOS only, tonight. On Android the same call goes through
 * `AppCompatDelegate.setDefaultNightMode`, a configuration change, and the
 * Android build is being driven by flows on the one emulator this evening. It
 * can be widened after a device pass; it must not be widened before one.
 */
function applyToNativeWindow(choice: ThemeChoice): void {
  if (Platform.OS !== "ios") return;
  Appearance.setColorScheme(choice === "system" ? null : choice);
}

interface ThemeState {
  choice: ThemeChoice;
  /** False until storage has answered — the root layout waits on this. */
  hydrated: boolean;
  setChoice: (choice: ThemeChoice) => void;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  choice: "system",
  hydrated: false,

  setChoice: (choice) => {
    set({ choice });
    applyToNativeWindow(choice);
    // Fire and forget: the choice is already applied, and a failed write costs
    // the preference on next launch rather than the tap the user just made.
    void AsyncStorage.setItem(KEY, choice).catch(() => {});
  },

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        set({ choice: stored });
        applyToNativeWindow(stored);
      }
    } catch {
      // System is the right fallback: it is what the app did before anybody
      // chose, and it is never wrong, only unopinionated.
    } finally {
      set({ hydrated: true });
    }
  },
}));
