/**
 * WHERE A SHARED FILE CAN GO — the logic behind Save to Pages
 * (`app/pages/save.tsx`), kept apart so it can be tested without a screen.
 *
 * Two facts from the server decide it (`multi_magic`, read 2026-11-06):
 * - `GET /spaces` lists only the spaces the user OWNS
 *   (`SpacePolicy::Scope#resolve`: `where(owner: user)`). Spaces other people
 *   shared come from `GET /spaces/shared_with_me`, one row per share, a whole
 *   space or one folder, each with its permission. The old picker read only
 *   the first list, so a shared space never appeared at all.
 * - Adding a file needs `owner? || editor/admin` (`NodePolicy#create?`).
 *   A viewer's upload would fail on the server after the bytes went up, so
 *   the picker shows those places greyed out with the reason instead of
 *   letting him find out after 2 GB.
 */
import type { PageNode, SharedItem, Space, SpacePermission, SpaceRef } from "@/api/pages";

export interface Place {
  space: SpaceRef;
  /** The folders from the space's root down to here; empty is the root. */
  path: { id: number; title: string }[];
  /**
   * How many leading crumbs he can NOT open. 0 in a space he owns or that
   * was shared whole; for a shared folder, the folders above it, which the
   * server will refuse.
   */
  floor?: number;
}

export interface Access {
  canWrite: boolean;
  permission: SpacePermission;
}

const RANK: Record<SpacePermission, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

/**
 * What he may do in a space. A space he holds several shares in gets the
 * strongest one: an approximation for the rare case of a view-only space with
 * an editable folder inside, where the server still has the last word.
 */
export function accessResolver(owned: Pick<Space, "id">[], shares: Pick<SharedItem, "space" | "permission">[]) {
  const mine = new Set(owned.map((s) => s.id));
  const best = new Map<number, SpacePermission>();
  for (const share of shares) {
    const previous = best.get(share.space.id);
    if (!previous || RANK[share.permission] > RANK[previous]) best.set(share.space.id, share.permission);
  }
  return (spaceId: number): Access | null => {
    if (mine.has(spaceId)) return { canWrite: true, permission: "owner" };
    const permission = best.get(spaceId);
    return permission ? { canWrite: permission !== "viewer", permission } : null;
  };
}

export function placeLabel(place: Place): string {
  return [place.space.title, ...place.path.map((p) => p.title)].join(" / ");
}

export function parentOf(place: Place): number | null {
  return place.path.length > 0 ? place.path[place.path.length - 1].id : null;
}

export function placeFromShare(share: SharedItem): Place {
  return share.node
    ? { space: share.space, path: [{ id: share.node.id, title: share.node.title }], floor: 1 }
    : { space: share.space, path: [], floor: 0 };
}

/**
 * A folder found by search, opened with its ancestors (`show` sends them).
 * In a space he can open whole, every crumb works; otherwise only the folder
 * itself is safe to show as reachable.
 */
export function placeFromFolder(folder: Pick<PageNode, "id" | "title" | "ancestors">, space: SpaceRef, wholeSpace: boolean): Place {
  const path = [...folder.ancestors.map((a) => ({ id: a.id, title: a.title })), { id: folder.id, title: folder.title }];
  return { space, path, floor: wholeSpace ? 0 : path.length };
}

/** A stored place, if it still has the shape this version writes. */
export function asPlace(value: unknown): Place | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<Place>;
  if (typeof v.space?.id !== "number" || typeof v.space.title !== "string" || !Array.isArray(v.path)) return null;
  if (!v.path.every((p) => typeof p?.id === "number" && typeof p.title === "string")) return null;
  return { space: { id: v.space.id, title: v.space.title, icon: v.space.icon ?? null }, path: v.path, floor: typeof v.floor === "number" ? v.floor : 0 };
}

/** Spaces whose name matches, for the search box (the server's search is nodes only). */
export function matchingSpaces<T extends Pick<SpaceRef, "title">>(spaces: T[], query: string): T[] {
  const q = query.trim().toLocaleLowerCase();
  return q ? spaces.filter((s) => s.title.toLocaleLowerCase().includes(q)) : [];
}
