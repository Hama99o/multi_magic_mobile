/**
 * The Notes editor's document model (SPEC §E, §F): pure transactions on the
 * stored document, plus an undo history. No React, no store, no I/O.
 *
 * Every function takes a document and returns a new one; the input is never
 * mutated. Every result goes through `finalize`, so it is what the web's
 * `getJSON()` would hold after loading it: attribute defaults filled, marks in
 * rank order, neighbouring text merged, and the web's trailing paragraph.
 *
 * Positions: a textblock is named by its `path` (child indexes from the doc).
 * An offset inside it counts UTF-16 units of text, as a TextInput does, and
 * 1 for each inline leaf (hard break, emoji, raw inline), as ProseMirror does.
 *
 * Behaviours follow Tiptap 3.22 (MultiMagic web) where they are visible in the
 * stored document: Return/Backspace in lists (ListKeymap), toggleList joining
 * neighbouring lists, toggleMark's "whole range has it" rule, mark exclusion
 * (code excludes everything), `textAlign` kept on split.
 */
import { getSchemaSpec, normalize, type DocMark, type DocNode, type MarkTypeSpec } from "@/vendor/tiptop-schema";

export type Path = number[];
export interface Caret { path: Path; offset: number }
export interface EditResult { doc: DocNode; caret: Caret }
export type ListType = "bulletList" | "orderedList" | "taskList";
export type Align = null | "left" | "center" | "right" | "justify";
export type TextblockType = { type: "paragraph" } | { type: "heading"; level: 1 | 2 | 3 | number };
/** Backspace either edits, or asks the screen to select the read-only block before the caret. */
export type JoinResult = ({ kind: "edit" } & EditResult) | { kind: "selectBlock"; path: Path; doc: DocNode };

const SPEC = getSchemaSpec();
const MARKS = new Map<string, MarkTypeSpec>(SPEC.marks.map((m) => [m.name, m]));
const RANK = new Map<string, number>(SPEC.marks.map((m, i) => [m.name, i]));
const TEXTBLOCK = new Set(["paragraph", "heading"]);
const LIST = new Set(["bulletList", "orderedList", "taskList"]);
const ITEM = new Set(["listItem", "taskItem"]);
/** Containers the caret walks into. Tables and code are read-only (SPEC §C8). */
const CONTAINER = new Set(["doc", "blockquote", ...LIST, ...ITEM]);

// ---- small helpers -----------------------------------------------------------

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const nodeAt = (doc: DocNode, path: Path): DocNode => path.reduce((n, i) => n.content![i], doc);
const kids = (n: DocNode): DocNode[] => (n.content ??= []);
const size = (n: DocNode): number => (n.type === "text" ? (n.text ?? "").length : 1);
const inlineLength = (content: DocNode[] | undefined) => (content ?? []).reduce((s, n) => s + size(n), 0);
const paragraph = (attrs?: { textAlign?: unknown }, content?: DocNode[]): DocNode => ({
  type: "paragraph",
  attrs: { textAlign: attrs?.textAlign ?? null },
  ...(content && content.length ? { content } : {}),
});
const newList = (type: string, items: DocNode[], like?: DocNode): DocNode => ({
  type,
  ...(type === "orderedList" ? { attrs: like?.type === "orderedList" ? { ...like.attrs } : { start: 1, type: null } } : {}),
  content: items,
});
const isEmptyTextblock = (n: DocNode) => TEXTBLOCK.has(n.type) && inlineLength(n.content) === 0;

/** Cuts inline content at `from`..`to`; text is split, leaves are whole. */
function sliceInline(content: DocNode[] | undefined, from: number, to: number): DocNode[] {
  const out: DocNode[] = [];
  let pos = 0;
  for (const n of content ?? []) {
    const end = pos + size(n);
    if (end > from && pos < to) {
      if (n.type === "text") {
        const text = n.text!.slice(Math.max(0, from - pos), Math.min(n.text!.length, to - pos));
        if (text) out.push({ ...n, text });
      } else out.push(n);
    }
    pos = end;
  }
  return out;
}

