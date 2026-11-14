/**
 * WHO IS SIGNED IN, from the cache (`docs/DATA_LAYER.md`).
 *
 * The profile is server data, so it lives in React Query under
 * `profileKeys.me()`, the same entry the Profile, Change-password and Morning
 * brief screens already read. Until the 2026-11-13 audit, `_layout.tsx`
 * fetched it in an effect and COPIED it into the zustand auth store, so a
 * name or photo changed on Profile reached the header only after a restart.
 *
 * The auth store keeps only the SESSION: the token's status and the identity
 * the sign-in answer carried. That identity is the fallback while the profile
 * loads (and offline), so a header is never blank after signing in.
 */
import { useQuery } from "@tanstack/react-query";
import { profileApi } from "@/api/profile";
import { profileKeys } from "@/api/keys";
import type { CurrentUser } from "@/api/auth";
import { useAuthStore } from "@/stores/auth.store";

/** The profile query itself, for the one place that reads `lang`. */
export function useMeQuery() {
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  return useQuery({ queryKey: profileKeys.me(), queryFn: profileApi.me, enabled: signedIn });
}

export function useMe(): CurrentUser | null {
  const session = useAuthStore((s) => (s.status === "signedIn" ? s.user : null));
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  const { data } = useMeQuery();
  if (!signedIn) return null;
  if (!data) return session;
  return {
    id: data.id,
    email: data.email ?? session?.email ?? "",
    firstName: data.firstName,
    lastName: data.lastName,
    fullName: data.fullName,
    avatar: data.avatar,
  };
}
