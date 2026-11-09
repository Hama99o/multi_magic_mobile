/**
 * FROM ANOTHER APP'S SHARE SHEET INTO PAGES — the owner's main way in.
 * `docs/design/pages/SPEC.md` §3.
 *
 * Photos → Share → MultiMagic. The extension (`expo-share-intent`, configured
 * in `app.json`) copies the files into the app's container and opens the
 * app; this component sees them arrive and sends him to "Save to Pages" with
 * the files already in hand. Nothing is uploaded until he picks a place.
 *
 * Signed out, the files wait: the bridge acts the moment he is signed in,
 * because a share that silently vanishes behind a sign-in screen is the
 * kind of failure nobody reports, they just stop trusting the button.
 *
 * `resetOnBackground: false` (in `lib/shareIntent.tsx`): the intent is cleared by
 * US, once the files are queued (`onDone`), not by the OS moving the app to
 * the background while he is still choosing a folder.
 */
import { useEffect, useRef } from "react";
import { router, usePathname } from "expo-router";
import { useShareIntentContext } from "@/lib/shareIntent";
import { useAuthStore } from "@/stores/auth.store";
import { usePendingImport } from "./addFiles";
import type { IncomingFile } from "@/stores/uploads.store";

export function asFileUri(path: string): string {
  return /^[a-z]+:\/\//i.test(path) ? path : `file://${path}`;
}

export function ShareIntentBridge() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  const setPending = usePendingImport((s) => s.set);
  const handled = useRef<string | null>(null);
  // A cold start from the extension is already ON /pages/save
  // (`app/+native-intent.tsx`); pushing again would stack a second one.
  const pathname = usePathname();
  const onSave = useRef(false);
  onSave.current = pathname === "/pages/save";

  useEffect(() => {
    if (!hasShareIntent || !signedIn) return;
    const files: IncomingFile[] = (shareIntent.files ?? []).map((file) => ({
      uri: asFileUri(file.path),
      name: file.fileName ?? null,
      mimeType: file.mimeType ?? null,
      size: typeof file.size === "number" ? file.size : null,
    }));
    if (files.length === 0) {
      // Text or a link: Pages keeps files. Let it go rather than open an
      // empty picker.
      resetShareIntent();
      return;
    }
    const key = files.map((f) => f.uri).join("|");
    if (handled.current === key) return;
    handled.current = key;
    setPending(files, () => {
      handled.current = null;
      resetShareIntent();
    });
    if (!onSave.current) router.push("/pages/save");
  }, [hasShareIntent, shareIntent, signedIn, setPending, resetShareIntent]);

  return null;
}
