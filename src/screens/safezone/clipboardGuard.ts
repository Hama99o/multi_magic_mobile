/**
 * The app's one clipboard guard (`clipboard.ts`), on the real clipboard, and
 * cleared whenever the vault locks.
 */
import { Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { onSafezoneLock } from "@/stores/safezoneLock.store";
import { createClipboardGuard } from "./clipboard";

export const clipboardGuard = createClipboardGuard({
  clipboard: { setStringAsync: (text) => Clipboard.setStringAsync(text), getStringAsync: () => Clipboard.getStringAsync() },
  platform: Platform.OS,
});

onSafezoneLock(() => void clipboardGuard.clearNow());
