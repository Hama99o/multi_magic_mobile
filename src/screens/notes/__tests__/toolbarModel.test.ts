/**
 * The editor toolbar's logic (owner, 2026-11-13: "everything the web editor can
 * do, the phone can do"; SPEC §C3, EDIT_EVERYTHING.md). Pure: which keys show,
 * in which order, which are active or disabled, what each one does. The
 * component only draws this.
 */
import {
  HIGHLIGHT_COLORS,
  INSERT_GROUPS,
  TEXT_COLORS,
  WEB_PARITY,
  allCommands,
  buildToolbar,
  type ToolbarInput,
} from "../editor/toolbarModel";

const base: ToolbarInput = {
  marks: {},
  nodes: { paragraph: true },
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  panel: null,
};

const ids = (input: Partial<ToolbarInput>) => buildToolbar({ ...base, ...input }).keys.map((k) => k.id);
const key = (input: Partial<ToolbarInput>, id: string) => buildToolbar({ ...base, ...input }).keys.find((k) => k.id === id)!;

describe("the main row (caret, no selection)", () => {
  it("starts with undo, redo, insert and format, and ends with hide-keyboard (SPEC §C3)", () => {
    const row = ids({});
    expect(row.slice(0, 5)).toEqual(["undo", "redo", "insert", "format", "blockType"]);
    expect(row.at(-1)).toBe("hideKeyboard");
  });

  it("puts the checklist, bullets and indent keys in the first screenful (8 × 44 dp at 360 dp)", () => {
    const row = ids({});
    for (const id of ["taskList", "bulletList", "indent"]) expect(row.indexOf(id)).toBeLessThan(8);
  });

  it("undo and redo follow the editor's history", () => {
    expect(key({}, "undo").disabled).toBe(true);
    expect(key({ canUndo: true }, "undo").disabled).toBe(false);
    expect(key({ canRedo: true }, "redo").disabled).toBe(false);
  });

  it("shows the block type the caret is in", () => {
    expect(key({ nodes: { heading: true }, headingLevel: 2 }, "blockType").value).toBe("h2");
    expect(key({ nodes: { codeBlock: true } }, "blockType").value).toBe("codeBlock");
    expect(key({ nodes: { bulletList: true, listItem: true, paragraph: true } }, "bulletList").active).toBe(true);
  });
});

describe("the selection row", () => {
  it("has every inline mark of the web, then link, colours and hide-keyboard", () => {
    expect(ids({ hasSelection: true })).toEqual([
      "bold", "italic", "underline", "strike", "code", "subscript", "superscript",
      "link", "textColor", "highlight", "hideKeyboard",
    ]);
  });

  it("marks active at the selection are shown active", () => {
    expect(key({ hasSelection: true, marks: { bold: true, superscript: true } }, "bold").active).toBe(true);
    expect(key({ hasSelection: true, marks: { bold: true, superscript: true } }, "superscript").active).toBe(true);
    expect(key({ hasSelection: true, marks: { bold: true } }, "italic").active).toBe(false);
  });

  it("inside inline code the other marks are disabled (code excludes all, as on the web)", () => {
    const input = { hasSelection: true, marks: { code: true } };
    for (const id of ["bold", "italic", "underline", "strike", "subscript", "superscript", "textColor", "highlight"]) {
      expect(key(input, id).disabled).toBe(true);
    }
    expect(key(input, "code").disabled).toBe(false);
  });

  it("inside a code block, inline marks are disabled (the web's code block holds plain text)", () => {
    expect(key({ hasSelection: true, nodes: { codeBlock: true } }, "bold").disabled).toBe(true);
  });
});

describe("the panels", () => {
  it("Format (Aa) has block chips, marks, lists, indent and alignment", () => {
    const format = ids({ panel: "format" });
    expect(format).toEqual(expect.arrayContaining([
      "block:paragraph", "block:h1", "block:h2", "block:h3", "block:blockquote", "block:codeBlock",
      "bold", "italic", "underline", "strike", "code", "subscript", "superscript",
      "taskList", "bulletList", "orderedList", "outdent", "indent",
      "align:left", "align:center", "align:right", "align:justify",
      "textColor", "highlight",
    ]));
  });

  it("offers headings 1 to 3 only: the web has no H4–H6 (heading levels [1, 2, 3])", () => {
    const format = ids({ panel: "format" });
    expect(format).not.toContain("block:h4");
  });

  it("Insert (+) lists the web's slash commands in the web's groups and order", () => {
    expect(INSERT_GROUPS.map((g) => [g.key, g.items])).toEqual([
      ["typography", ["paragraph", "h1", "h2", "h3"]],
      ["format", ["bulletList", "orderedList", "taskList", "blockquote", "codeBlock"]],
      ["insert", ["horizontalRule", "image", "table"]],
    ]);
    expect(ids({ panel: "insert" })).toEqual([
      "block:paragraph", "block:h1", "block:h2", "block:h3",
      "bulletList", "orderedList", "taskList", "block:blockquote", "block:codeBlock",
      "insert:horizontalRule", "insert:image", "insert:table",
    ]);
  });

  it("the colour panels have the web's ten colours each, as the web stores them", () => {
    expect(TEXT_COLORS).toHaveLength(10);
    expect(HIGHLIGHT_COLORS).toHaveLength(10);
    expect(TEXT_COLORS[0]).toEqual({ key: "default", value: null });
    expect(TEXT_COLORS[6]).toEqual({ key: "blue", value: "hsl(202, 64%, 52%)" });
    expect(HIGHLIGHT_COLORS[9]).toEqual({ key: "red", value: "hsl(1, 69%, 60%)" });
    expect(ids({ panel: "textColor" })).toEqual(TEXT_COLORS.map((c) => `textColor:${c.key}`));
  });

  it("every key carries the command it runs", () => {
    expect(key({ panel: "format" }, "align:center").command).toEqual({ kind: "align", value: "center" });
    expect(key({ panel: "insert" }, "insert:table").command).toEqual({ kind: "insert", value: "table" });
    expect(key({ panel: "textColor" }, "textColor:blue").command).toEqual({ kind: "color", which: "text", value: "hsl(202, 64%, 52%)" });
    expect(key({}, "insert").command).toEqual({ kind: "panel", panel: "insert" });
  });

  it("the key of the open panel shows active, and pressing it again closes the panel", () => {
    const k = key({ panel: "format" }, "format");
    expect(k.active).toBe(true);
    expect(k.command).toEqual({ kind: "panel", panel: null });
  });
});

describe("parity with the web editor (keep this table green)", () => {
  it("every web feature has a control on the phone", () => {
    const reachable = new Set(allCommands().map((c) => JSON.stringify(c)));
    const missing = WEB_PARITY.filter((row) => !reachable.has(JSON.stringify(row.command))).map((row) => row.web);
    expect(missing).toEqual([]);
    expect(WEB_PARITY.length).toBeGreaterThanOrEqual(30);
  });
});
