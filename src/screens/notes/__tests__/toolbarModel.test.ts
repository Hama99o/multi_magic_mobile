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

describe("the Keep bar (owner, 2026-11-13: one bar, on the keyboard when it is up)", () => {
  it("is + · palette · A, then undo · redo in the middle, then ⋮", () => {
    expect(ids({ focused: true })).toEqual(["insert", "noteColor", "format", "spacer", "undo", "redo", "spacer", "more"]);
  });

  it("A (format) is dimmed until the caret is in the body", () => {
    expect(key({ focused: false }, "format").disabled).toBe(true);
    expect(key({ focused: true }, "format").disabled).toBe(false);
  });

  it("undo and redo follow the editor's history", () => {
    expect(key({}, "undo").disabled).toBe(true);
    expect(key({ canUndo: true }, "undo").disabled).toBe(false);
    expect(key({ canRedo: true }, "redo").disabled).toBe(false);
  });

  it("palette and ⋮ open the screen's sheets", () => {
    expect(key({}, "noteColor").command).toEqual({ kind: "sheet", sheet: "noteColor" });
    expect(key({}, "more").command).toEqual({ kind: "sheet", sheet: "more" });
  });

  it("the Format panel starts with a key that closes it (back to the bar)", () => {
    const first = buildToolbar({ ...base, focused: true, panel: "format" }).keys[0];
    expect(first).toMatchObject({ id: "closePanel", command: { kind: "panel", panel: null } });
  });

  it("shows the block type the caret is in, in the Format panel", () => {
    expect(key({ panel: "format", nodes: { heading: true }, headingLevel: 2 }, "block:h2").active).toBe(true);
    expect(key({ panel: "format", nodes: { bulletList: true, listItem: true, paragraph: true } }, "bulletList").active).toBe(true);
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
      "closePanel",
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
    expect(ids({ panel: "textColor" })).toEqual(["closePanel", ...TEXT_COLORS.map((c) => `textColor:${c.key}`)]);
  });

  it("every key carries the command it runs", () => {
    expect(key({ panel: "format" }, "align:center").command).toEqual({ kind: "align", value: "center" });
    expect(key({ panel: "insert" }, "insert:table").command).toEqual({ kind: "insert", value: "table" });
    expect(key({ panel: "textColor" }, "textColor:blue").command).toEqual({ kind: "color", which: "text", value: "hsl(202, 64%, 52%)" });
    expect(key({ focused: true }, "insert").command).toEqual({ kind: "panel", panel: "insert" });
  });

  it("the insert panel also starts with its close key", () => {
    expect(buildToolbar({ ...base, panel: "insert" }).keys[0].id).toBe("closePanel");
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

describe("inside a code block (EDIT_EVERYTHING.md §1)", () => {
  const inCode = { nodes: { codeBlock: true }, codeLanguage: "ruby" };

  it("the main row shows the block's language as a key that opens the language sheet", () => {
    const k = key(inCode, "codeLanguage");
    expect(k.value).toBe("ruby");
    expect(k.command).toEqual({ kind: "panel", panel: "codeLanguage" });
    expect(key({ nodes: { codeBlock: true }, codeLanguage: null }, "codeLanguage").value).toBe("plain");
  });

  it("no language key outside a code block", () => {
    expect(ids({})).not.toContain("codeLanguage");
  });

  it("in the Format panel, indent stays available in code (it inserts an indent), lists are not", () => {
    expect(key({ ...inCode, panel: "format" }, "indent").disabled).toBe(false);
    expect(key({ ...inCode, panel: "format" }, "bulletList").disabled).toBe(true);
  });
});
