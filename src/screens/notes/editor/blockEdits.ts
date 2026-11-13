/**
 * STRUCTURAL EDITS ENGINE B HAS NO COMMAND FOR (EDIT_EVERYTHING.md §1):
 * paragraph/heading ↔ code block, a code block's language, deleting a
 * block. Pure, on the engine's JSON (DocNode); never changes its input.
 *
 * The screen finds the block from B's selection, a ProseMirror position:
 * each text counts its UTF-16 length, each leaf (hard break, emoji, rule,
 * atom…) counts 1, and every other node counts 2 plus its content.
 */
import type { DocNode } from "./types";

const TEXTBLOCKS = new Set(["paragraph", "heading", "codeBlock"]);
const LEAVES = new Set(["hardBreak", "horizontalRule", "emoji", "rawInline", "rawBlock", "imageUploader", "readOnlyBlock"]);

/** lowlight's `common` languages (the web loads them all; these are the ones offered), Plain text first. */
export const CODE_LANGUAGES: { id: string | null; name: string }[] = [
  { id: null, name: "Plain text" },
  ...([
    ["arduino", "Arduino"], ["bash", "Bash"], ["c", "C"], ["cpp", "C++"], ["csharp", "C#"], ["css", "CSS"],
    ["diff", "Diff"], ["go", "Go"], ["graphql", "GraphQL"], ["ini", "INI"], ["java", "Java"],
    ["javascript", "JavaScript"], ["json", "JSON"], ["kotlin", "Kotlin"], ["less", "Less"], ["lua", "Lua"],
    ["makefile", "Makefile"], ["markdown", "Markdown"], ["objectivec", "Objective-C"], ["perl", "Perl"],
    ["php", "PHP"], ["python", "Python"], ["r", "R"], ["ruby", "Ruby"], ["rust", "Rust"], ["scss", "SCSS"],
    ["shell", "Shell"], ["sql", "SQL"], ["swift", "Swift"], ["typescript", "TypeScript"], ["vbnet", "VB.NET"],
    ["wasm", "WebAssembly"], ["xml", "HTML, XML"], ["yaml", "YAML"],
  ] as const).map(([id, name]) => ({ id, name })),
];

const clone = (d: DocNode): DocNode => JSON.parse(JSON.stringify(d)) as DocNode;

export function nodeSize(node: DocNode): number {
  if (node.type === "text") return (node.text ?? "").length;
  if (LEAVES.has(node.type)) return 1;
  return 2 + (node.content ?? []).reduce((sum, c) => sum + nodeSize(c), 0);
}

/** The textblock a caret at `pos` is in (path of child indexes from the doc), or null between blocks. */
export function textblockAt(doc: DocNode, pos: number): { path: number[]; node: DocNode } | null {
  const walk = (nodes: DocNode[], base: number, path: number[]): { path: number[]; node: DocNode } | null => {
    let start = base;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const size = nodeSize(node);
      const end = start + size;
      if (TEXTBLOCKS.has(node.type)) {
        if (pos >= start + 1 && pos <= end - 1) return { path: [...path, i], node };
      } else if (!LEAVES.has(node.type) && pos > start && pos < end) {
        return walk(node.content ?? [], start + 1, [...path, i]);
      }
      start = end;
    }
    return null;
  };
  return walk(doc.content ?? [], 0, []);
}

function replaceAt(doc: DocNode, path: number[], make: (node: DocNode) => DocNode | null): DocNode {
  const out = clone(doc);
  let parent = out;
  for (const i of path.slice(0, -1)) parent = parent.content![i];
  const last = path[path.length - 1];
  const next = make(parent.content![last]);
  if (next) parent.content![last] = next;
  else parent.content!.splice(last, 1);
  return out;
}

/** The plain text of a textblock, hard breaks as newlines (what a code block holds). */
function plainLines(node: DocNode): string {
  return (node.content ?? []).map((c) => (c.type === "text" ? c.text ?? "" : c.type === "hardBreak" ? "\n" : "")).join("");
}

/** Nodes whose content must start with a paragraph (Tiptap: "paragraph block*"). */
const STARTS_WITH_PARAGRAPH = new Set(["listItem", "taskItem"]);

function parentOf(doc: DocNode, path: number[]): DocNode {
  let parent = doc;
  for (const i of path.slice(0, -1)) parent = parent.content![i];
  return parent;
}

/**
 * The first paragraph of a list or task item stays: the item must start with
 * one, so the web's toggleCodeBlock refuses there, and B would throw on the
 * result (device, 2026-11-14: the screen crashed). Returns `doc` itself.
 */
export function toCodeBlockAt(doc: DocNode, path: number[]): DocNode {
  if (path[path.length - 1] === 0 && STARTS_WITH_PARAGRAPH.has(parentOf(doc, path).type)) return doc;
  return replaceAt(doc, path, (node) => {
    const text = plainLines(node);
    return { type: "codeBlock", attrs: { language: null }, ...(text ? { content: [{ type: "text", text }] } : {}) };
  });
}

export function toParagraphAt(doc: DocNode, path: number[]): DocNode {
  return replaceAt(doc, path, (node) => {
    const lines = plainLines(node).split("\n");
    const content: DocNode[] = [];
    lines.forEach((line, i) => {
      if (i > 0) content.push({ type: "hardBreak" });
      if (line) content.push({ type: "text", text: line });
    });
    return content.length ? { type: "paragraph", content } : { type: "paragraph" };
  });
}

export function setCodeLanguageAt(doc: DocNode, path: number[], language: string | null): DocNode {
  return replaceAt(doc, path, (node) => ({ ...node, attrs: { ...(node.attrs ?? {}), language } }));
}

/** Remove a block; a document left empty gets the web's empty paragraph. */
export function deleteBlockAt(doc: DocNode, path: number[]): DocNode {
  const out = replaceAt(doc, path, () => null);
  if (!out.content?.length) out.content = [{ type: "paragraph" }];
  return out;
}
