/**
 * `expo-share-intent`, or nothing — the ONLY place the app touches it.
 *
 * In Expo Go the native module is absent and importing the package throws at
 * launch, taking the whole app down (`config/runtime.ts`). So it is required
 * here, with a literal and inside a `try` (CLAUDE.md: Metro resolves `require`
 * statically; a variable argument does not bundle), and only outside Expo Go.
 * Where it is missing:
 * - the provider renders its children,
 * - the context is the idle one (no files, nothing pending),
 * - the extension key is null, so `+native-intent` redirects nothing.
 *
 * Expo Go therefore offers every way in except the share sheet: Add → Photos,
 * Files, Camera, which is what the Pages screens use anyway.
 */
import type { ReactNode } from "react";
import { IN_EXPO_GO } from "@/config/runtime";

type ShareIntentModule = typeof import("expo-share-intent");
type ContextState = ReturnType<ShareIntentModule["useShareIntentContext"]>;

let mod: ShareIntentModule | null = null;
if (!IN_EXPO_GO) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("expo-share-intent") as ShareIntentModule;
  } catch {
    mod = null;
  }
}

/** True when another app's share sheet can reach this one. */
export const SHARE_INTENT_AVAILABLE = mod != null;

const IDLE: ContextState = {
  isReady: true,
  hasShareIntent: false,
  shareIntent: { files: null, text: null, webUrl: null, type: null, meta: null },
  resetShareIntent: () => {},
  error: null,
};

export function ShareIntentProvider({ children }: { children: ReactNode }) {
  if (!mod) return <>{children}</>;
  const Provider = mod.ShareIntentProvider;
  // Not reset on background: we clear it once the files are queued, not
  // while a folder is being chosen (`ShareIntentBridge`).
  return <Provider options={{ resetOnBackground: false }}>{children}</Provider>;
}

/** Fixed for the life of the process (the module is there or it is not), so
 *  which hook runs never changes between renders. */
export const useShareIntentContext: () => ContextState = mod ? mod.useShareIntentContext : () => IDLE;

export function getShareExtensionKey(): string | null {
  return mod ? mod.getShareExtensionKey() : null;
}
