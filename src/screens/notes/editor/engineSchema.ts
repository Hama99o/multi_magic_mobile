/**
 * Our document schema (tiptop-editor/schema, the web's) declared for engine B
 * under the same node and mark names, as measured on the device spike
 * (2026-11-12, plan §11). Imports the engine: used by the editor screen only,
 * never by the read view or Jest-tested logic.
 *
 * Differences from the web schema, each handled by engineGlue.ts:
 *  - the text colour is `fgColor` (B rewrites a mark named textStyle);
 *  - code blocks, tables, legacy raw blocks, images, and any top-level block
 *    locked by editSession travel as READ_ONLY_ATOM, drawn by ReadOnlyAtom.
 * B refuses objects shared between nodes: the whole schema is deep-copied.
 */
import { defineAtomNode, defineSchema, withAtomsSchema } from "@apollohg/react-native-rich-text-editor";

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
const raw = () => ({ html: { default: "" }, tag: { default: "" } });

const base = defineSchema({
  nodes: {
    doc: { content: "block+", role: "doc" },
    paragraph: { content: "inline*", group: "block", role: "textBlock", attrs: align(), parseDOM: [{ tag: "p" }], toDOM: ["p", 0] },
    heading: {
      content: "inline*", group: "block", role: "heading", attrs: { ...align(), level: { default: 1 } },
      parseDOM: [1, 2, 3].map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: { switchOn: "level", cases: { 1: ["h1", 0], 2: ["h2", 0], 3: ["h3", 0] } },
    },
    blockquote: { content: "block+", group: "block", role: "block", parseDOM: [{ tag: "blockquote" }], toDOM: ["blockquote", 0] },
    bulletList: { content: "listItem+", group: "block", role: "list", parseDOM: [{ tag: "ul" }], toDOM: ["ul", 0] },
    orderedList: { content: "listItem+", group: "block", role: "list", attrs: { start: { default: 1 }, type: { default: null } }, parseDOM: [{ tag: "ol" }], toDOM: ["ol", 0] },
    listItem: { content: "paragraph block*", role: "listItem", parseDOM: [{ tag: "li" }], toDOM: ["li", 0] },
    taskList: { content: "taskItem+", group: "block", role: "list", parseDOM: [{ tag: "ul" }], toDOM: ["ul", 0], html: { tag: "ul", staticAttrs: { "data-type": "taskList" } } },
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
    [ENGINE_COLOR_MARK]: { attrs: { color: { default: null } }, htmlTag: "span" },
    bold: { parseDOM: [{ tag: "strong" }], toDOM: ["strong", 0] },
    code: { excludes: "_", parseDOM: [{ tag: "code" }], toDOM: ["code", 0] },
    italic: { parseDOM: [{ tag: "em" }], toDOM: ["em", 0] },
    strike: { parseDOM: [{ tag: "s" }], toDOM: ["s", 0] },
    underline: { parseDOM: [{ tag: "u" }], toDOM: ["u", 0] },
    highlight: { attrs: { color: { default: null } }, htmlTag: "mark", parseDOM: [{ tag: "mark" }], toDOM: ["mark", 0] },
  },
} as never);

export const notesEngineSchema = JSON.parse(JSON.stringify(withAtomsSchema(base, [readOnlyAtom])));
export const notesEngineAtoms = [readOnlyAtom];
