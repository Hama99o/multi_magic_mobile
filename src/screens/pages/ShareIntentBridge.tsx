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
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { router, usePathname } from "expo-router";
import { File } from "expo-file-system";
import { useShareIntentContext } from "@/lib/shareIntent";
import { useAuthStore } from "@/stores/auth.store";
import { useSharedIntoContacts } from "@/stores/sharedIntoContacts.store";
import { classifyShare, looksLikeVcard, parseCard, partitionShare, planShare, unreadableFile } from "@/screens/contacts/shareIn";
import { splitCards } from "@/screens/contacts/importer";
import { usePendingImport } from "./addFiles";
import type { IncomingFile } from "@/stores/uploads.store";

export function asFileUri(path: string): string {
  return /^[a-z]+:\/\//i.test(path) ? path : `file://${path}`;
}

/** From the cold-start landing, replace it; from anywhere else, push. */
/** The cached copy of a shared file: there, and how big, as far as the file system can say. */
function onDisk(path: string): { exists: boolean; size: number | null } {
  try {
    const file = new File(asFileUri(path));
    return { exists: file.exists, size: typeof file.size === "number" ? file.size : null };
  } catch {
    return { exists: false, size: null };
  }
}

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
  const { t } = useTranslation();
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

    const shared = shareIntent.files ?? [];
    if (shared.length) {
      const asIncoming = (file: (typeof shared)[number]): IncomingFile => ({
        uri: asFileUri(file.path),
        name: file.fileName ?? null,
        mimeType: file.mimeType ?? null,
        size: typeof file.size === "number" ? file.size : null,
      });
      const toPages = (files: typeof shared) => {
        setPending(files.map(asIncoming), () => {
          handled.current = null;
          resetShareIntent();
        });
      };
      const key = `files:${shared.map((f) => f.path).join("|")}`;
      if (handled.current === key) return;
      handled.current = key;

      // A file that could not be read is said, and let go: never a silent
      // "1 file · 0 B" in Save to Pages, never an empty contact. The rest of
      // the share goes on (`unreadableFile`, device pass 2026-11-13).
      const unreadable = shared.filter((f) => unreadableFile({ path: f.path, size: typeof f.size === "number" ? f.size : null }, onDisk(f.path)));
      if (unreadable.length) {
        Alert.alert(t("shareDoor.unreadableTitle", { count: unreadable.length }), t("shareDoor.unreadableBody", { count: unreadable.length }));
      }
      const readable = shared.filter((f) => !unreadable.includes(f));
      if (!readable.length) {
        handled.current = null;
        resetShareIntent();
        if (fromLanding) router.replace("/");
        return;
      }

      // Contact cards to Contacts, everything else to Pages (contacts SPEC
      // §F.3). Nothing to read: no card, not even a possible one, so it is
      // Pages, at once, exactly as before.
      const parts = partitionShare(readable.map((f) => ({ ...f, mimeType: f.mimeType ?? null, fileName: f.fileName ?? null })));
      if (!parts.cards.length && !parts.sniff.length) {
        toPages(readable);
        if (where.current !== "/pages/save") go("/pages/save", fromLanding);
        return;
      }
      void (async () => {
        // The possible cards: a generic type or plain text. Their first bytes
        // decide (device, 2026-11-12: a content URI named "1000000058").
        const sniffed = new Set<string>();
        for (const f of parts.sniff) {
          try {
            if (looksLikeVcard((await new File(asFileUri(f.path)).text()).slice(0, 64))) sniffed.add(f.path);
          } catch {
            // Unreadable: not a card, so it goes to Pages with the rest.
          }
        }
        const plan = planShare(readable, sniffed);
        let cards: string[] = [];
        try {
          cards = await readCards(plan.cards);
        } catch {
          cards = [];
        }
        if (!cards.length) {
          toPages(readable);
          if (where.current !== "/pages/save") go("/pages/save", fromLanding);
          return;
        }
        setShared(cards.length === 1 ? { kind: "card", card: parseCard(cards[0]) } : { kind: "cards", cards });
        // The rest waits for Pages; the Contacts screen offers it (SharedRestToPages).
        if (plan.pages.length) toPages(plan.pages);
        else {
          handled.current = null;
          resetShareIntent();
        }
        const params: Record<string, string> = { shared: "1" };
        if (plan.pages.length) params.rest = String(plan.pages.length);
        go({ pathname: cards.length === 1 ? "/contacts/edit" : "/contacts/import", params }, fromLanding);
      })();
      return;
    }

    // Every file share returned above; what is left is text.
    if (route.kind === "files" || route.kind === "vcards") return;
    const key = route.text;
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
        const cards = splitCards(route.text);
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
  }, [hasShareIntent, shareIntent, signedIn, setPending, setShared, resetShareIntent, t]);

  return null;
}
