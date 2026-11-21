/**
 * The Pages tool's edits, as data (web `PagesDoc.tsx`): a list of entries,
 * each a source page (0-based) and a rotation added to the page's own.
 * Deleting is leaving an entry out; extracting is sending only some. Pure,
 * so every edit is tested without a screen; the screen keeps 20 of these for
 * Undo, as the web does.
 */
import type { PageEntry } from "@/api/doc";

export interface Entry extends Required<PageEntry> {
  key: string;
}

export const HISTORY = 20;

export function entriesFor(pageCount: number): Entry[] {
  return Array.from({ length: pageCount }, (_, i) => ({ key: `p${i}`, source: i, rotation: 0 }));
}

const norm = (deg: number) => ((deg % 360) + 360) % 360;

export function rotate(entries: Entry[], keys: Set<string>, by: 90 | -90): Entry[] {
  return entries.map((e) => (keys.has(e.key) ? { ...e, rotation: norm(e.rotation + by) } : e));
}

export function remove(entries: Entry[], keys: Set<string>): Entry[] {
  return entries.filter((e) => !keys.has(e.key));
}

/**
 * The selected pages move one step together, keeping their own order; a
 * block already at the end stays where it is.
 */
export function moveSelected(entries: Entry[], keys: Set<string>, by: -1 | 1): Entry[] {
  const next = [...entries];
  const indexes = next.map((e, i) => (keys.has(e.key) ? i : -1)).filter((i) => i >= 0);
  if (indexes.length === 0) return entries;
  if (by === -1 && indexes[0] === 0) return entries;
  if (by === 1 && indexes[indexes.length - 1] === next.length - 1) return entries;
  const order = by === -1 ? indexes : [...indexes].reverse();
  for (const i of order) [next[i], next[i + by]] = [next[i + by], next[i]];
  return next;
}

/** What the server is sent: source and rotation, in this order. */
export function toServer(entries: Entry[]): PageEntry[] {
  return entries.map((e) => ({ source: e.source, rotation: e.rotation }));
}

/** "Contract-03.pdf", the web's names for one file per page. */
export function splitName(base: string, index: number, total: number): string {
  return `${base}-${String(index + 1).padStart(Math.max(2, String(total).length), "0")}.pdf`;
}
