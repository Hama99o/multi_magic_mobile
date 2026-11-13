/**
 * The screen-side glue between a note's stored HTML and the editor parts:
 * the vendored codec (tiptop-editor/schema), built ONCE per note body.
 *
 * `preserveUnknown` keeps what the web itself drops (legacy <img>, <iframe>)
 * as raw blocks. The read view never saves, so it does not build the source
 * map (that parses the note twice more: seconds on a 900 KB note); the
 * editor builds it (editSession.ts).
 */
import { fromHTML, type DocNode } from "@/vendor/tiptop-schema";

export interface ParsedNote {
  doc: DocNode;
}

export function parseNoteHtml(html: string): ParsedNote {
  return { doc: fromHTML(html, { preserveUnknown: true }) };
}
