/**
 * Saves where the person is as they move between apps, so the next cold start
 * reopens there (CLAUDE.md, "Reopening the app"). Mounted once, in
 * app/_layout.tsx. Screens that are not places (Home, the assistant, the
 * account screens, sign-in) save nothing, so they leave the last app as it was.
 */
import { useEffect } from "react";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";
import { useLastPlace } from "@/stores/lastPlace.store";
import { useMe } from "@/hooks/useMe";
import { placeFor } from "./lastPlace";

export function PlaceRecorder(): null {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  const userId = useMe()?.id ?? null;
  const key = JSON.stringify([pathname, params]);
  useEffect(() => {
    if (!signedIn) return;
    const draft = placeFor(pathname, params);
    if (draft) void useLastPlace.getState().record(draft, userId);
    // `key` stands for pathname + params, which are new objects every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, signedIn, userId]);
  return null;
}
