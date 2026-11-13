/**
 * The editor's open → save path (plan §11, condition 1: the codec stays the
 * guarantee, whatever the engine does).
 *
 *   open:  stored HTML → doc + source map → the engine's document
 *   save:  the engine's JSON → fromEngine → validate → toHTML({ source })
 *
 * Blocks the phone may not edit leave as opaque atoms and come back as the
 * exact node, so the source map writes their stored bytes back:
 *  - code blocks and tables (SPEC §C8);
 *  - any top-level block holding sub/sup (the engine does not draw them while
 *    editing, SPEC §H) or a web comment (comments are off on the phone, §G3).
 * A document that cannot be trusted is never saved: the screen goes back to
 * the read view and offers the web.
 *
 * Pure: no engine import, tested in Jest.
 */
import { fromHTMLWithSource, normalize, toHTML, validate, type DocNode, type SourceMap } from "@/vendor/tiptop-schema";
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

const HTML_OPTIONS = { preserveUnknown: true } as const;
const LOCKING_MARKS = new Set(["subscript", "superscript", "comment"]);
// The web drops comment markup when comments are off, so the doc cannot show
// it: the stored bytes of the block do.
const COMMENT_MARKUP = /\bdata-comment-id\s*=|<span\b[^>]*\bclass\s*=\s*["'][^"']*\bcomment\b/i;

function holdsLockingMark(node: DocNode): boolean {
  if (node.marks?.some((m) => LOCKING_MARKS.has(m.type))) return true;
  return (node.content ?? []).some(holdsLockingMark);
}

/** The stored HTML of each top-level block, by index (null without a source map). */
function blockSources(source: SourceMap | null): (string | null)[] {
  if (!source) return [];
  return source.chunks.flatMap((c) => c.nodes.map(() => c.html));
}

export function openForEditing(html: string): EditSession {
  const { doc, source } = fromHTMLWithSource(html, HTML_OPTIONS);
  const stored = blockSources(source);
  const engineDoc = toEngine(doc, {
    lock: (node, index) => holdsLockingMark(node) || COMMENT_MARKUP.test(stored[index] ?? ""),
  });
  return { doc, source, engineDoc };
}

export function saveFromEngine(engineDoc: DocNode, session: Pick<EditSession, "source">): SaveResult {
  let doc: DocNode;
  try {
    doc = normalize(fromEngine(engineDoc));
  } catch (e) {
    return { ok: false, reason: "damaged", message: e instanceof Error ? e.message : String(e) };
  }
  const result = validate(doc, { allowRaw: true });
  const errors = result.issues.filter((i) => i.severity === "error");
  if (errors.length) {
    return { ok: false, reason: "invalid", message: errors.map((i) => i.message).join(" ") };
  }
  return { ok: true, html: toHTML(doc, { ...HTML_OPTIONS, source: session.source }), doc };
}
