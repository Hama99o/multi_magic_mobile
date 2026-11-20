/**
 * WHAT THE USER STORES, AND WHERE (parity audit Pages #6): `GET /api/v1/storage`
 * (multi_magic `StorageQuota::Usage#as_json`, the web's StorageView): used of
 * the allowance, a slice per app, what the trash still holds, and the largest
 * files, so someone out of room has somewhere to start.
 */
import { http } from "./http";
import { num, obj, optStr } from "./parse";

/** The server's app keys, in the web's legend order. */
export const STORAGE_APPS = ["page_app", "notes", "editor", "contacts", "ai", "doc", "profile", "fields", "tables"] as const;
export type StorageApp = (typeof STORAGE_APPS)[number];

export interface LargeFile {
  id: number;
  title: string;
  spaceId: number;
  trashed: boolean;
  byteSize: number;
  contentType: string | null;
}

export interface StorageUsage {
  totalBytes: number;
  limitBytes: number;
  availableBytes: number;
  percentUsed: number;
  trashedBytes: number;
  /** Only apps holding something, biggest first. */
  byApp: { app: StorageApp; bytes: number }[];
  largestFiles: LargeFile[];
}

const n0 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

export function parseStorage(raw: unknown): StorageUsage {
  const s = obj(obj(raw, "storage response").storage, "storage");
  const byAppRaw = (typeof s.by_app === "object" && s.by_app !== null ? s.by_app : {}) as Record<string, unknown>;
  const byApp = STORAGE_APPS.map((app) => ({ app, bytes: n0(byAppRaw[app]) }))
    .filter((a) => a.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
  return {
    totalBytes: n0(s.total_bytes),
    limitBytes: n0(s.limit_bytes),
    availableBytes: n0(s.available_bytes),
    percentUsed: Math.min(100, Math.max(0, n0(s.percent_used))),
    trashedBytes: n0(s.trashed_bytes),
    byApp,
    largestFiles: (Array.isArray(s.largest_files) ? s.largest_files : []).flatMap((f) => {
      try {
        const r = obj(f, "file");
        return [{ id: num(r.id, "id"), title: optStr(r.title) ?? "", spaceId: num(r.space_id, "space_id"), trashed: r.trashed === true, byteSize: n0(r.byte_size), contentType: optStr(r.content_type) }];
      } catch {
        return [];
      }
    }),
  };
}

export const storageApi = {
  show: async (): Promise<StorageUsage> => parseStorage((await http.get("/api/v1/storage")).data),
};

/** Above this the bar turns red, as the web's does (`StorageView` FULL_THRESHOLD). */
export const FULL_THRESHOLD = 90;

