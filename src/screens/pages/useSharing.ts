/**
 * The Share sheet's reads and writes (audit #14), the web's `ShareDialog`
 * queries and mutations. Not optimistic: who has access is the server's
 * answer (an address may become an invite, an invite may already exist), so
 * every write refetches `pagesKeys.sharing(space, node)`, people and links
 * together (revoking a link can remove people too).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shareLinksApi, sharesApi, type PageShare, type SharePermission, type ShareTarget } from "@/api/pageShares";
import { pagesKeys } from "@/api/keys";

export function useShares(target: ShareTarget) {
  return useQuery({ queryKey: pagesKeys.shares(target.spaceId, target.nodeId), queryFn: () => sharesApi.list(target) });
}

export function useShareLinks(target: ShareTarget) {
  return useQuery({ queryKey: pagesKeys.shareLinks(target.spaceId, target.nodeId), queryFn: () => shareLinksApi.list(target) });
}

/** The web's three expiry choices (`ShareDialog` `linkExpiry`). */
export type LinkExpiry = "never" | "7d" | "30d";
export const LINK_EXPIRIES: LinkExpiry[] = ["never", "7d", "30d"];
const DAY_MS = 86_400_000;

/** As the web: now plus 7 or 30 days, ISO; null for never. */
export function expiresAtFor(expiry: LinkExpiry, now: number = Date.now()): string | null {
  const days = expiry === "7d" ? 7 : expiry === "30d" ? 30 : null;
  return days ? new Date(now + days * DAY_MS).toISOString() : null;
}

export function useSharingMutations(target: ShareTarget) {
  const client = useQueryClient();
  const onSettled = () => client.invalidateQueries({ queryKey: pagesKeys.sharing(target.spaceId, target.nodeId) });
  return {
    invite: useMutation({
      mutationFn: (v: { email: string; permission: SharePermission }) => sharesApi.create(target, { email: v.email.trim(), permission: v.permission }),
      onSettled,
    }),
    change: useMutation({
      mutationFn: (v: { share: PageShare; permission: SharePermission }) => sharesApi.update(target, v.share.id, v.permission),
      onSettled,
    }),
    remove: useMutation({ mutationFn: (share: PageShare) => sharesApi.destroy(target, share.id), onSettled }),
    resend: useMutation({ mutationFn: (share: PageShare) => sharesApi.resend(target, share.id), onSettled }),
    createLink: useMutation({
      mutationFn: (v: { permission: SharePermission; expiry: LinkExpiry }) => shareLinksApi.create(target, { permission: v.permission, expiresAt: expiresAtFor(v.expiry) }),
      onSettled,
    }),
    revokeLink: useMutation({
      mutationFn: (v: { linkId: number; revokeAccess: boolean }) => shareLinksApi.destroy(target, v.linkId, v.revokeAccess),
      onSettled,
    }),
  };
}
