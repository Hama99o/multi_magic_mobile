/**
 * WHO MAY DO WHAT IN PAGES — the web's rule, not a guess (multi_magic
 * `drive/Drive.tsx` "Permissions", `drive/menus.ts` `buildItemMenu` /
 * `buildNewMenu`):
 *
 *   permission       write (rename, star, "+")   move / trash
 *   owner, admin     yes                          yes
 *   editor           yes                          no
 *   viewer           no                           no
 *
 * Share (people and links, audit #14) is the space OWNER's alone, for the
 * space and every node in it: `PageApp::SharePolicy` and `ShareLinkPolicy`
 * are `owner?` throughout, so an admin is refused (403). The web offers
 * "Share" on a node to anyone who can write and lets the server refuse; the
 * phone offers it only where it will work.
 *
 * The permission is the API's own word (`current_user_permission`, sent by a
 * space's `show` only; the list of spaces is the caller's OWN spaces, so a
 * row there is always "owner").
 *
 * Unknown reads as the least access, as on the web: a control appearing a
 * moment late beats one that answers 403. One exception, also the web's: a
 * space in the caller's own list is theirs before its detail has loaded.
 *
 * The drive-wide lists (Recent, Starred, Search) mix spaces, and there the
 * web grants writes on the caller's OWN spaces only (`canWriteNode` /
 * `canMoveNode` with `ownedIds`), so a shared space's items are read-only
 * there whatever the share says. Matched, not improved on.
 */
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { pagesApi, type PageNode, type SpacePermission } from "@/api/pages";
import { pagesKeys } from "@/api/keys";

export interface Rights {
  /** Rename, star, add here ("+", New folder). */
  canWrite: boolean;
  /** Move and Move to trash: owner/admin only. */
  canMove: boolean;
  /** People and links: the space's owner only (`SharePolicy`). */
  canShare: boolean;
}

export const NO_RIGHTS: Rights = { canWrite: false, canMove: false, canShare: false };
const ALL_RIGHTS: Rights = { canWrite: true, canMove: true, canShare: true };

export function rightsFor(permission: SpacePermission | null | undefined): Rights {
  switch (permission) {
    case "owner":
      return ALL_RIGHTS;
    case "admin":
      return { canWrite: true, canMove: true, canShare: false };
    case "editor":
      return { canWrite: true, canMove: false, canShare: false };
    default:
      return NO_RIGHTS;
  }
}

/** Every space the caller owns, every page of it (the web asks for 200 at once). */
async function allOwnedSpaceIds(): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const result = await pagesApi.spaces(page, { perPage: 200, sortBy: "name", sortDir: "asc" });
    ids.push(...result.rows.map((s) => s.id));
    if (!result.hasMore) break;
  }
  return ids;
}

/** The ids of the caller's own spaces; null while unknown. */
export function useOwnedSpaceIds(): Set<number> | null {
  const owned = useQuery({ queryKey: pagesKeys.spacesFor("owned"), queryFn: allOwnedSpaceIds, staleTime: 30_000 });
  return useMemo(() => (owned.data ? new Set(owned.data) : null), [owned.data]);
}

/** A folder view: the space's own permission. */
export function useSpaceRights(spaceId: number): Rights {
  const owned = useOwnedSpaceIds();
  const space = useQuery({
    queryKey: pagesKeys.space(spaceId),
    queryFn: () => pagesApi.space(spaceId),
    enabled: Number.isFinite(spaceId),
  });
  const permission = space.data?.permission ?? (owned?.has(spaceId) ? "owner" : null);
  return rightsFor(permission);
}

/** Recent, Starred, Search: per item, from the caller's own spaces. */
export function useDriveRights(): (node: PageNode) => Rights {
  const owned = useOwnedSpaceIds();
  return useCallback((node: PageNode) => (owned?.has(node.spaceId) ? ALL_RIGHTS : NO_RIGHTS), [owned]);
}
