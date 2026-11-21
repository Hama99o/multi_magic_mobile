/**
 * WHERE A NODE IS, AS A LINK AND AS A PATH (parity audit #30, #8).
 *
 * - `nodeLink`: the web's own URL for an item (`Drive.tsx` `copyLink`): a
 *   folder opens as a folder, a page as a page, a file as its preview. The
 *   origin is the API's, which in production IS the web's (the same Rails
 *   app), and on a dev stack the address the phone actually used
 *   (`absoluteUrl`).
 * - `crumbsFor`: one crumb per place, from the space down; each opens the
 *   folder it names, the current one is the page you are on, so not a link.
 */
import { absoluteUrl } from "@/api/conversations";
import type { NodeKind } from "@/api/pages";

export function nodeLink(node: { id: number; spaceId: number; kind: NodeKind }): string {
  const param = node.kind === "folder" ? "folder" : node.kind === "page" ? "node" : "preview";
  const path = `/pages/${node.spaceId}?${param}=${node.id}`;
  return absoluteUrl(path) ?? path;
}

/** What `app/pages/folder.tsx` takes in its params. */
export interface FolderTarget {
  spaceId: number;
  parentId: number | null;
  title: string;
  trail: string;
}

export interface Crumb {
  key: string;
  label: string;
  /** Null for the place you are already in. */
  target: FolderTarget | null;
}

export function crumbsFor(
  space: { spaceId: number; spaceTitle: string },
  ancestors: { id: number; title: string }[],
  current: { id: number; title: string } | null,
): Crumb[] {
  const above = current ? ancestors.filter((a) => a.id !== current.id) : ancestors;
  const crumbs: Crumb[] = [
    { key: "space", label: space.spaceTitle, target: current ? { spaceId: space.spaceId, parentId: null, title: space.spaceTitle, trail: "" } : null },
  ];
  const names = [space.spaceTitle];
  for (const a of above) {
    crumbs.push({ key: String(a.id), label: a.title, target: { spaceId: space.spaceId, parentId: a.id, title: a.title, trail: names.join(" / ") } });
    names.push(a.title);
  }
  if (current) crumbs.push({ key: String(current.id), label: current.title, target: null });
  return crumbs;
}
