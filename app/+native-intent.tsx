/**
 * The share extension opens the app with `multimagic://dataUrl=<key>…`,
 * which is not a route. Without this, expo-router shows "Unmatched route"
 * over the very screen that should be asking where to save.
 *
 * The path goes to `/pages/save`; the files themselves arrive through
 * `ShareIntentBridge`, which owns what happens next.
 */
import { getShareExtensionKey } from "@/lib/shareIntent";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const key = getShareExtensionKey();
    if (key && path.includes(`dataUrl=${key}`)) return "/pages/save";
    return path;
  } catch {
    return "/";
  }
}