/** Applies `fn` to the marks of every text node inside `from`..`to`. */
function mapMarks(content: DocNode[] | undefined, from: number, to: number, fn: (marks: DocMark[]) => DocMark[]): DocNode[] {
  const len = inlineLength(content);
  const inside = sliceInline(content, from, to).map((n) => {
    if (n.type !== "text") return n;
    const marks = fn(n.marks ?? []);
    const { marks: _drop, ...rest } = n;
    return marks.length ? { ...rest, marks } : rest;
  });
  return [...sliceInline(content, 0, from), ...inside, ...sliceInline(content, to, len)];
}

// ---- marks (ProseMirror Mark.addToSet / removeFromSet) -------------------------

/** Directional, as ProseMirror's MarkType.excludes: does mark type `a` push `b` out? */
function excludes(a: string, b: string): boolean {
  const sa = MARKS.get(a);
  if (!sa || !MARKS.get(b)) return false;
  return sa.excludes === undefined ? a === b : sa.excludes === "_" || sa.excludes.split(" ").includes(b);
}

export function addMarkToSet(set: DocMark[], mark: DocMark): DocMark[] {
  let copy: DocMark[] | null = null;
  let placed = false;
  const rank = (m: DocMark) => RANK.get(m.type) ?? Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < set.length; i++) {
    const other = set[i];
    if (other.type === mark.type && JSON.stringify(other.attrs ?? {}) === JSON.stringify(mark.attrs ?? {})) return set;
    if (excludes(mark.type, other.type)) {
      copy ??= set.slice(0, i);
    } else if (excludes(other.type, mark.type)) {
      return set;
    } else {
      if (!placed && rank(other) > rank(mark)) {
        copy ??= set.slice(0, i);
        copy.push(mark);
        placed = true;
      }
      copy?.push(other);
    }
  }
  copy ??= set.slice();
  if (!placed) copy.push(mark);
  return copy;
}

const removeMarkType = (set: DocMark[], type: string) => set.filter((m) => m.type !== type);

/** The marks the next typed character gets: those before the caret, or after it at the block start. */
export function marksAt(doc: DocNode, path: Path, offset: number): DocMark[] {
  const content = nodeAt(doc, path).content ?? [];
  let pos = 0;
  for (let i = 0; i < content.length; i++) {
    const end = pos + size(content[i]);
    if (offset === 0 && i === 0) return content[0].marks ?? [];
    if (end >= offset && pos < offset) return content[i].marks ?? [];
    pos = end;
  }
  return [];
}

// ---- finalize -----------------------------------------------------------------

function dropEmptyText(n: DocNode): DocNode {
  if (!n.content) return n;
  return { ...n, content: n.content.filter((c) => !(c.type === "text" && !c.text)).map(dropEmptyText) };
}

/** What the web's getJSON() holds after loading this document (TrailingNode included). */
export function finalize(doc: DocNode): DocNode {
  const d = normalize(dropEmptyText(doc));
  const content = d.content ?? [];
  if (!content.length || content[content.length - 1].type !== "paragraph") {
    return { ...d, content: [...content, normalize(paragraph())] };
  }
  return d;
}

// ---- reading --------------------------------------------------------------------

/** The editable textblocks, in reading order. Code blocks, tables and raw blocks are skipped. */
export function textblockPaths(doc: DocNode): Path[] {
  const out: Path[] = [];
  const walk = (n: DocNode, path: Path) => {
    if (TEXTBLOCK.has(n.type)) out.push(path);
    else if (CONTAINER.has(n.type)) (n.content ?? []).forEach((c, i) => walk(c, [...path, i]));
  };
  walk(doc, []);
  return out;
}

// ---- text ---------------------------------------------------------------------

/** Replaces `from`..`to` with `text`. Without `marks`, the text takes the marks at `from`. */
export function insertText(doc: DocNode, path: Path, from: number, to: number, text: string, marks?: DocMark[]): EditResult {
  const d = clone(doc);
  const block = nodeAt(d, path);
  const m = marks ?? marksAt(doc, path, from);
  const len = inlineLength(block.content);
  const inserted: DocNode[] = text ? [m.length ? { type: "text", text, marks: m } : { type: "text", text }] : [];
  block.content = [...sliceInline(block.content, 0, from), ...inserted, ...sliceInline(block.content, to, len)];
  return { doc: finalize(d), caret: { path, offset: from + text.length } };
}

