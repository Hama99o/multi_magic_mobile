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
 *  - code blocks and tables are read-only on the phone (SPEC §C8): they
 *    travel as one opaque atom holding the exact node, so they come back
 *    byte for byte and the source map keeps their stored HTML.
 */
import type { DocMark, DocNode } from "./types";

export const ENGINE_COLOR_MARK = "fgColor";
export const READ_ONLY_ATOM = "readOnlyBlock";
const READ_ONLY_TYPES = new Set(["codeBlock", "table"]);

const renameMark = (marks: DocMark[], from: string, to: string): DocMark[] =>
  marks.map((m) => (m.type === from ? { ...m, type: to } : { ...m }));

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

/** The document the engine is given. Never shares an object with `doc`. */
export function toEngine(doc: DocNode): DocNode {
  return mapNode(doc, (n) => {
    if (READ_ONLY_TYPES.has(n.type)) {
      return { type: READ_ONLY_ATOM, attrs: { kind: n.type, node: JSON.stringify(n) } };
    }
    if (n.marks) {
      const { marks, ...rest } = n;
      return mapNode({ ...rest, marks: renameMark(marks, "textStyle", ENGINE_COLOR_MARK) } as DocNode, () => null);
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
      return mapNode({ ...rest, marks: renameMark(marks, ENGINE_COLOR_MARK, "textStyle") } as DocNode, () => null);
    }
    return null;
  });
}
