/**
 * PAGES SHARING (audit #14) — the web's `sharesApi` and `shareLinksApi`
 * (multi_magic `page_app/api/page_app.api.ts`), read and written by the phone.
 *
 * ── WHAT THE SERVER ALLOWS ────────────────────────────────────────────────
 * Only the space's OWNER lists, adds, changes and removes shares and links,
 * for the space or any node in it (`PageApp::SharePolicy`,
 * `PageApp::ShareLinkPolicy`: `owner?` throughout). An admin of a shared
 * space gets 403, so the phone offers Share to the owner only
 * (`permissions.ts` `canShare`).
 *
 *   GET/POST   spaces/:id(/nodes/:node_id)/shares        { share: { email, permission } }
 *              → { share, state: added | invited | updated }
 *   PATCH/DEL  …/shares/:share_id                       { share: { permission } }
 *   POST       …/shares/:share_id/resend                (a pending invite)
 *   GET/POST   …/share_links                            { share_link: { permission, expires_at } }
 *   DELETE     …/share_links/:id[?revoke_access=true]
 *
 * An address with no account is INVITED by email (`PageApp::Sharing#invite`)
 * and listed as pending until it signs up. A refusal (yourself, a bad address,
 * already shared…) comes back 422 as `{ message }`, in the user's language,
 * which `failureMessage` shows as is.
 */
import { http } from "./http";
import { absoluteUrl } from "./conversations";
import { arr, bool, id, num, obj, optStr, readable, str } from "./parse";

/** `PageApp::Share.permissions` / `ShareLink.permissions`, in the web's order. */
export type SharePermission = "viewer" | "editor" | "admin";
export const SHARE_PERMISSIONS: SharePermission[] = ["viewer", "editor", "admin"];

/** A space (nodeId null) or one file or folder in it. */
export interface ShareTarget {
  spaceId: number;
  nodeId: number | null;
}

export interface PageShare {
  id: number;
  permission: SharePermission;
  email: string;
  /** Null for a pending invite (no account yet). */
  name: string | null;
  pending: boolean;
}

export interface ShareLink {
  id: number;
  permission: SharePermission;
  /** Null: never expires. */
  expiresAt: string | null;
  /** The server's own answer, so the phone's clock is not asked. */
  expired: boolean;
  /** People in through this link (revoking can remove them too). */
  grantedCount: number;
  /** Relative: `/pages/:space?share_link=…`. */
  path: string;
}

export type ShareState = "added" | "invited" | "updated";

function permissionOf(value: unknown, field: string): SharePermission {
  const p = str(value, field);
  return (SHARE_PERMISSIONS as string[]).includes(p) ? (p as SharePermission) : "viewer";
}

function parseShare(payload: unknown): PageShare {
  const r = obj(payload, "share");
  return {
    id: id(r.id, "share.id"),
    permission: permissionOf(r.permission, "share.permission"),
    email: str(r.shared_with_email, "share.shared_with_email"),
    name: optStr(r.shared_with_name)?.trim() || null,
    pending: r.pending === true,
  };
}

function parseLink(payload: unknown): ShareLink {
  const r = obj(payload, "share_link");
  return {
    id: id(r.id, "share_link.id"),
    permission: permissionOf(r.permission, "share_link.permission"),
    expiresAt: optStr(r.expires_at),
    expired: r.expired == null ? false : bool(r.expired, "share_link.expired"),
    grantedCount: r.granted_count == null ? 0 : num(r.granted_count, "share_link.granted_count"),
    path: str(r.path, "share_link.path"),
  };
}

const base = ({ spaceId, nodeId }: ShareTarget, what: "shares" | "share_links") =>
  nodeId != null ? `/api/v1/page_app/spaces/${spaceId}/nodes/${nodeId}/${what}` : `/api/v1/page_app/spaces/${spaceId}/${what}`;

export const sharesApi = {
  list: async (target: ShareTarget): Promise<PageShare[]> => {
    const res = await http.get(base(target, "shares"));
    return readable(arr(obj(res.data, "shares").shares, "shares.shares"), parseShare);
  },

  create: async (target: ShareTarget, data: { email: string; permission: SharePermission }): Promise<{ share: PageShare; state: ShareState }> => {
    const res = await http.post(base(target, "shares"), { share: data });
    const r = obj(res.data, "share");
    const state = r.state === "invited" || r.state === "updated" ? r.state : "added";
    return { share: parseShare(r.share), state };
  },

  update: async (target: ShareTarget, shareId: number, permission: SharePermission): Promise<PageShare> => {
    const res = await http.patch(`${base(target, "shares")}/${shareId}`, { share: { permission } });
    return parseShare(obj(res.data, "share").share);
  },

  destroy: async (target: ShareTarget, shareId: number): Promise<void> => {
    await http.delete(`${base(target, "shares")}/${shareId}`);
  },

  resend: async (target: ShareTarget, shareId: number): Promise<PageShare> => {
    const res = await http.post(`${base(target, "shares")}/${shareId}/resend`);
    return parseShare(obj(res.data, "share").share);
  },
};

export const shareLinksApi = {
  list: async (target: ShareTarget): Promise<ShareLink[]> => {
    const res = await http.get(base(target, "share_links"));
    return readable(arr(obj(res.data, "share_links").share_links, "share_links.share_links"), parseLink);
  },

  create: async (target: ShareTarget, data: { permission: SharePermission; expiresAt: string | null }): Promise<ShareLink> => {
    const res = await http.post(base(target, "share_links"), { share_link: { permission: data.permission, expires_at: data.expiresAt } });
    return parseLink(obj(res.data, "share_link").share_link);
  },

  /** Always stops the link; `revokeAccess` also removes the people it let in.
   *  Returns how many were removed. */
  destroy: async (target: ShareTarget, linkId: number, revokeAccess: boolean): Promise<number> => {
    const res = await http.delete(`${base(target, "share_links")}/${linkId}`, {
      params: revokeAccess ? { revoke_access: "true" } : undefined,
    });
    const r = typeof res.data === "object" && res.data !== null ? (res.data as Record<string, unknown>) : {};
    return typeof r.revoked_access_count === "number" ? r.revoked_access_count : 0;
  },
};

/** What the web copies: its origin plus the link's path. The web is served by
 *  the same Rails host the app talks to (`API_URL`). */
export function linkUrl(link: Pick<ShareLink, "path">): string {
  return absoluteUrl(link.path) ?? link.path;
}