/** Tiptap's toggleMark: removes the mark when the whole range has it, otherwise adds it everywhere. */
export function toggleMark(doc: DocNode, path: Path, from: number, to: number, mark: DocMark): DocNode {
  if (from === to) return doc;
  const block = nodeAt(doc, path);
  const texts = sliceInline(block.content, from, to).filter((n) => n.type === "text");
  const all = texts.length > 0 && texts.every((n) => (n.marks ?? []).some((x) => x.type === mark.type));
  const d = clone(doc);
  const target = nodeAt(d, path);
  target.content = mapMarks(target.content, from, to, (set) => (all ? removeMarkType(set, mark.type) : addMarkToSet(set, mark)));
  return finalize(d);
}

/** Sets a mark with attributes over the range (colour, highlight, link), or removes it with `null`. */
export function setMark(doc: DocNode, path: Path, from: number, to: number, type: string, attrs: Record<string, unknown> | null): DocNode {
  if (from === to) return doc;
  const d = clone(doc);
  const target = nodeAt(d, path);
  target.content = mapMarks(target.content, from, to, (set) => {
    const rest = removeMarkType(set, type);
    return attrs ? addMarkToSet(rest, { type, attrs }) : rest;
  });
  return finalize(d);
}

// ---- structure ----------------------------------------------------------------

/** Moves a list item out one level: into the outer list when nested, out of the list otherwise. */
function liftItem(d: DocNode, itemPath: Path, tbIndex: number): EditResult {
  const listPath = itemPath.slice(0, -1);
  const i = itemPath[itemPath.length - 1];
  const list = nodeAt(d, listPath);
  const items = kids(list);
  const item = items[i];
  const before = items.slice(0, i);
  const after = items.slice(i + 1);
  const holderPath = listPath.slice(0, -1);
  const holder = nodeAt(d, holderPath);
  const li = listPath[listPath.length - 1];

  if (ITEM.has(holder.type)) {
    // Nested: the item joins the outer list, right after the item holding its list.
    const outerListPath = holderPath.slice(0, -1);
    const outerList = nodeAt(d, outerListPath);
    const hi = holderPath[holderPath.length - 1];
    let moved = item;
    if (after.length) moved = { ...moved, content: [...kids(moved), newList(list.type, after, list)] };
    if (outerList.type === "taskList" ? moved.type !== "taskItem" : moved.type !== "listItem") {
      moved = outerList.type === "taskList" ? { type: "taskItem", attrs: { checked: false }, content: kids(moved) } : { type: "listItem", content: kids(moved) };
    }
    if (before.length) list.content = before;
    else kids(holder).splice(li, 1);
    kids(outerList).splice(hi + 1, 0, moved);
    return { doc: finalize(d), caret: { path: [...outerListPath, hi + 1, tbIndex], offset: 0 } };
  }

  const blocks = kids(item);
  const replacement = [
    ...(before.length ? [newList(list.type, before, list)] : []),
    ...blocks,
    ...(after.length ? [newList(list.type, after, list)] : []),
  ];
  kids(holder).splice(li, 1, ...replacement);
  return { doc: finalize(d), caret: { path: [...holderPath, li + (before.length ? 1 : 0) + tbIndex], offset: 0 } };
}

/** Lifts a textblock out of the blockquote holding it, splitting the quote around it. */
function liftOutOfQuote(d: DocNode, path: Path): EditResult {
  const quotePath = path.slice(0, -1);
  const quote = nodeAt(d, quotePath);
  const i = path[path.length - 1];
  const before = kids(quote).slice(0, i);
  const after = kids(quote).slice(i + 1);
  const holder = nodeAt(d, quotePath.slice(0, -1));
  const qi = quotePath[quotePath.length - 1];
  kids(holder).splice(qi, 1,
    ...(before.length ? [{ type: "blockquote", content: before }] : []),
    kids(quote)[i],
    ...(after.length ? [{ type: "blockquote", content: after }] : []));
  return { doc: finalize(d), caret: { path: [...quotePath.slice(0, -1), qi + (before.length ? 1 : 0)], offset: 0 } };
}

