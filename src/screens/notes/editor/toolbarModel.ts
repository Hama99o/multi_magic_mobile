/**
 * THE EDITOR TOOLBAR'S LOGIC (SPEC §C3, EDIT_EVERYTHING.md; owner,
 * 2026-11-13: "everything the web editor can do, the phone can do").
 *
 * Pure: from the editor's state (marks and nodes at the selection, history,
 * the open panel) to the keys to draw, in order, each with the command it
 * runs. The component (EditorToolbar.tsx) only draws keys; the screen turns
 * a command into engine calls (engineCommands.ts).
 *
 * Sources, so parity is checked, not remembered:
 *  - the slash commands and their groups: tiptop-editor `commandGroups`
 *    (src/constants.ts): Typography, Format, Insert;
 *  - the colours: `colorSections`, the hsl() strings the web stores;
 *  - heading levels [1, 2, 3] (tiptop-editor/schema spec): no H4–H6;
 *  - `code` excludes every other mark (spec `excludes: '_'`).
 */

export type BlockType = "paragraph" | "h1" | "h2" | "h3" | "blockquote" | "codeBlock";
export type ListType = "bulletList" | "orderedList" | "taskList";
export type MarkName = "bold" | "italic" | "underline" | "strike" | "code" | "subscript" | "superscript";
export type Align = "left" | "center" | "right" | "justify";
export type InsertType = "horizontalRule" | "image" | "table";
export type Panel = "format" | "insert" | "textColor" | "highlight" | "blockType" | "codeLanguage";

export type Command =
  | { kind: "mark"; mark: MarkName }
  | { kind: "link" }
  | { kind: "color"; which: "text" | "highlight"; value: string | null }
  | { kind: "align"; value: Align }
  | { kind: "block"; value: BlockType }
  | { kind: "list"; value: ListType }
  | { kind: "insert"; value: InsertType }
  | { kind: "indent" }
  | { kind: "outdent" }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "panel"; panel: Panel | null }
  | { kind: "sheet"; sheet: "noteColor" | "more" }
  | { kind: "none" }
  | { kind: "hideKeyboard" };

export interface ToolbarInput {
  /** Marks active at the selection (engine B's ActiveState.marks). */
  marks: Record<string, boolean>;
  /** Node types enclosing the selection (ActiveState.nodes). */
  nodes: Record<string, boolean>;
  /** The heading's level when the caret is in one (from our document). */
  headingLevel?: number;
  /** The code block's language when the caret is in one (null = plain text). */
  codeLanguage?: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Text is selected (not just a caret). */
  hasSelection: boolean;
  /** The caret is in the body (Keep's A key wakes up). */
  focused?: boolean;
  panel: Panel | null;
}

export interface ToolbarKey {
  id: string;
  command: Command;
  active: boolean;
  disabled: boolean;
  /** For the block-type key: the type the caret is in. */
  value?: string;
}

const color = (key: string, value: string | null) => ({ key, value });
const HUES: [string, string][] = [
  ["gray", "hsl(0, 0%, 61%)"],
  ["brown", "hsl(18, 35%, 58%)"],
  ["orange", "hsl(25, 53%, 53%)"],
  ["yellow", "hsl(36, 54%, 55%)"],
  ["green", "hsl(145, 32%, 47%)"],
  ["blue", "hsl(202, 64%, 52%)"],
  ["purple", "hsl(270, 55%, 62%)"],
  ["pink", "hsl(329, 57%, 58%)"],
  ["red", "hsl(1, 69%, 60%)"],
];
/** The web's text colours (`colorSections.text`); `null` = default (no mark). */
export const TEXT_COLORS = [color("default", null), ...HUES.map(([k, v]) => color(k, v))];
/** The web's highlight colours (`colorSections.highlight`). */
export const HIGHLIGHT_COLORS = [color("default", null), ...HUES.map(([k, v]) => color(k, v))];

/** The web's slash-command groups, in its order (`commandGroups`). */
export const INSERT_GROUPS: { key: "typography" | "format" | "insert"; items: string[] }[] = [
  { key: "typography", items: ["paragraph", "h1", "h2", "h3"] },
  { key: "format", items: ["bulletList", "orderedList", "taskList", "blockquote", "codeBlock"] },
  { key: "insert", items: ["horizontalRule", "image", "table"] },
];

