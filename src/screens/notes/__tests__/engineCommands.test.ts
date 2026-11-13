/**
 * Toolbar command → engine B call (RichTextEditorRef). The engine is not in
 * Jest: a recording ref stands in, so the mapping itself is pinned.
 */
import { runCommand, type EngineRef } from "../editor/engineCommands";
import { ENGINE_COLOR_MARK } from "../editor/engineGlue";

function fakeRef() {
  const calls: unknown[][] = [];
  const rec = (name: string) => (...args: unknown[]) => void calls.push([name, ...args]);
  const ref: EngineRef = {
    toggleMark: rec("toggleMark"), setMark: rec("setMark"), unsetMark: rec("unsetMark"),
    toggleHeading: rec("toggleHeading"), toggleBlockquote: rec("toggleBlockquote"), toggleList: rec("toggleList"),
    setTextAlign: rec("setTextAlign"), indentListItem: rec("indentListItem"), outdentListItem: rec("outdentListItem"),
    insertNode: rec("insertNode"), insertText: rec("insertText"), undo: rec("undo"), redo: rec("redo"), blur: rec("blur"),
    setLink: rec("setLink"), unsetLink: rec("unsetLink"),
    runTableCommand: async (c: unknown) => void calls.push(["runTableCommand", c]),
  };
  return { ref, calls };
}

const ctx = (over = {}) => ({ nodes: { paragraph: true } as Record<string, boolean>, headingLevel: undefined as number | undefined, ...over });

it("marks toggle under their own names", () => {
  const { ref, calls } = fakeRef();
  for (const mark of ["bold", "italic", "underline", "strike", "code", "subscript", "superscript"] as const) {
    runCommand(ref, { kind: "mark", mark }, ctx());
  }
  expect(calls.map((c) => c[1])).toEqual(["bold", "italic", "underline", "strike", "code", "subscript", "superscript"]);
});

it("a text colour is the engine's colour mark with the web's string; default removes it", () => {
  const { ref, calls } = fakeRef();
  runCommand(ref, { kind: "color", which: "text", value: "hsl(202, 64%, 52%)" }, ctx());
  runCommand(ref, { kind: "color", which: "text", value: null }, ctx());
  runCommand(ref, { kind: "color", which: "highlight", value: "hsl(1, 69%, 60%)" }, ctx());
  expect(calls).toEqual([
    ["setMark", ENGINE_COLOR_MARK, { color: "hsl(202, 64%, 52%)" }],
    ["unsetMark", ENGINE_COLOR_MARK],
    ["setMark", "highlight", { color: "hsl(1, 69%, 60%)" }],
  ]);
});

it("headings, quote and lists use the engine's toggles", () => {
  const { ref, calls } = fakeRef();
  runCommand(ref, { kind: "block", value: "h2" }, ctx());
  runCommand(ref, { kind: "block", value: "blockquote" }, ctx());
  runCommand(ref, { kind: "list", value: "taskList" }, ctx());
  expect(calls).toEqual([["toggleHeading", 2], ["toggleBlockquote"], ["toggleList", "taskList"]]);
});

it("Paragraph undoes what the caret is in (a heading of its level, a quote)", () => {
  const { ref, calls } = fakeRef();
  runCommand(ref, { kind: "block", value: "paragraph" }, ctx({ nodes: { heading: true }, headingLevel: 3 }));
  runCommand(ref, { kind: "block", value: "paragraph" }, ctx({ nodes: { blockquote: true, paragraph: true } }));
  runCommand(ref, { kind: "block", value: "paragraph" }, ctx());
  expect(calls).toEqual([["toggleHeading", 3], ["toggleBlockquote"]]);
});

it("a heading key on a heading of the same level is a no-op toggle back to paragraph, as on the web", () => {
  const { ref, calls } = fakeRef();
  runCommand(ref, { kind: "block", value: "h1" }, ctx({ nodes: { heading: true }, headingLevel: 1 }));
  expect(calls).toEqual([["toggleHeading", 1]]);
});

it("align, indent, undo, redo, separator, hide keyboard", () => {
  const { ref, calls } = fakeRef();
  runCommand(ref, { kind: "align", value: "center" }, ctx());
  runCommand(ref, { kind: "indent" }, ctx());
  runCommand(ref, { kind: "outdent" }, ctx());
  runCommand(ref, { kind: "undo" }, ctx());
  runCommand(ref, { kind: "redo" }, ctx());
  runCommand(ref, { kind: "insert", value: "horizontalRule" }, ctx());
  runCommand(ref, { kind: "hideKeyboard" }, ctx());
  expect(calls).toEqual([["setTextAlign", "center"], ["indentListItem"], ["outdentListItem"], ["undo"], ["redo"], ["insertNode", "horizontalRule"], ["blur"]]);
});

it("a table is inserted with a header row, 3 × 3 (the web's insertTable default)", () => {
  const { ref, calls } = fakeRef();
  runCommand(ref, { kind: "insert", value: "table" }, ctx());
  expect(calls).toEqual([["runTableCommand", { type: "insertTable", rows: 3, columns: 3, withHeaderRow: true }]]);
});

it("what needs the screen (link, image, code block, panels) is handed back, not run", () => {
  const { ref, calls } = fakeRef();
  expect(runCommand(ref, { kind: "link" }, ctx())).toBe("screen");
  expect(runCommand(ref, { kind: "insert", value: "image" }, ctx())).toBe("screen");
  expect(runCommand(ref, { kind: "block", value: "codeBlock" }, ctx())).toBe("screen");
  expect(runCommand(ref, { kind: "panel", panel: "format" }, ctx())).toBe("screen");
  expect(calls).toEqual([]);
});

it("in a code block, indent inserts two spaces and outdent does nothing (no list to outdent)", () => {
  const { ref, calls } = fakeRef();
  runCommand(ref, { kind: "indent" }, ctx({ nodes: { codeBlock: true } }));
  runCommand(ref, { kind: "outdent" }, ctx({ nodes: { codeBlock: true } }));
  expect(calls).toEqual([["insertText", "  "]]);
});

it("table commands map to the engine's table commands", () => {
  const { ref, calls } = fakeRef();
  const ops = ["addRowBefore", "addRowAfter", "addColumnBefore", "addColumnAfter", "toggleHeaderRow", "toggleHeaderColumn", "mergeCells", "splitCell", "deleteRow", "deleteColumn", "deleteTable"] as const;
  for (const op of ops) runCommand(ref, { kind: "table", op }, ctx());
  expect(calls.map((c) => c[1])).toEqual([
    { type: "addTableRow", side: "before" }, { type: "addTableRow", side: "after" },
    { type: "addTableColumn", side: "before" }, { type: "addTableColumn", side: "after" },
    { type: "toggleTableHeader", target: "row" }, { type: "toggleTableHeader", target: "column" },
    { type: "mergeTableCells" }, { type: "splitTableCell" },
    { type: "deleteTableRows" }, { type: "deleteTableColumns" }, { type: "deleteTable" },
  ]);
});