/** Return. Splits the block; in a list, splits the item; an empty last item ends the list. */
export function splitBlock(doc: DocNode, path: Path, offset: number): EditResult {
  const d = clone(doc);
  const block = nodeAt(d, path);
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(d, parentPath);
  const i = path[path.length - 1];
  const len = inlineLength(block.content);
  const head = sliceInline(block.content, 0, offset);
  const tail = sliceInline(block.content, offset, len);

  if (ITEM.has(parent.type)) {
    if (len === 0 && i === kids(parent).length - 1 && i === 0) return liftItem(d, parentPath, 0);
    const listPath = parentPath.slice(0, -1);
    const list = nodeAt(d, listPath);
    const ii = parentPath[parentPath.length - 1];
    const rest = kids(parent).slice(i + 1);
    block.content = head;
    parent.content = [...kids(parent).slice(0, i), block];
    const first = paragraph(block.attrs, tail);
    const fresh: DocNode = parent.type === "taskItem"
      ? { type: "taskItem", attrs: { checked: false }, content: [first, ...rest] }
      : { type: "listItem", content: [first, ...rest] };
    kids(list).splice(ii + 1, 0, fresh);
    return { doc: finalize(d), caret: { path: [...listPath, ii + 1, 0], offset: 0 } };
  }

  if (parent.type === "blockquote" && len === 0) return liftOutOfQuote(d, path);

  block.content = head;
  const atEnd = offset >= len;
  const next: DocNode = block.type === "heading" && !atEnd
    ? { type: "heading", attrs: { ...block.attrs }, content: tail }
    : paragraph(block.attrs, tail);
  kids(parent).splice(i + 1, 0, next);
  return { doc: finalize(d), caret: { path: [...parentPath, i + 1], offset: 0 } };
}

/** The deepest last textblock of a block, or the path of a read-only block met on the way. */
function lastLeaf(d: DocNode, path: Path): { path: Path; text: boolean } {
  const n = nodeAt(d, path);
  if (TEXTBLOCK.has(n.type)) return { path, text: true };
  if (CONTAINER.has(n.type) && n.content?.length) return lastLeaf(d, [...path, n.content.length - 1]);
  return { path, text: false };
}

/** Backspace at the start of a textblock. */
export function joinBackward(doc: DocNode, path: Path): JoinResult | null {
  const d = clone(doc);
  const block = nodeAt(d, path);
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(d, parentPath);
  const i = path[path.length - 1];

  if (ITEM.has(parent.type) && i === 0) return { kind: "edit", ...liftItem(d, parentPath, 0) };
  if (parent.type === "blockquote" && i === 0) return { kind: "edit", ...liftOutOfQuote(d, path) };
  if (i === 0) return null;

  const prevPath = [...parentPath, i - 1];
  const leaf = lastLeaf(d, prevPath);
  if (!leaf.text) {
    if (isEmptyTextblock(block)) kids(parent).splice(i, 1);
    return { kind: "selectBlock", path: leaf.path, doc: finalize(d) };
  }
  const target = nodeAt(d, leaf.path);
  const offset = inlineLength(target.content);
  target.content = [...kids(target), ...(block.content ?? [])];
  kids(parent).splice(i, 1);
  return { kind: "edit", doc: finalize(d), caret: { path: leaf.path, offset } };
}

/** Paragraph ⇄ heading. Null where the schema refuses it (a heading opening a list item). */
export function setTextblockType(doc: DocNode, path: Path, to: TextblockType): DocNode | null {
  const parent = nodeAt(doc, path.slice(0, -1));
  const i = path[path.length - 1];
  if (to.type === "heading" && (parent.type === "taskItem" || (parent.type === "listItem" && i === 0))) return null;
  const d = clone(doc);
  const block = nodeAt(d, path);
  const textAlign = block.attrs?.textAlign ?? null;
  block.type = to.type;
  block.attrs = to.type === "heading" ? { textAlign, level: to.level } : { textAlign };
  return finalize(d);
}

/** Stores the web's physical values (`left`/`right`, not start/end). */
export function setAlign(doc: DocNode, path: Path, align: Align): DocNode {
  const d = clone(doc);
  const block = nodeAt(d, path);
  block.attrs = { ...block.attrs, textAlign: align };
  return finalize(d);
}

