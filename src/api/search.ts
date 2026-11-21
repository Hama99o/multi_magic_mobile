/**
 * Global search: one request for every app (multi_magic
 * `GET /api/v1/search?q=`, `search_controller.rb`, `services/search/`).
 * docs/design/search/SPEC.md.
 *
 * The server ranks; this file only reads. A row whose group or kind this
 * client does not know (a new app on the server), or that has no path, is
 * counted in `unreadable` rather than shown: a row that cannot open is a dead
 * end, and an unknown kind has no icon or label here.
 */
import { http } from "./http";
import { ApiShapeError, arr, num, obj, optStr, readableRows, str } from "./parse";

export const SEARCH_GROUPS = ["notes", "page_app", "todos", "calendar", "contacts", "finance", "safezone", "flow", "conversations", "doc", "ai"] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export const SEARCH_KINDS = [
  "note", "space", "file", "todoGroup", "task", "event", "contact", "expense", "income", "loan",
  "password", "paymentCard", "identity", "project", "card", "conversation", "message", "signature", "document",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchResult {
  /** `<kind>:<record id>`, stable: the list key and the recents' identity. */
  id: string;
  group: SearchGroup;
  kind: SearchKind;
  title: string;
  subtitle: string | null;
  /** The web path the hit opens (`routeForWebPath` reads it). */
  to: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  /** Hits per group, as the server counted them. */
  counts: Partial<Record<SearchGroup, number>>;
  /** Rows this client could not read or open. */
  unreadable: number;
}

function oneOf<T extends string>(list: readonly T[], value: unknown, field: string): T {
  if (typeof value === "string" && (list as readonly string[]).includes(value)) return value as T;
  throw new ApiShapeError(field, value);
}

function parseResult(value: unknown): SearchResult {
  const r = obj(value, "search.result");
  return {
    id: str(r.id, "search.result.id"),
    // Field names in the error say where it failed (not i18n keys).
    group: oneOf(SEARCH_GROUPS, r.group, "search.results[].group"),
    kind: oneOf(SEARCH_KINDS, r.kind, "search.results[].kind"),
    title: str(r.title, "search.result.title"),
    subtitle: optStr(r.subtitle),
    to: str(r.to, "search.result.to"),
    score: num(r.score, "search.result.score"),
  };
}

export const searchApi = {
  /** Every app at once. Pass the signal: only the last query's answer matters. */
  all: async (q: string, signal?: AbortSignal): Promise<SearchResponse> => {
    const res = await http.get("/api/v1/search", { params: { q }, signal });
    const body = obj(res.data, "search");
    const { rows, unreadable } = readableRows(arr(body.results, "search.results"), parseResult);
    const counts: SearchResponse["counts"] = {};
    for (const c of Array.isArray(body.counts) ? body.counts : []) {
      const entry = c as { group?: unknown; count?: unknown };
      if ((SEARCH_GROUPS as readonly unknown[]).includes(entry.group) && typeof entry.count === "number") counts[entry.group as SearchGroup] = entry.count;
    }
    return { results: rows, counts, unreadable };
  },
};