const MARKS: MarkName[] = ["bold", "italic", "underline", "strike", "code", "subscript", "superscript"];
const LISTS: ListType[] = ["bulletList", "orderedList", "taskList"];
const BLOCKS: BlockType[] = ["paragraph", "h1", "h2", "h3", "blockquote", "codeBlock"];
const ALIGNS: Align[] = ["left", "center", "right", "justify"];

function currentBlock(input: ToolbarInput): BlockType {
  if (input.nodes.codeBlock) return "codeBlock";
  if (input.nodes.heading) {
    const level = input.headingLevel ?? 1;
    return level === 2 ? "h2" : level === 3 ? "h3" : "h1";
  }
  if (input.nodes.blockquote) return "blockquote";
  return "paragraph";
}

/** The key an insert-menu item becomes. */
function insertItem(item: string): { id: string; command: Command } {
  if ((LISTS as string[]).includes(item)) return { id: item, command: { kind: "list", value: item as ListType } };
  if ((BLOCKS as string[]).includes(item)) return { id: `block:${item}`, command: { kind: "block", value: item as BlockType } };
  return { id: `insert:${item}`, command: { kind: "insert", value: item as InsertType } };
}

export function buildToolbar(input: ToolbarInput): { keys: ToolbarKey[] } {
  const inCode = Boolean(input.marks.code);
  const inCodeBlock = Boolean(input.nodes.codeBlock);
  const block = currentBlock(input);

  const k = (id: string, command: Command, active = false, disabled = false, value?: string): ToolbarKey => ({
    id, command, active, disabled, ...(value ? { value } : {}),
  });
  const toggle = (panel: Panel): Command => ({ kind: "panel", panel: input.panel === panel ? null : panel });
  const panelKey = (id: string, panel: Panel, disabled = false) => k(id, toggle(panel), input.panel === panel, disabled);
  const markKey = (mark: MarkName) =>
    k(mark, { kind: "mark", mark }, Boolean(input.marks[mark]), inCodeBlock || (inCode && mark !== "code"));
  const listKey = (list: ListType) => k(list, { kind: "list", value: list }, Boolean(input.nodes[list]), inCodeBlock);
  const colorKeys = () => [panelKey("textColor", "textColor", inCode || inCodeBlock), panelKey("highlight", "highlight", inCode || inCodeBlock)];
  const hide = k("hideKeyboard", { kind: "hideKeyboard" });
  const close = k("closePanel", { kind: "panel", panel: null });

  switch (input.panel) {
    case "format":
      return {
        keys: [
          close,
          ...BLOCKS.map((b) => k(`block:${b}`, { kind: "block", value: b }, block === b)),
          ...MARKS.map(markKey),
          listKey("taskList"), // the checklist first (Apple Notes)
          listKey("bulletList"),
          listKey("orderedList"),
          k("outdent", { kind: "outdent" }),
          k("indent", { kind: "indent" }),
          ...ALIGNS.map((a) => k(`align:${a}`, { kind: "align", value: a })),
          ...colorKeys(),
        ],
      };
    case "insert":
      return { keys: [close, ...INSERT_GROUPS.flatMap((g) => g.items.map(insertItem)).map(({ id, command }) => k(id, command))] };
    case "textColor":
      return { keys: [close, ...TEXT_COLORS.map((c) => k(`textColor:${c.key}`, { kind: "color", which: "text", value: c.value }))] };
    case "highlight":
      return { keys: [close, ...HIGHLIGHT_COLORS.map((c) => k(`highlight:${c.key}`, { kind: "color", which: "highlight", value: c.value }))] };
    case "blockType":
      return { keys: [close, ...BLOCKS.map((b) => k(`block:${b}`, { kind: "block", value: b }, block === b))] };
    case "codeLanguage": // a sheet, drawn by the screen; the row stays the main one
    default:
      break;
  }

  if (input.hasSelection) {
    return { keys: [...MARKS.map(markKey), k("link", { kind: "link" }, Boolean(input.marks.link), inCodeBlock), ...colorKeys(), hide] };
  }

  // Keep's bar (owner, 2026-11-13): + · palette · A | undo · redo | ⋮.
  const spacer = () => k("spacer", { kind: "none" }); // pushes undo/redo to the middle, ⋮ to the end
  return {
    keys: [
      panelKey("insert", "insert"),
      k("noteColor", { kind: "sheet", sheet: "noteColor" }),
      k("format", toggle("format"), false, !input.focused), // the Format panel replaces this row while open
      ...(inCodeBlock ? [k("codeLanguage", { kind: "panel", panel: "codeLanguage" } as Command, false, false, input.codeLanguage ?? "plain")] : []),
      spacer(),
      k("undo", { kind: "undo" }, false, !input.canUndo),
      k("redo", { kind: "redo" }, false, !input.canRedo),
      spacer(),
      k("more", { kind: "sheet", sheet: "more" }),
    ],
  };
}

