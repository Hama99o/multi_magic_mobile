/**
 * FROM ANOTHER APP'S SHARE SHEET INTO MULTIMAGIC — one door, a router behind
 * it (`docs/design/pages/SPEC.md` §3, `docs/design/contacts/SPEC.md` §F).
 *
 * The extension (`expo-share-intent`, configured in `app.json`) copies what
 * was shared into the app's container and opens the app; this component sees
 * it arrive and sends it where it belongs (`classifyShare`):
 *
 * - a contact card (.vcf, or vCard text) → Contacts: one card opens a
 *   filled-in new contact, several go through the bulk import;
 * - a text holding a phone number or an email → "add as a contact";
 * - photos, videos, documents → "Save to Pages" with the files in hand.
 *   Nothing is uploaded until he picks a place;
 * - plain text with neither → let go: Pages keeps files, not sentences.
 *
 * Signed out, the share waits: the bridge acts the moment he is signed in,
 * because a share that silently vanishes behind a sign-in screen is the
 * kind of failure nobody reports, they just stop trusting the button.
 *
 * `resetOnBackground: false` (in `lib/shareIntent.tsx`): the intent is cleared by
 * US, once handed over, not by the OS moving the app to the background while
 * he is still choosing a folder.
 */
import { useEffect, useRef } from "react";
import { router, usePathname } from "expo-router";
import { File } from "expo-file-system";
import { useShareIntentContext } from "@/lib/shareIntent";
import { useAuthStore } from "@/stores/auth.store";
import { useSharedIntoContacts } from "@/stores/sharedIntoContacts.store";
import { classifyShare, parseCard, unknownType } from "@/screens/contacts/shareIn";
import { splitCards } from "@/screens/contacts/importer";
import { usePendingImport } from "./addFiles";
import type { IncomingFile } from "@/stores/uploads.store";

export function asFileUri(path: string): string {
  return /^[a-z]+:\/\//i.test(path) ? path : `file://${path}`;
}

/** From the cold-start landing, replace it; from anywhere else, push. */
function go(target: Parameters<typeof router.push>[0], fromLanding: boolean) {
  if (fromLanding) router.replace(target);
  else router.push(target);
}

async function readCards(uris: string[]): Promise<string[]> {
  const cards: string[] = [];
  for (const uri of uris) cards.push(...splitCards(await new File(uri).text()));
  return cards;
}

export function ShareIntentBridge() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  const setPending = usePendingImport((s) => s.set);
  const setShared = useSharedIntoContacts((s) => s.set);
  const handled = useRef<string | null>(null);
  // A cold start from the extension lands on `/share` (`app/+native-intent.tsx`);
  // an older build may still land on `/pages/save`. Pushing on top of either
  // would stack a second screen.
  const pathname = usePathname();
  const where = useRef(pathname);
  useEffect(() => {
    where.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!hasShareIntent || !signedIn) return;
    const route = classifyShare({
      files: (shareIntent.files ?? []).map((f) => ({ path: f.path, mimeType: f.mimeType ?? null, fileName: f.fileName ?? null })),
      text: shareIntent.text ?? null,
    });
    const fromLanding = where.current === "/share";

    if (route.kind === "nothing") {
      resetShareIntent();
      if (fromLanding) router.replace("/");
      return;
    }

    // A file with no useful type or name may still be a contact card: read
    // its first bytes before handing it to Pages (device, 2026-11-12).
    const shared = shareIntent.files ?? [];
    if (route.kind === "files" && shared.length && shared.every((f) => unknownType({ path: f.path, mimeType: f.mimeType, fileName: f.fileName }))) {
      const key = `sniff:${shared.map((f) => f.path).join("|")}`;
      if (handled.current === key) return;
      handled.current = key;
      void (async () => {
        let cards: string[] = [];
        try {
          cards = await readCards(shared.map((f) => asFileUri(f.path)));
        } catch {
          cards = [];
        }
        handled.current = null;
        if (cards.length) {
          setShared(cards.length === 1 ? { kind: "card", card: parseCard(cards[0]) } : { kind: "cards", cards });
          resetShareIntent();
          go(cards.length === 1 ? { pathname: "/contacts/edit", params: { shared: "1" } } : { pathname: "/contacts/import", params: { shared: "1" } }, fromLanding);
          return;
        }
        // Not a card (or unreadable): Pages, as before.
        setPending(shared.map((file) => ({ uri: asFileUri(file.path), name: file.fileName ?? null, mimeType: file.mimeType ?? null, size: typeof file.size === "number" ? file.size : null })), () => {
          handled.current = null;
          resetShareIntent();
        });
        if (where.current !== "/pages/save") go("/pages/save", fromLanding);
      })();
      return;
    }

    if (route.kind === "files") {
      const files: IncomingFile[] = (shareIntent.files ?? []).map((file) => ({
        uri: asFileUri(file.path),
        name: file.fileName ?? null,
        mimeType: file.mimeType ?? null,
        size: typeof file.size === "number" ? file.size : null,
      }));
      const key = files.map((f) => f.uri).join("|");
      if (handled.current === key) return;
      handled.current = key;
      setPending(files, () => {
        handled.current = null;
        resetShareIntent();
      });
      if (where.current !== "/pages/save") go("/pages/save", fromLanding);
      return;
    }

    const key = route.kind === "vcards" ? route.files.join("|") : route.text;
    if (handled.current === key) return;
    handled.current = key;

    if (route.kind === "bits") {
      setShared({ kind: "bits", text: route.text, phones: route.phones, emails: route.emails });
      resetShareIntent();
      handled.current = null;
      go("/contacts/shared", fromLanding);
      return;
    }

    void (async () => {
      try {
        const cards = route.kind === "vcards" ? await readCards(route.files) : splitCards(route.text);
        if (cards.length === 1) {
          setShared({ kind: "card", card: parseCard(cards[0]) });
          go({ pathname: "/contacts/edit", params: { shared: "1" } }, fromLanding);
        } else if (cards.length > 1) {
          setShared({ kind: "cards", cards });
          go({ pathname: "/contacts/import", params: { shared: "1" } }, fromLanding);
        } else if (fromLanding) {
          router.replace("/");
        }
      } catch {
        // An unreadable file: say nothing rather than open an empty form; the
        // landing goes home on its own.
      } finally {
        handled.current = null;
        resetShareIntent();
      }
    })();
  }, [hasShareIntent, shareIntent, signedIn, setPending, setShared, resetShareIntent]);

  return null;
}
