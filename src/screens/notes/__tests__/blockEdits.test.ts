/**
 * Structural edits the engine has no command for (EDIT_EVERYTHING.md §1):
 * turn a paragraph or heading into a code block and back, change a code
 * block's language, delete a block. Pure, on the engine's JSON; the screen
 * finds the block from the engine's selection (a ProseMirror position).
 */
import { toHTML, type DocNode } from "@/vendor/tiptop-schema";
import { CODE_LANGUAGES, deleteBlockAt, setCodeLanguageAt, textblockAt, toCodeBlockAt, toParagraphAt } from "../editor/blockEdits";

const t = (text: string, marks?: { type: string }[]): DocNode => (marks ? { type: "text", text, marks } : { type: "text", text });
const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });

describe("textblockAt (ProseMirror positions)", () => {
  // doc: <p>ab</p><ul><li><p>cd</p></li></ul><pre>ef</pre>
  //  pos: 0 <p> 1 a 2 b 3 </p> 4 <ul> 5 <li> 6 <p> 7 c 8 d 9 </p> 10 </li> 11 </ul> 12 <pre> 13 e 14 f 15 </pre> 16
  const d = doc(p(t("ab")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("cd"))] }] }, { type: "codeBlock", attrs: { language: "js" }, content: [t("ef")] });

  it("finds the textblock a caret is in, top-level or nested", () => {
    expect(textblockAt(d, 1)?.path).toEqual([0]);
    expect(textblockAt(d, 3)?.path).toEqual([0]);
    expect(textblockAt(d, 8)?.path).toEqual([1, 0, 0]);
    expect(textblockAt(d, 14)?.node.type).toBe("codeBlock");
  });

  it("a position between blocks is in no textblock", () => {
    expect(textblockAt(d, 4)).toBeNull();
  });

  it("counts hard breaks and emoji as one position", () => {
    const d2 = doc(p(t("a"), { type: "hardBreak" }, t("b")), p(t("z")));
    // 0 <p> 1 a 2 <br> 3 b 4 </p> 5 <p> 6 z
    expect(textblockAt(d2, 6)?.path).toEqual([1]);
  });
});

describe("paragraph ↔ code block (the toolbar's block chips)", () => {
  it("a paragraph becomes a code block: its text, lines from hard breaks, marks dropped", () => {
    const d = doc(p(t("const "), t("a", [{ type: "bold" }]), { type: "hardBreak" }, t("b()")), p(t("after")));
    const out = toCodeBlockAt(d, [0]);
    expect(out.content![0]).toEqual({ type: "codeBlock", attrs: { language: null }, content: [t("const a\nb()")] });
    expect(toHTML(out)).toBe("<pre><code>const a\nb()</code></pre><p>after</p>");
  });

  it("a heading becomes a code block too", () => {
    const d = doc({ type: "heading", attrs: { level: 2 }, content: [t("Title")] });
    expect(toCodeBlockAt(d, [0]).content![0].type).toBe("codeBlock");
  });

  it("an empty paragraph becomes an empty code block", () => {
    expect(toCodeBlockAt(doc(p()), [0]).content![0]).toEqual({ type: "codeBlock", attrs: { language: null } });
  });

  it("a code block becomes a paragraph with its lines kept as hard breaks", () => {
    const d = doc({ type: "codeBlock", attrs: { language: "rb" }, content: [t("a\n  b")] });
    expect(toParagraphAt(d, [0]).content![0]).toEqual(p(t("a"), { type: "hardBreak" }, t("  b")));
  });

  it("inside a list item, the paragraph is converted in place", () => {
    const d = doc({ type: "bulletList", content: [{ type: "listItem", content: [p(t("x")), p(t("y"))] }] });
    const out = toCodeBlockAt(d, [0, 0, 1]);
    expect(out.content![0].content![0].content!.map((n) => n.type)).toEqual(["paragraph", "codeBlock"]);
  });

  // Device, 2026-11-14: "Code block" with the caret in a checklist item
  // crashed the screen. A list or task item must start with a paragraph
  // (Tiptap: content "paragraph block*"), so the web's toggleCodeBlock
  // refuses there; so do we: the document comes back as it was.
  it("the first paragraph of a list item or a task item stays a paragraph (as on the web)", () => {
    const bullets = doc({ type: "bulletList", content: [{ type: "listItem", content: [p(t("x"))] }] });
    expect(toCodeBlockAt(bullets, [0, 0, 0])).toBe(bullets);
    const tasks = doc({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [p()] }] });
    expect(toCodeBlockAt(tasks, [0, 0, 0])).toBe(tasks);
    const ordered = doc({ type: "orderedList", content: [{ type: "listItem", content: [p(t("a")), p(t("b"))] }] });
    expect(toCodeBlockAt(ordered, [0, 0, 0])).toBe(ordered);
    expect(toCodeBlockAt(ordered, [0, 0, 1])).not.toBe(ordered); // a later paragraph may become code
  });

  it("never changes its input", () => {
    const d = doc(p(t("x")));
    const before = JSON.stringify(d);
    toCodeBlockAt(d, [0]);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("the code block's language", () => {
  it("sets the language the web reads from class=\"language-x\"", () => {
    const d = doc({ type: "codeBlock", attrs: { language: null }, content: [t("x")] });
    const out = setCodeLanguageAt(d, [0], "python");
    expect(toHTML(out)).toBe('<pre><code class="language-python">x</code></pre>');
  });

  it("Plain text removes the language", () => {
    const d = doc({ type: "codeBlock", attrs: { language: "js" }, content: [t("x")] });
    expect(toHTML(setCodeLanguageAt(d, [0], null))).toBe("<pre><code>x</code></pre>");
  });

  it("the language list is searchable names with lowlight ids, plain text first", () => {
    expect(CODE_LANGUAGES[0]).toEqual({ id: null, name: "Plain text" });
    expect(CODE_LANGUAGES).toContainEqual({ id: "javascript", name: "JavaScript" });
    expect(CODE_LANGUAGES).toContainEqual({ id: "ruby", name: "Ruby" });
    expect(new Set(CODE_LANGUAGES.map((l) => l.id)).size).toBe(CODE_LANGUAGES.length);
  });
});

describe("deleting a block", () => {
  it("removes the top-level block and keeps the document loadable", () => {
    const d = doc(p(t("a")), { type: "codeBlock", attrs: { language: null }, content: [t("x")] });
    expect(deleteBlockAt(d, [1]).content).toEqual([p(t("a"))]);
  });

  it("deleting the only block leaves the web's empty paragraph", () => {
    expect(deleteBlockAt(doc({ type: "codeBlock", attrs: { language: null } }), [0]).content).toEqual([{ type: "paragraph" }]);
  });
});
