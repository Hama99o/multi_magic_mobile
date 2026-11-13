/**
 * No screenshots on the secret screens (`SECURITY.md` §7). Android:
 * `FLAG_SECURE` through `expo-screen-capture`, which blacks out screenshots,
 * recordings and the recents thumbnail. iOS cannot block a screenshot; the
 * cover in `SafeZoneGate` hides the app-switcher snapshot.
 *
 * A NATIVE module: a binary built before it was added has no native side.
 * Required with a literal inside a `try` (`readAloud.store.ts` explains why),
 * so SafeZone still opens and the vault says the build cannot protect it.
 */
import { useEffect } from "react";
import { QA_ALLOW_CAPTURE } from "./qaCapture";

interface ScreenCaptureModule {
  preventScreenCaptureAsync: (key?: string) => Promise<void>;
  allowScreenCaptureAsync: (key?: string) => Promise<void>;
}

let native: ScreenCaptureModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native = require("expo-screen-capture") as ScreenCaptureModule;
} catch {
  native = null;
}

export const secureScreen = {
  available: () => typeof native?.preventScreenCaptureAsync === "function",
  prevent: async (key: string): Promise<boolean> => {
    // A local QA build asked to let shots through (`qaCapture.ts`): never in a release.
    if (QA_ALLOW_CAPTURE) return false;
    try {
      await native?.preventScreenCaptureAsync(key);
      return Boolean(native);
    } catch {
      return false;
    }
  },
  allow: async (key: string): Promise<void> => {
    try {
      await native?.allowScreenCaptureAsync(key);
    } catch {
      // Nothing to undo.
    }
  },
};

/** Blocks screen capture while the calling screen is mounted. */
export function useSecureScreen(key: string): void {
  useEffect(() => {
    void secureScreen.prevent(key);
    return () => void secureScreen.allow(key);
  }, [key]);
}
