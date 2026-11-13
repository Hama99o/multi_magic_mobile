/**
 * Our document schema (tiptop-editor/schema, the web's) declared for engine B
 * under the same node and mark names, as measured on the device spike
 * (2026-11-12, plan §11). Imports the engine: used by the editor screen only,
 * never by the read view or Jest-tested logic.
 *
 * Differences from the web schema, each handled by engineGlue.ts:
 *  - the text colour is `fgColor` (B rewrites a mark named textStyle);
 *  - tables, legacy raw blocks and images travel as READ_ONLY_ATOM, drawn by
 *    ReadOnlyAtom (code blocks, sub/sup and comments are ordinary nodes/marks).
 * B refuses objects shared between nodes: the whole schema is deep-copied.
 */
import { defineAtomNode, defineSchema, withAtomsSchema, withTablesSchema } from "@apollohg/react-native-rich-text-editor";

import { ENGINE_COLOR_MARK, READ_ONLY_ATOM } from "./engineGlue";
import { ReadOnlyAtom } from "./ReadOnlyAtom";

export const readOnlyAtom = defineAtomNode({
  name: READ_ONLY_ATOM,
  attrs: { kind: { type: "string", default: "" }, node: { type: "string", default: "" } },
  html: { tag: "div", staticAttrs: { "data-mm-read-only": "true" } },
  component: ReadOnlyAtom,
  estimatedHeight: 96,
});

const align = () => ({ textAlign: { default: null } });
// Web comments travel invisibly (EDIT_EVERYTHING.md §4): commentId on the
// commentable blocks (spec COMMENTABLE_NODE_TYPES), a comment mark on text.
const commentId = () => ({ commentId: { default: null } });
const raw = () => ({ html: { default: "" }, tag: { default: "" } });

// Tables are B's own nodes under Tiptap's names (table, tableRow, tableCell,
// tableHeader, with colspan/rowspan/colwidth): the spike kept 23/23 notes equal.
const base = withTablesSchema(defineSchema({
  nodes: {
    doc: { content: "block+", role: "doc" },
    paragraph: { content: "inline*", group: "block", role: "textBlock", attrs: { ...align(), ...commentId() }, parseDOM: [{ tag: "p" }], toDOM: ["p", 0] },
    heading: {
      content: "inline*", group: "block", role: "heading", attrs: { ...align(), ...commentId(), level: { default: 1 } },
      parseDOM: [1, 2, 3].map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: { switchOn: "level", cases: { 1: ["h1", 0], 2: ["h2", 0], 3: ["h3", 0] } },
    },
    blockquote: { content: "block+", group: "block", role: "block", attrs: commentId(), parseDOM: [{ tag: "blockquote" }], toDOM: ["blockquote", 0] },
    codeBlock: {
      content: "text*", group: "block", role: "textBlock", attrs: { language: { default: null }, ...commentId() },
      parseDOM: [{ tag: "pre" }], toDOM: ["pre", 0],
    },
    bulletList: { content: "listItem+", group: "block", role: "list", attrs: commentId(), parseDOM: [{ tag: "ul" }], toDOM: ["ul", 0] },
    orderedList: { content: "listItem+", group: "block", role: "list", attrs: { ...commentId(), start: { default: 1 }, type: { default: null } }, parseDOM: [{ tag: "ol" }], toDOM: ["ol", 0] },
    listItem: { content: "paragraph block*", role: "listItem", parseDOM: [{ tag: "li" }], toDOM: ["li", 0] },
    taskList: { content: "taskItem+", group: "block", role: "list", attrs: commentId(), parseDOM: [{ tag: "ul" }], toDOM: ["ul", 0], html: { tag: "ul", staticAttrs: { "data-type": "taskList" } } },
    taskItem: {
      content: "paragraph+", role: "listItem", attrs: { checked: { type: "boolean", default: false } },
      parseDOM: [{ tag: "li" }], toDOM: ["li", 0], html: { tag: "li", staticAttrs: { "data-type": "taskItem" }, attrMap: { checked: "data-checked" } },
    },
    hardBreak: { group: "inline", role: "hardBreak", parseDOM: [{ tag: "br" }], toDOM: ["br"], isVoid: true },
    horizontalRule: { group: "block", role: "block", parseDOM: [{ tag: "hr" }], toDOM: ["hr"], isVoid: true },
    emoji: { group: "inline", role: "inline", attrs: { name: { default: null } }, isVoid: true, toDOM: ["span"] },
    rawInline: { group: "inline", role: "inline", attrs: raw(), isVoid: true, toDOM: ["span"] },
    text: { group: "inline", role: "text" },
  },
  marks: {
    link: {
      attrs: { href: { default: null }, target: { default: "_blank" }, rel: { default: "noopener noreferrer nofollow" }, class: { default: null }, title: { default: null } },
      inclusive: true, parseDOM: [{ tag: "a" }], toDOM: ["a", 0],
    },
    // `display`: the same colour as #rrggbb, drawn by the patched renderer (engineGlue).
    [ENGINE_COLOR_MARK]: { attrs: { color: { default: null }, display: { default: null } }, htmlTag: "span" },
    bold: { parseDOM: [{ tag: "strong" }], toDOM: ["strong", 0] },
    code: { excludes: "_", parseDOM: [{ tag: "code" }], toDOM: ["code", 0] },
    italic: { parseDOM: [{ tag: "em" }], toDOM: ["em", 0] },
    strike: { parseDOM: [{ tag: "s" }], toDOM: ["s", 0] },
    underline: { parseDOM: [{ tag: "u" }], toDOM: ["u", 0] },
    highlight: { attrs: { color: { default: null }, display: { default: null } }, htmlTag: "mark", parseDOM: [{ tag: "mark" }], toDOM: ["mark", 0] },
    subscript: { htmlTag: "sub", parseDOM: [{ tag: "sub" }], toDOM: ["sub", 0] },
    superscript: { htmlTag: "sup", parseDOM: [{ tag: "sup" }], toDOM: ["sup", 0] },
    comment: { attrs: { commentId: { default: null } }, htmlTag: "span" },
  },
} as never), { preset: "tiptap" } as never);

// The web's table cells carry `align` (tiptop's table cell); B's table preset
// does not declare it and B drops undeclared attributes, so add it (caught by
// engineSchema.test, 2026-11-13).
type NodeList = { name: string; attrs?: Record<string, unknown> }[];
const withCellAlign = <S extends { nodes: NodeList }>(schema: S): S => ({
  ...schema,
  nodes: schema.nodes.map((n) =>
    n.name === "tableCell" || n.name === "tableHeader" ? { ...n, attrs: { ...(n.attrs ?? {}), align: { default: null } } } : n,
  ),
});

export const notesEngineSchema = JSON.parse(JSON.stringify(withAtomsSchema(withCellAlign(base as never) as never, [readOnlyAtom])));
export const notesEngineAtoms = [readOnlyAtom];
