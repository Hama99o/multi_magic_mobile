/**
 * The only decision at launch: signed in or not, and where.
 *
 * `_layout` has already resolved `status` from the keystore, and read the
 * last place from the phone, before this renders, so there is no third
 * "still deciding" state to flash here.
 *
 * Signed in, the app reopens in the last app the person was in, never Home
 * when one is known (owner, 2026-11-17: "not home page, it's very
 * important"; CLAUDE.md "Reopening the app"). Its root opens at once; a saved
 * record is then re-opened over it once fetched again. A deep link never
 * reaches this screen, so a link, a share or a notification always wins.
 */
import { useEffect } from "react";
import { Redirect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { useLastPlace } from "@/stores/lastPlace.store";
import { restoreSub, rootHref } from "@/apps/lastPlace";

export default function Index() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const saved = useLastPlace((s) => s.place);
  const queryClient = useQueryClient();
  // Another account's place is not this one's (a reinstall, a crash before
  // the sign-out was written): only when both are known can they differ.
  const place = status === "signedIn" && saved && !(userId != null && saved.userId != null && saved.userId !== userId) ? saved : null;

  useEffect(() => {
    if (place) void restoreSub(place, queryClient);
  }, [place, queryClient]);

  if (status !== "signedIn") return <Redirect href="/sign-in" />;
  // The saved root is one of the app roots `placeFor` allows (src/apps/lastPlace.ts).
  return <Redirect href={(place ? rootHref(place) : "/home") as "/home"} />;
}