/** Joins neighbouring lists of one type around index `i` of `holder`; returns i's new index. */
function joinLists(holder: DocNode, i: number): { index: number; offset: number } {
  const c = kids(holder);
  let index = i;
  let offset = 0;
  if (index > 0 && c[index - 1].type === c[index].type) {
    offset = kids(c[index - 1]).length;
    c[index - 1].content = [...kids(c[index - 1]), ...kids(c[index])];
    c.splice(index, 1);
    index -= 1;
  }
  if (index + 1 < c.length && c[index + 1].type === c[index].type) {
    c[index].content = [...kids(c[index]), ...kids(c[index + 1])];
    c.splice(index + 1, 1);
  }
  return { index, offset };
}

/** The bullet / number / to-do keys. Null when the change is not allowed by the schema. */
export function toggleList(doc: DocNode, path: Path, type: ListType): EditResult | null {
  const d = clone(doc);
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(d, parentPath);
  const tbIndex = path[path.length - 1];

  if (ITEM.has(parent.type)) {
    const listPath = parentPath.slice(0, -1);
    const list = nodeAt(d, listPath);
    if (list.type === type) return liftItem(d, parentPath, tbIndex);
    const items = kids(list);
    if (type === "taskList" && items.some((it) => kids(it).some((c) => c.type !== "paragraph"))) return null;
    const converted = newList(type, items.map((it) => (type === "taskList"
      ? { type: "taskItem", attrs: { checked: false }, content: kids(it) }
      : { type: "listItem", content: kids(it) })));
    nodeAt(d, listPath.slice(0, -1)).content![listPath[listPath.length - 1]] = converted;
    return { doc: finalize(d), caret: { path, offset: 0 } };
  }

  const block = nodeAt(d, path);
  const para = paragraph(block.attrs, block.content);
  kids(parent)[tbIndex] = newList(type, [type === "taskList"
    ? { type: "taskItem", attrs: { checked: false }, content: [para] }
    : { type: "listItem", content: [para] }]);
  const { index, offset } = joinLists(parent, tbIndex);
  return { doc: finalize(d), caret: { path: [...parentPath, index, offset, 0], offset: 0 } };
}

/** Tab in a list: the item goes into the previous item's nested list. To-dos do not nest on the web. */
export function indentItem(doc: DocNode, path: Path): EditResult | null {
  const itemPath = path.slice(0, -1);
  const item = nodeAt(doc, itemPath);
  const i = itemPath[itemPath.length - 1];
  if (item.type !== "listItem" || i === 0) return null;
  const d = clone(doc);
  const listPath = itemPath.slice(0, -1);
  const list = nodeAt(d, listPath);
  const prev = kids(list)[i - 1];
  const moved = kids(list)[i];
  kids(list).splice(i, 1);
  const last = kids(prev)[kids(prev).length - 1];
  let nestedIndex: number;
  let at: number;
  if (last && last.type === list.type) {
    at = kids(last).length;
    kids(last).push(moved);
    nestedIndex = kids(prev).length - 1;
  } else {
    kids(prev).push(newList(list.type, [moved]));
    nestedIndex = kids(prev).length - 1;
    at = 0;
  }
  return { doc: finalize(d), caret: { path: [...listPath, i - 1, nestedIndex, at, path[path.length - 1]], offset: 0 } };
}

/** Shift-Tab in a list: out one level, or out of the list at the top level. */
export function outdentItem(doc: DocNode, path: Path): EditResult | null {
  const itemPath = path.slice(0, -1);
  if (!ITEM.has(nodeAt(doc, itemPath).type)) return null;
  return liftItem(clone(doc), itemPath, path[path.length - 1]);
}

export function toggleTask(doc: DocNode, itemPath: Path): DocNode {
  const d = clone(doc);
  const item = nodeAt(d, itemPath);
  item.attrs = { ...item.attrs, checked: !item.attrs?.checked };
  return finalize(d);
}

