/**
 * Our stored document ⇄ the editing engine's document (engine B,
 * @apollohg/react-native-rich-text-editor, plan §11). Pure; no engine import,
 * so it is tested in Jest and survives an engine change.
 *
 * Every rule was measured on the device spike (2026-11-12):
 *  - the engine refuses repeated object references: everything is copied;
 *  - it validates and rewrites a mark named `textStyle` (refuses `var(--x)`,
 *    turns `rgb(0, 0, 255)` into `#0000ffff`): the colour travels as
 *    ENGINE_COLOR_MARK, an opaque string, and comes back as written;
 *  - code blocks, tables, legacy raw blocks and images are read-only on the
 *    phone (SPEC §C8): they travel as one opaque atom holding the exact node,
 *    so they come back byte for byte and the source map keeps their stored
 *    HTML. ReadOnlyAtom draws them; `lock` adds more (editSession: sub/sup,
 *    web comments).
 */
import { parseColor } from "./color";
import type { DocMark, DocNode } from "./types";

export const ENGINE_COLOR_MARK = "fgColor";
export const READ_ONLY_ATOM = "readOnlyBlock";
const READ_ONLY_TYPES = new Set(["table", "rawBlock", "imageUploader"]);

const renameMark = (marks: DocMark[], from: string, to: string): DocMark[] =>
  marks.map((m) => (m.type === from ? { ...m, type: to } : { ...m }));

/**
 * Engine B parses only hex and rgb() colours; the web stores hsl() and CSS
 * variables. A colour mark travels with `display`, the same colour as
 * #rrggbb (what B's patched renderer draws); a colour the phone cannot
 * resolve gets none and draws in the default ink. `display` never comes back.
 */
const COLOR_MARKS = new Set([ENGINE_COLOR_MARK, "highlight"]);
const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
function withDisplay(m: DocMark): DocMark {
  if (!COLOR_MARKS.has(m.type)) return m;
  const color = typeof m.attrs?.color === "string" ? m.attrs.color : null;
  const rgb = color ? parseColor(color) : null;
  return rgb ? { ...m, attrs: { ...m.attrs, display: `#${rgb.map(hex2).join("")}` } } : m;
}
function withoutDisplay(m: DocMark): DocMark {
  if (!m.attrs || !("display" in m.attrs)) return m;
  const { display: _display, ...attrs } = m.attrs;
  return { ...m, attrs };
}

function mapNode(node: DocNode, visit: (n: DocNode) => DocNode | null): DocNode {
  const replaced = visit(node);
  if (replaced) return replaced;
  const { content, marks, attrs, ...rest } = node;
  return {
    ...rest,
    ...(attrs ? { attrs: JSON.parse(JSON.stringify(attrs)) } : {}),
    ...(marks ? { marks: marks.map((m) => JSON.parse(JSON.stringify(m)) as DocMark) } : {}),
    ...(content ? { content: content.map((c) => mapNode(c, visit)) } : {}),
  } as DocNode;
}

const atom = (n: DocNode): DocNode => ({ type: READ_ONLY_ATOM, attrs: { kind: n.type, node: JSON.stringify(n) } });

export interface ToEngineOptions {
  /** Also send this top-level block as a read-only atom (sub/sup, comments: see editSession). */
  lock?: (node: DocNode, index: number) => boolean;
}

/** The document the engine is given. Never shares an object with `doc`. */
export function toEngine(doc: DocNode, options: ToEngineOptions = {}): DocNode {
  const { lock } = options;
  const top = lock && doc.content ? { ...doc, content: doc.content.map((n, i) => (lock(n, i) ? atom(n) : n)) } : doc;
  return mapNode(top, (n) => {
    if (n.type === READ_ONLY_ATOM) return { type: n.type, attrs: { ...n.attrs } };
    if (READ_ONLY_TYPES.has(n.type)) return atom(n);
    if (n.marks) {
      const { marks, ...rest } = n;
      return mapNode({ ...rest, marks: renameMark(marks, "textStyle", ENGINE_COLOR_MARK).map(withDisplay) } as DocNode, () => null);
    }
    return null;
  });
}

/** Our document again, from what the engine holds. A damaged atom throws: nothing is dropped silently. */
export function fromEngine(doc: DocNode): DocNode {
  return mapNode(doc, (n) => {
    if (n.type === READ_ONLY_ATOM) {
      const payload = String(n.attrs?.node ?? "");
      try {
        return JSON.parse(payload) as DocNode;
      } catch {
        throw new Error(`A read-only block (${String(n.attrs?.kind)}) came back damaged from the editor`);
      }
    }
    if (n.marks) {
      const { marks, ...rest } = n;
      return mapNode({ ...rest, marks: renameMark(marks.map(withoutDisplay), ENGINE_COLOR_MARK, "textStyle") } as DocNode, () => null);
    }
    return null;
  });
}
