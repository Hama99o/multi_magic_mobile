/**
 * The editor's open → save path (plan §11, condition 1: the codec stays the
 * guarantee, whatever the engine does).
 *
 *   open:  stored HTML → doc + source map → the engine's document
 *   save:  the engine's JSON → fromEngine → validate → toHTML({ source })
 *
 * Untouched blocks are written back byte for byte (the source map), up to
 * SOURCE_MAP_LIMIT: building the map parses the note twice more (880 KB:
 * 4.7 s instead of 1.2 s on a laptop, far more on a phone; a 900 KB note did
 * not open in 90 s on the emulator, 2026-11-13). 64 KB since 2026-11-14: on
 * the emulator a 100 KB note took 3.8 s to open, 1.6 s of it our codec, mostly
 * the map (2-3x a plain parse; editSession.test PERF BUDGET). Above it, a save writes the
 * whole note as the web itself writes it (toHTML = getHTML, the oracle). Tables
 * and unknown markup still travel as atoms holding the exact node; sub/sup
 * and web comments are ordinary marks now (EDIT_EVERYTHING.md §2, §4).
 * A document that cannot be trusted is never saved: the screen goes back to
 * the read view and offers the web.
 *
 * Pure: no engine import, tested in Jest.
 */
import { fromHTML, fromHTMLWithSource, normalize, toHTML, validate, type DocNode, type SourceMap } from "@/vendor/tiptop-schema";
import { fromEngine, toEngine } from "./engineGlue";

export interface EditSession {
  doc: DocNode;
  source: SourceMap | null;
  /** What the engine is given (a fresh copy; the engine may keep it). */
  engineDoc: DocNode;
}

export type SaveResult =
  | { ok: true; html: string; doc: DocNode }
  | { ok: false; reason: "damaged" | "invalid"; message: string };

// The comments profile: a web comment is kept in the document as a mark (and
// commentId on blocks), carried through the engine invisibly and written back
// as the web wrote it (EDIT_EVERYTHING.md §4; comments are off on both).
const HTML_OPTIONS = { preserveUnknown: true, comments: true } as const;

export const SOURCE_MAP_LIMIT = 64 * 1024;

export function openForEditing(html: string): EditSession {
  const { doc, source } =
    html.length > SOURCE_MAP_LIMIT ? { doc: fromHTML(html, HTML_OPTIONS), source: null } : fromHTMLWithSource(html, HTML_OPTIONS);
  return { doc, source, engineDoc: toEngine(doc) };
}

export function saveFromEngine(engineDoc: DocNode, session: Pick<EditSession, "source">): SaveResult {
  let doc: DocNode;
  try {
    doc = normalize(fromEngine(engineDoc));
  } catch (e) {
    return { ok: false, reason: "damaged", message: e instanceof Error ? e.message : String(e) };
  }
  const result = validate(doc, { allowRaw: true, comments: true });
  const errors = result.issues.filter((i) => i.severity === "error");
  if (errors.length) {
    return { ok: false, reason: "invalid", message: errors.map((i) => i.message).join(" ") };
  }
  return { ok: true, html: toHTML(doc, { ...HTML_OPTIONS, source: session.source }), doc };
}