/** Every command some panel of the toolbar can run (for the parity check). */
export function allCommands(): Command[] {
  const panels: (Panel | null)[] = [null, "format", "insert", "textColor", "highlight", "blockType"];
  const seen = new Map<string, Command>();
  for (const panel of panels) {
    for (const hasSelection of [false, true]) {
      const input: ToolbarInput = { marks: {}, nodes: { paragraph: true }, canUndo: true, canRedo: true, hasSelection, panel, focused: true };
      for (const key of buildToolbar(input).keys) seen.set(JSON.stringify(key.command), key.command);
    }
  }
  return [...seen.values()];
}

/**
 * Web editor feature → phone control. Keep it green: a web feature with no
 * control here fails toolbarModel.test.ts. Table editing (rows, columns,
 * header) is on the table's own sheet (EDIT_EVERYTHING.md §3), and the code
 * block's language on its chip (§1); both are reached from inside the block.
 */
export const WEB_PARITY: { web: string; command: Command }[] = [
  { web: "Paragraph (slash, turn into)", command: { kind: "block", value: "paragraph" } },
  { web: "Heading 1", command: { kind: "block", value: "h1" } },
  { web: "Heading 2", command: { kind: "block", value: "h2" } },
  { web: "Heading 3", command: { kind: "block", value: "h3" } },
  { web: "Bulleted list", command: { kind: "list", value: "bulletList" } },
  { web: "Ordered list", command: { kind: "list", value: "orderedList" } },
  { web: "Todo list", command: { kind: "list", value: "taskList" } },
  { web: "Blockquote", command: { kind: "block", value: "blockquote" } },
  { web: "Code block", command: { kind: "block", value: "codeBlock" } },
  { web: "Separator", command: { kind: "insert", value: "horizontalRule" } },
  { web: "Image", command: { kind: "insert", value: "image" } },
  { web: "Table", command: { kind: "insert", value: "table" } },
  { web: "Bold", command: { kind: "mark", mark: "bold" } },
  { web: "Italic", command: { kind: "mark", mark: "italic" } },
  { web: "Underline", command: { kind: "mark", mark: "underline" } },
  { web: "Strike", command: { kind: "mark", mark: "strike" } },
  { web: "Inline code", command: { kind: "mark", mark: "code" } },
  { web: "Subscript", command: { kind: "mark", mark: "subscript" } },
  { web: "Superscript", command: { kind: "mark", mark: "superscript" } },
  { web: "Link", command: { kind: "link" } },
  { web: "Align left", command: { kind: "align", value: "left" } },
  { web: "Align center", command: { kind: "align", value: "center" } },
  { web: "Align right", command: { kind: "align", value: "right" } },
  { web: "Justify", command: { kind: "align", value: "justify" } },
  { web: "Indent (list)", command: { kind: "indent" } },
  { web: "Outdent (list)", command: { kind: "outdent" } },
  { web: "Undo", command: { kind: "undo" } },
  { web: "Redo", command: { kind: "redo" } },
  ...TEXT_COLORS.map((c) => ({ web: `Text colour: ${c.key}`, command: { kind: "color", which: "text", value: c.value } as Command })),
  ...HIGHLIGHT_COLORS.map((c) => ({ web: `Highlight: ${c.key}`, command: { kind: "color", which: "highlight", value: c.value } as Command })),
];
