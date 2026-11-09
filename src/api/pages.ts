/**
 * PAGES — the web's drive (`multi_magic` `api/v1/page_app/**`), read and
 * written by the phone. `docs/design/pages/SPEC.md`.
 *
 * ── THE MODEL, IN ONE PARAGRAPH ───────────────────────────────────────────
 * A SPACE is a top-level drive (`page_app/space.rb`): title, emoji icon,
 * colour, owner. Inside it, NODES form a tree through `parent_id`
 * (`page_app/node.rb`), each one of three kinds: a `folder`, a `page` (rich
 * text, stored as `content: { html }` — the web's `NodeViewer.tsx:115`
 * autosaves exactly that shape), or a `file` (one ActiveStorage attachment,
 * any type, 2 GB cap, `MAX_ATTACHMENT_SIZE`).
 *
 * ── WHERE EACH LIST COMES FROM ────────────────────────────────────────────
 *   one folder        GET spaces/:id/nodes?parent_id=     25 a page, folders first
 *   Recent/Starred/   GET drive/nodes?view=…              50 a page, every space,
 *   Trash/search                                          each row says its space
 *   Shared with me    GET spaces/shared_with_me           not paginated
 *
 * `parent_id=` (EMPTY) is the root and is not the same as leaving it out:
 * `apply_parent_filter` only filters when the key is PRESENT
 * (`nodes_controller/node_sorting.rb`), so a missing key returns every node in
 * the space, flattened. The root listing therefore always sends the key.
 *
 * ── URLS ARE RELATIVE, AND SIGNED ─────────────────────────────────────────
 * `attachment_url` and `thumbnail_url` are `rails_storage_proxy_url(…,
 * only_path: true)` (`node_serializer.rb`): a path, which `<Image>` renders as
 * nothing at all, so they are made absolute here with `absoluteUrl`. They are
 * SIGNED blob URLs, so they load without the Authorization header, which is
 * why `expo-image` and the downloader can take them directly.
 */
import { File, Paths } from "expo-file-system";
import { http } from "./http";
import { absoluteUrl } from "./conversations";
import { ApiShapeError, arr, bool, id, num, obj, optStr, readableRows, str } from "./parse";

export type NodeKind = "folder" | "page" | "file";
export type SpacePermission = "owner" | "admin" | "editor" | "viewer";
export type DriveView = "recent" | "starred" | "trash" | "search";
export type SortBy = "name" | "updated_at" | "created_at" | "size" | "type";
export type SortDir = "asc" | "desc";
/** `CONTENT_TYPE_GROUPS` in `node_sorting.rb` — the server owns the meaning. */
export type TypeFilter = "image" | "pdf" | "video" | "audio" | "document" | "archive";

export const TYPE_FILTERS: TypeFilter[] = ["image", "pdf", "video", "audio", "document", "archive"];
export const SORTS: SortBy[] = ["name", "updated_at", "created_at", "size", "type"];

export interface SpaceRef {
  id: number;
  title: string;
  icon: string | null;
}

export interface Space extends SpaceRef {
  description: string | null;
  color: string | null;
  nodesCount: number;
  ownerName: string | null;
  /** Only `show` sends it; a list row says null. */
  permission: SpacePermission | null;
  totalFileSize: number | null;
  updatedAt: string;
}

export interface Ancestor {
  id: number;
  title: string;
}

export interface PageNode {
  id: number;
  spaceId: number;
  parentId: number | null;
  title: string;
  kind: NodeKind;
  starred: boolean;
  childrenCount: number;
  /** Absolute, signed; null for a folder or a page. */
  attachmentUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  ownerName: string | null;
  updatedAt: string;
  createdAt: string | null;
  deletedAt: string | null;
  /** Drive-wide lists only (`with_space`). */
  space: SpaceRef | null;
  /** `show` only. */
  html: string | null;
  ancestors: Ancestor[];
}

export interface Page<T> {
  rows: T[];
  hasMore: boolean;
  unreadable: number;
  total: number | null;
}

