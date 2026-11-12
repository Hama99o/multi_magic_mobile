/**
 * The share extension opens the app with `multimagic://dataUrl=<key>…`,
 * which is not a route. Without this, expo-router shows "Unmatched route"
 * over the very screen that should be asking where to save.
 *
 * The path goes to `/share`, a neutral landing: what was shared arrives
 * through `ShareIntentBridge`, which decides where it belongs — a contact
 * card or a number to Contacts, files to Pages (owner, 2026-11-12).
 */
import { getShareExtensionKey } from "@/lib/shareIntent";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const key = getShareExtensionKey();
    if (key && path.includes(`dataUrl=${key}`)) return "/share";
    return path;
  } catch {
    return "/";
  }
}
