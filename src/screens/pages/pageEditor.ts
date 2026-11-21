/**
 * The page editor's toolbar (parity #50, `app/pages/edit.tsx`).
 *
 * A page gets the note's whole editor: marks, links, colours, headings, lists,
 * tables, images and code blocks. The two keys it does not get are the note
 * record's, not the editor's: the note colour and the note's ⋮ menu (labels,
 * reminder, lock, archive). A page has none of those, so the keys are left
 * out rather than shown dead.
 */
import type { ToolbarKey } from "@/screens/notes/editor/toolbarModel";

/** The note-record keys a page leaves out; every editing key stays. */
export function forPage(keys: ToolbarKey[]): ToolbarKey[] {
  return keys.filter((k) => k.command.kind !== "sheet");
}

/** A typed address as a link: "example.com" gets https://, "mailto:…" stays. */
export function linkHref(typed: string): string | null {
  const href = typed.trim();
  if (!href) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`;
}