export interface SharedItem {
  id: number;
  permission: SpacePermission;
  space: SpaceRef;
  /** Null when a whole space was shared. */
  node: { id: number; title: string; kind: NodeKind; parentId: number | null } | null;
}

const KINDS: NodeKind[] = ["folder", "page", "file"];
const PERMISSIONS: SpacePermission[] = ["owner", "admin", "editor", "viewer"];

function kindOf(value: unknown, field: string): NodeKind {
  const kind = str(value, field);
  // An ApiShapeError, not a plain Error: `readableRows` counts only that, so
  // a kind this app does not know (the server grows one) costs its row,
  // not the folder.
  if (!(KINDS as string[]).includes(kind)) throw new ApiShapeError(field, kind);
  return kind as NodeKind;
}

function permissionOf(value: unknown): SpacePermission | null {
  return typeof value === "string" && (PERMISSIONS as string[]).includes(value) ? (value as SpacePermission) : null;
}

function optNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ownerName(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const owner = value as Record<string, unknown>;
  return (
    optStr(owner.fullname) ??
    ([optStr(owner.firstname), optStr(owner.lastname)].filter(Boolean).join(" ") || null)
  );
}

function parseSpaceRef(payload: unknown, field: string): SpaceRef {
  const record = obj(payload, field);
  return { id: id(record.id, `${field}.id`), title: str(record.title, `${field}.title`), icon: optStr(record.icon) };
}

function parseSpace(payload: unknown): Space {
  const record = obj(payload, "space");
  return {
    ...parseSpaceRef(record, "space"),
    description: optStr(record.description),
    color: optStr(record.color),
    nodesCount: optNum(record.nodes_count) ?? 0,
    ownerName: ownerName(record.owner),
    permission: permissionOf(record.current_user_permission),
    totalFileSize: optNum(record.total_file_size),
    updatedAt: str(record.updated_at, "space.updated_at"),
  };
}

function parseNode(payload: unknown): PageNode {
  const record = obj(payload, "node");
  const content = record.content;
  const html =
    typeof content === "object" && content !== null && typeof (content as Record<string, unknown>).html === "string"
      ? ((content as Record<string, unknown>).html as string)
      : null;
  return {
    id: id(record.id, "node.id"),
    spaceId: id(record.page_app_space_id, "node.page_app_space_id"),
    parentId: optNum(record.parent_id),
    title: str(record.title, "node.title"),
    kind: kindOf(record.kind, "node.kind"),
    starred: record.starred === true,
    childrenCount: optNum(record.children_count) ?? 0,
    attachmentUrl: absoluteUrl(optStr(record.attachment_url)),
    thumbnailUrl: absoluteUrl(optStr(record.thumbnail_url)),
    mimeType: optStr(record.mime_type),
    fileSize: optNum(record.file_size),
    ownerName: ownerName(record.owner),
    updatedAt: str(record.updated_at, "node.updated_at"),
    createdAt: optStr(record.created_at),
    deletedAt: optStr(record.deleted_at),
    space: record.space ? parseSpaceRef(record.space, "node.space") : null,
    html,
    ancestors: Array.isArray(record.ancestors)
      ? record.ancestors.map((a, i) => {
          const r = obj(a, `node.ancestors[${i}]`);
          return { id: id(r.id, "ancestor.id"), title: str(r.title, "ancestor.title") };
        })
      : [],
  };
}

function parseShared(payload: unknown): SharedItem {
  const record = obj(payload, "share");
  const node = record.node ? obj(record.node, "share.node") : null;
  return {
    id: id(record.id, "share.id"),
    permission: permissionOf(record.permission) ?? "viewer",
    space: parseSpaceRef(record.space, "share.space"),
    node: node
      ? {
          id: id(node.id, "share.node.id"),
          title: str(node.title, "share.node.title"),
          kind: kindOf(node.kind, "share.node.kind"),
          parentId: optNum(node.parent_id),
        }
      : null,
  };
}

