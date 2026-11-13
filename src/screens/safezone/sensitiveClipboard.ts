/**
 * Copy marked sensitive on Android 13+, so the system's clipboard preview does
 * not show a SafeZone secret over other apps (`SECURITY.md` §6). Through the
 * local module `modules/sensitive-clipboard`, because `expo-clipboard` 57 has
 * no option for the flag. Everywhere the module is not (iOS, a build made
 * before it, a failure), the copy goes through `expo-clipboard` as before:
 * a copy must never fail because the preview could not be hidden.
 */
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import * as Clipboard from "expo-clipboard";

interface SensitiveNative {
  setSensitiveStringAsync: (text: string) => Promise<boolean>;
}

export function createSensitiveSetter(opts: { native: SensitiveNative | null; platform: string; fallback: (text: string) => Promise<boolean> }) {
  return async (text: string): Promise<boolean> => {
    if (opts.platform === "android" && opts.native) {
      try {
        return await opts.native.setSensitiveStringAsync(text);
      } catch {
        // Fall through: copied without the flag rather than not at all.
      }
    }
    return opts.fallback(text);
  };
}

export const sensitiveSetString = createSensitiveSetter({
  native: requireOptionalNativeModule<SensitiveNative>("SensitiveClipboard"),
  platform: Platform.OS,
  fallback: (text) => Clipboard.setStringAsync(text),
});
