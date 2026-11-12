/**
 * The screen-side glue between a note's stored HTML and the editor parts:
 * the vendored codec (tiptop-editor/schema), built ONCE per note body.
 *
 * `preserveUnknown` keeps what the web itself drops (legacy <img>, <iframe>)
 * as raw blocks; the source map lets a later save write unchanged blocks back
 * byte for byte. Both are what makes "a phone edit never breaks the web"
 * true (tiptop-editor docs/SHARED_DOC_SCHEMA_PLAN.md §8).
 */
import { API_URL } from "@/config/env";
import { fromHTMLWithSource, type DocNode, type SourceMap } from "@/vendor/tiptop-schema";

export interface ParsedNote {
  doc: DocNode;
  source: SourceMap | null;
}

export function parseNoteHtml(html: string): ParsedNote {
  return fromHTMLWithSource(html, { preserveUnknown: true });
}

/** The note on the web app (same host as the API): `/notes/:id`. */
export function noteWebUrl(noteId: number): string {
  return `${API_URL.replace(/\/+$/, "")}/notes/${noteId}`;
}