function paged<T>(data: unknown, root: string, page: number, parse: (item: unknown) => T): Page<T> {
  const record = obj(data, root);
  const { rows, unreadable } = readableRows(arr(record[root], `${root}.${root}`), parse);
  const meta = typeof record.meta === "object" && record.meta !== null ? (record.meta as Record<string, unknown>) : {};
  const pagy = typeof meta.pagy === "object" && meta.pagy !== null ? (meta.pagy as Record<string, unknown>) : {};
  const pages = optNum(pagy.pages) ?? 1;
  return { rows, unreadable, hasMore: pages > page, total: optNum(meta.total_count) };
}

export interface ListOptions {
  sortBy?: SortBy;
  sortDir?: SortDir;
  type?: TypeFilter | null;
  search?: string;
  /** Only this kind — the destination picker lists folders and nothing else. */
  kind?: NodeKind;
}

function listParams(page: number, options: ListOptions): Record<string, string | number> {
  const params: Record<string, string | number> = { page };
  if (options.sortBy) params.sort_by = options.sortBy;
  if (options.sortDir) params.sort_dir = options.sortDir;
  if (options.type) params.content_type = options.type;
  if (options.search?.trim()) params.search = options.search.trim();
  if (options.kind) params.kind = options.kind;
  return params;
}

/** For a delete-for-good: 404 means somebody (or its own folder) already
 *  deleted it, which is the outcome asked for. Same rule as the web's
 *  `alreadyGoneIsDone` (multi_magic `page_app.api.ts`). */
const alreadyGoneIsDone = (status: number): boolean => (status >= 200 && status < 300) || status === 404;

