/**
 * The filter chips of a folder: All · Folders · Images · PDFs · Videos …
 *
 * Drive's meaning, not the web's (`__tests__/filters.test.ts` has the owner's
 * words): a type lists only files of that type, Folders lists only folders.
 * The server keeps folders beside a content type unless `kind` says otherwise.
 */
import { TYPE_FILTERS, type ListOptions, type TypeFilter } from "@/api/pages";

export type Filter = TypeFilter | "folders";

export const FILTERS: Filter[] = ["folders", ...TYPE_FILTERS];

export function listFilter(filter: Filter | null): Pick<ListOptions, "type" | "kind"> {
  if (filter == null) return {};
  if (filter === "folders") return { kind: "folder" };
  return { type: filter, kind: "file" };
}
