/**
 * The app's one clipboard guard (`clipboard.ts`), on the real clipboard, and
 * cleared whenever the vault locks.
 *
 * Its pending clear is also written down (`clipboardMarker.ts`): a keyed MAC
 * of the copy and the deadline, in the secure store, so a copy left by a
 * killed app is cleared the next time MultiMagic opens (device pass D12,
 * 2026-11-13). `wireClipboardSweep()` runs from the root layout, once at
 * launch and on every return to the foreground, wherever the app is: the
 * person may come back to Home, not to SafeZone.
 */
import { AppState, Platform, type NativeEventSubscription } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { onSafezoneLock } from "@/stores/safezoneLock.store";
import { createClipboardGuard } from "./clipboard";
import { createClipboardMarker } from "./clipboardMarker";

const marker = createClipboardMarker({
  store: SecureStore,
  digest: async (bytes) => new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, Uint8Array.from(bytes))),
  randomBytes: (n) => Crypto.getRandomBytes(n),
});

export const clipboardGuard = createClipboardGuard({
  clipboard: { setStringAsync: (text) => Clipboard.setStringAsync(text), getStringAsync: () => Clipboard.getStringAsync() },
  platform: Platform.OS,
  marker,
});

onSafezoneLock(() => void clipboardGuard.clearNow());

let foregroundSub: NativeEventSubscription | null = null;

/** Once, from `app/_layout.tsx`: sweep now and on every return to the app. */
export function wireClipboardSweep(): void {
  void clipboardGuard.sweep();
  if (!foregroundSub) {
    foregroundSub = AppState.addEventListener("change", (status) => {
      if (status === "active") void clipboardGuard.sweep();
    });
  }
}