/** Quote key: lifts a textblock out of its quote, or wraps the caret's top-level block. */
export function toggleQuote(doc: DocNode, path: Path): EditResult | null {
  const d = clone(doc);
  if (nodeAt(d, path.slice(0, -1)).type === "blockquote") return liftOutOfQuote(d, path);
  const top = path[0];
  kids(d)[top] = { type: "blockquote", content: [kids(d)[top]] };
  return { doc: finalize(d), caret: { path: [top, 0, ...path.slice(1)], offset: 0 } };
}

// ---- whole blocks --------------------------------------------------------------

/**
 * Inserts a block (rule, image) after the caret's top-level block, or in place
 * of it when it is an empty paragraph. The caret goes to a paragraph after it.
 */
export function insertBlock(doc: DocNode, path: Path, node: DocNode): EditResult {
  const d = clone(doc);
  const c = kids(d);
  const top = path[0];
  let at: number;
  if (c[top].type === "paragraph" && isEmptyTextblock(c[top])) {
    c[top] = clone(node);
    at = top;
  } else {
    c.splice(top + 1, 0, clone(node));
    at = top + 1;
  }
  if (!c[at + 1] || !TEXTBLOCK.has(c[at + 1].type)) c.splice(at + 1, 0, paragraph());
  return { doc: finalize(d), caret: { path: [at + 1], offset: 0 } };
}

/** Deletes a block (or a list item). Wrappers left empty go too; a table cell keeps a paragraph. */
export function removeBlock(doc: DocNode, blockPath: Path): DocNode {
  const d = clone(doc);
  let path = blockPath;
  while (path.length) {
    const parentPath = path.slice(0, -1);
    const parent = nodeAt(d, parentPath);
    kids(parent).splice(path[path.length - 1], 1);
    if (kids(parent).length || parent.type === "doc") break;
    if (parent.type === "tableCell" || parent.type === "tableHeader") {
      parent.content = [paragraph()];
      break;
    }
    path = parentPath;
  }
  return finalize(d);
}

/** Move up / down inside the same parent (a list item stays in its list). Null past an edge. */
export function moveBlock(doc: DocNode, blockPath: Path, delta: number): DocNode | null {
  const parentPath = blockPath.slice(0, -1);
  const i = blockPath[blockPath.length - 1];
  const j = i + delta;
  if (j < 0 || j >= kids(nodeAt(doc, parentPath)).length) return null;
  const d = clone(doc);
  const c = kids(nodeAt(d, parentPath));
  const [moved] = c.splice(i, 1);
  c.splice(j, 0, moved);
  return finalize(d);
}

// ---- history --------------------------------------------------------------------

export interface EditorState { doc: DocNode; caret: Caret | null }
export type ChangeKind = "typing" | "format" | "structure" | "insert" | "delete" | "move";
export interface History {
  done: EditorState[];
  undone: EditorState[];
  lastKind: ChangeKind | null;
  lastTime: number;
}

const HISTORY_LIMIT = 200;
const TYPING_GROUP_MS = 500;

export const createHistory = (): History => ({ done: [], undone: [], lastKind: null, lastTime: 0 });

/**
 * Records the state BEFORE a change. Typing with pauses under 500 ms is one
 * step (SPEC §C11); every other kind of change is a step of its own.
 */
export function record(h: History, before: EditorState, kind: ChangeKind, now: number): History {
  if (kind === "typing" && h.lastKind === "typing" && now - h.lastTime < TYPING_GROUP_MS) {
    return { ...h, undone: [], lastTime: now };
  }
  return { done: [...h.done, before].slice(-HISTORY_LIMIT), undone: [], lastKind: kind, lastTime: now };
}

export function undo(h: History, current: EditorState): { history: History; state: EditorState } | null {
  if (!h.done.length) return null;
  const state = h.done[h.done.length - 1];
  return { state, history: { done: h.done.slice(0, -1), undone: [...h.undone, current], lastKind: null, lastTime: 0 } };
}

export function redo(h: History, current: EditorState): { history: History; state: EditorState } | null {
  if (!h.undone.length) return null;
  const state = h.undone[h.undone.length - 1];
  return { state, history: { done: [...h.done, current], undone: h.undone.slice(0, -1), lastKind: null, lastTime: 0 } };
}