export const pagesApi = {
  /** Spaces this user can open — owned and shared as a whole. */
  spaces: async (page = 1, search?: string): Promise<Page<Space>> => {
    const params: Record<string, string | number> = { page, per_page: 50 };
    if (search?.trim()) params.search = search.trim();
    const res = await http.get("/api/v1/page_app/spaces", { params });
    return paged(res.data, "spaces", page, parseSpace);
  },

  space: async (spaceId: number): Promise<Space> => {
    const res = await http.get(`/api/v1/page_app/spaces/${spaceId}`);
    return parseSpace(obj(res.data, "space").space);
  },

  /** One folder's children; `parentId: null` is the space's root. */
  children: async (spaceId: number, parentId: number | null, page = 1, options: ListOptions = {}): Promise<Page<PageNode>> => {
    const params = listParams(page, options);
    // Present even when empty: see this file's header.
    params.parent_id = parentId == null ? "" : String(parentId);
    const res = await http.get(`/api/v1/page_app/spaces/${spaceId}/nodes`, { params });
    return paged(res.data, "nodes", page, parseNode);
  },

  /** Recent, Starred, Trash, or a search across every space. */
  drive: async (view: DriveView, page = 1, options: ListOptions = {}): Promise<Page<PageNode>> => {
    const res = await http.get("/api/v1/page_app/drive/nodes", { params: { ...listParams(page, options), view } });
    return paged(res.data, "nodes", page, parseNode);
  },

  sharedWithMe: async (): Promise<Page<SharedItem>> => {
    const res = await http.get("/api/v1/page_app/spaces/shared_with_me");
    const { rows, unreadable } = readableRows(arr(obj(res.data, "shares").shares, "shares.shares"), parseShared);
    return { rows, unreadable, hasMore: false, total: rows.length };
  },

  /** A folder, for "New folder" and the one-tap date folder. */
  createFolder: async (spaceId: number, parentId: number | null, title: string): Promise<PageNode> => {
    const res = await http.post(`/api/v1/page_app/spaces/${spaceId}/nodes`, {
      node: { title, kind: "folder", parent_id: parentId },
    });
    return parseNode(obj(res.data, "node").node);
  },

  /** Rename, or star/unstar (`node_params` permits both, `nodes_controller.rb`). */
  update: async (spaceId: number, nodeId: number, patch: { title?: string; starred?: boolean }): Promise<PageNode> => {
    const res = await http.patch(`/api/v1/page_app/spaces/${spaceId}/nodes/${nodeId}`, { node: patch });
    return parseNode(obj(res.data, "node").node);
  },

  /** Into a folder (`parentId`) or a space's root (null), possibly another
   *  space (`move_helpers.rb`: a folder carries its subtree with it). */
  move: async (spaceId: number, nodeId: number, to: { spaceId: number; parentId: number | null }): Promise<PageNode> => {
    const res = await http.put(`/api/v1/page_app/spaces/${spaceId}/nodes/${nodeId}/move`, {
      target_space_id: to.spaceId,
      parent_id: to.parentId,
    });
    return parseNode(obj(res.data, "node").node);
  },

  /** To the trash, with its subtree — restorable (`soft_delete!`). */
  trash: async (spaceId: number, nodeId: number): Promise<void> => {
    await http.delete(`/api/v1/page_app/spaces/${spaceId}/nodes/${nodeId}`);
  },

  /** Out of the trash, with everything that was trashed together with it
   *  (`PageApp::Node#restore!`). */
  restore: async (spaceId: number, nodeId: number): Promise<void> => {
    await http.put(`/api/v1/page_app/spaces/${spaceId}/nodes/${nodeId}/restore`);
  },

  /** Gone for good, with its subtree (`destroy_permanently`, owner/editor). */
  destroyForever: async (spaceId: number, nodeId: number): Promise<void> => {
    await http.delete(`/api/v1/page_app/spaces/${spaceId}/nodes/${nodeId}/destroy_permanently`);
  },

  /**
   * Empty trash. The server has no such endpoint, so each item at the top of
   * the trash (`trash_roots`) is destroyed; what was trashed inside it goes
   * with it. Page 1 is read again each time, because every delete moves the
   * rest up. Returns how many were deleted; the first real failure stops it.
   *
   * A child trashed BEFORE its folder is listed as its own trash root, and the
   * folder's delete takes it too (the web's bug of 2026-11-09). So a row whose
   * folder is in the same batch is not asked for, and a 404 means "already
   * gone", which is what was asked, not a failure.
   */
  emptyTrash: async (): Promise<number> => {
    let deleted = 0;
    for (let guard = 0; guard < 200; guard += 1) {
      const res = await http.get("/api/v1/page_app/drive/nodes", { params: { view: "trash", page: 1, per_page: 50 } });
      const { rows } = paged(res.data, "nodes", 1, parseNode);
      if (rows.length === 0) break;
      const ids = new Set(rows.map((node) => node.id));
      for (const node of rows) {
        if (node.parentId == null || !ids.has(node.parentId)) {
          await http.delete(`/api/v1/page_app/spaces/${node.spaceId}/nodes/${node.id}/destroy_permanently`, {
            validateStatus: alreadyGoneIsDone,
          });
        }
        deleted += 1;
      }
    }
    return deleted;
  },

  /** With the page's html and the breadcrumb chain. */
  node: async (spaceId: number, nodeId: number): Promise<PageNode> => {
    const res = await http.get(`/api/v1/page_app/spaces/${spaceId}/nodes/${nodeId}`);
    return parseNode(obj(res.data, "node").node);
  },
};

// ── Files on the phone ──────────────────────────────────────────────────────

/**
 * A name the file system will take. A title is whatever the person typed on
 * the web, and `/` in it would be read as a directory.
 */
export function safeFileName(title: string): string {
  const cleaned = title.replace(/[/\\?%*:|"<>\n\r\t]/g, "_").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "file";
}

/**
 * Downloads a file into the cache and returns its local uri. Kept per node
 * AND per version of the file (`updatedAt`), so opening the same file twice
 * costs one download, and a replaced file is never served stale.
 */
export async function downloadToCache(node: PageNode): Promise<string> {
  if (!node.attachmentUrl) throw new Error("node has no file");
  const stamp = node.updatedAt.replace(/\D/g, "");
  const target = new File(Paths.cache, `pages-${node.id}-${stamp}-${safeFileName(node.title)}`);
  if (target.exists) return target.uri;
  const file = await File.downloadFileAsync(node.attachmentUrl, target, { idempotent: true });
  return file.uri;
}

export const __parse = { parseNode, parseSpace, parseShared, bool, num };
