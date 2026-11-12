/**
 * The phase 3 document model (SPEC §E/§F): pure transactions on the stored
 * document. Every result must load on the web as written, so each test also
 * runs the schema's own validator on it.
 */
import { fromHTMLWithSource, toHTML, validate, type DocMark, type DocNode } from "@/vendor/tiptop-schema";
import {
  createHistory,
  finalize,
  indentItem,
  insertBlock,
  insertText,
  joinBackward,
  marksAt,
  moveBlock,
  outdentItem,
  record,
  redo,
  removeBlock,
  setAlign,
  setMark,
  setTextblockType,
  splitBlock,
  textblockPaths,
  toggleList,
  toggleMark,
  toggleQuote,
  toggleTask,
  undo,
} from "../editor/model";

// ---- builders -------------------------------------------------------------
const t = (text: string, ...marks: string[]): DocNode =>
  marks.length ? { type: "text", text, marks: marks.map((type) => ({ type })) } : { type: "text", text };
const p = (...content: (string | DocNode)[]): DocNode => {
  const c = content.map((x) => (typeof x === "string" ? t(x) : x)).filter((x) => x.text !== "");
  return c.length ? { type: "paragraph", attrs: { textAlign: null }, content: c } : { type: "paragraph", attrs: { textAlign: null } };
};
const h = (level: number, text: string): DocNode => ({ type: "heading", attrs: { textAlign: null, level }, content: [t(text)] });
const li = (...content: DocNode[]): DocNode => ({ type: "listItem", content });
const ti = (checked: boolean, text: string): DocNode => ({ type: "taskItem", attrs: { checked }, content: [p(text)] });
const ul = (...items: DocNode[]): DocNode => ({ type: "bulletList", content: items });
const ol = (...items: DocNode[]): DocNode => ({ type: "orderedList", attrs: { start: 1, type: null }, content: items });
const tl = (...items: DocNode[]): DocNode => ({ type: "taskList", content: items });
const quote = (...content: DocNode[]): DocNode => ({ type: "blockquote", content });
const hr: DocNode = { type: "horizontalRule" };
const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });

const strict = (d: DocNode) => {
  const errors = validate(d).issues.filter((i) => i.severity === "error");
  expect(errors).toEqual([]);
  return d;
};

describe("finalize", () => {
  it("adds the web's trailing paragraph after a last non-paragraph block, and never leaves the doc empty", () => {
    expect(finalize(doc(p("a"), hr))).toEqual(doc(p("a"), hr, p()));
    expect(finalize(doc(ul(li(p("a")))))).toEqual(doc(ul(li(p("a"))), p()));
    expect(finalize({ type: "doc", content: [] })).toEqual(doc(p()));
  });
  it("merges neighbouring text with equal marks and drops empty text", () => {
    expect(finalize(doc(p(t("a", "bold"), t("b", "bold"), { type: "text", text: "" } as DocNode))))
      .toEqual(doc(p(t("ab", "bold"))));
  });
});

describe("textblockPaths", () => {
  it("lists the editable textblocks in reading order, skipping code, tables and raw blocks", () => {
    const d = doc(
      h(1, "T"),
      ul(li(p("a"), ul(li(p("b"))))),
      { type: "codeBlock", attrs: { language: null }, content: [t("x")] },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p("cell")] }] }] },
      { type: "rawBlock", attrs: { html: "<img src=x>", tag: "img" } },
      quote(p("q")),
      p("end"),
    );
    expect(textblockPaths(d)).toEqual([[0], [1, 0, 0], [1, 0, 1, 0, 0], [5, 0], [6]]);
  });
});

describe("insertText", () => {
  it("types into a block, inheriting the marks before the caret", () => {
    const r = insertText(doc(p(t("bo", "bold"), "x")), [0], 2, 2, "ld");
    expect(strict(r.doc)).toEqual(doc(p(t("bold", "bold"), "x")));
    expect(r.caret).toEqual({ path: [0], offset: 4 });
  });
  it("carries a link on past its end, as the web does (Link autolink on makes it inclusive)", () => {
    const link: DocMark = { type: "link", attrs: { href: "https://a.b", target: "_blank", rel: "noopener noreferrer nofollow", class: null, title: null } };
    const d = doc(p({ type: "text", text: "go", marks: [link] }));
    expect(insertText(d, [0], 2, 2, "!").doc).toEqual(doc(p({ type: "text", text: "go!", marks: [link] })));
  });
  it("uses explicit marks when given (the toolbar's stored marks)", () => {
    expect(insertText(doc(p("a")), [0], 1, 1, "b", [{ type: "italic" }]).doc).toEqual(doc(p("a", t("b", "italic"))));
  });
  it("replaces a range across marks, and leaves an empty paragraph without content", () => {
    expect(insertText(doc(p("a", t("b", "bold"), "c")), [0], 0, 3, "").doc).toEqual(doc(p()));
    expect(insertText(doc(p("ab", t("cd", "bold"))), [0], 1, 3, "X").doc).toEqual(doc(p("aX", t("d", "bold"))));
  });
  it("counts an emoji, a hard break and a raw inline as one position", () => {
    const d = doc(p("a", { type: "emoji", attrs: { name: "smile" } }, { type: "hardBreak" }, "b"));
    expect(insertText(d, [0], 3, 3, "!").doc).toEqual(doc(p("a", { type: "emoji", attrs: { name: "smile" } }, { type: "hardBreak" }, "!b")));
    expect(insertText(d, [0], 1, 2, "").doc).toEqual(doc(p("a", { type: "hardBreak" }, "b")));
  });
  it("counts UTF-16 units, as TextInput does", () => {
    expect(insertText(doc(p("😀a")), [0], 2, 2, "-").doc).toEqual(doc(p("😀-a")));
  });
});

describe("marks", () => {
  it("toggleMark adds over a partly marked range and removes when the whole range has it (Tiptap)", () => {
    const d = doc(p("ab", t("cd", "bold")));
    const on = toggleMark(d, [0], 0, 4, { type: "bold" });
    expect(strict(on)).toEqual(doc(p(t("abcd", "bold"))));
    expect(toggleMark(on, [0], 1, 3, { type: "bold" })).toEqual(doc(p(t("a", "bold"), "bc", t("d", "bold"))));
  });
  it("keeps marks in rank order (getJSON order)", () => {
    const d = toggleMark(doc(p(t("a", "italic"))), [0], 0, 1, { type: "bold" });
    expect(d.content![0].content![0].marks).toEqual([{ type: "bold" }, { type: "italic" }]);
  });
  it("code removes every other mark, and other marks are not added inside code", () => {
    const d = toggleMark(doc(p(t("ab", "bold", "italic"))), [0], 0, 2, { type: "code" });
    expect(strict(d)).toEqual(doc(p(t("ab", "code"))));
    expect(toggleMark(d, [0], 0, 2, { type: "bold" })).toEqual(d);
  });
  it("setMark replaces a colour and removes it with null", () => {
    const red = { type: "textStyle", attrs: { color: "hsl(0 70% 50%)" } };
    const blue = { type: "textStyle", attrs: { color: "hsl(220 70% 50%)" } };
    const d = setMark(doc(p("abc")), [0], 0, 2, "textStyle", red.attrs);
    expect(d).toEqual(doc(p({ type: "text", text: "ab", marks: [red] }, "c")));
    expect(setMark(d, [0], 1, 3, "textStyle", blue.attrs)).toEqual(doc(p({ type: "text", text: "a", marks: [red] }, { type: "text", text: "bc", marks: [blue] })));
    expect(setMark(d, [0], 0, 3, "textStyle", null)).toEqual(doc(p("abc")));
  });
  it("marksAt gives the marks the next typed character gets", () => {
    const d = doc(p(t("a", "bold"), "b"));
    expect(marksAt(d, [0], 1)).toEqual([{ type: "bold" }]);
    expect(marksAt(d, [0], 2)).toEqual([]);
    expect(marksAt(d, [0], 0)).toEqual([{ type: "bold" }]);
  });
});

describe("splitBlock (Return)", () => {
  it("splits a paragraph and keeps its alignment on both halves", () => {
    const d = doc({ type: "paragraph", attrs: { textAlign: "center" }, content: [t("abcd")] });
    const r = splitBlock(d, [0], 2);
    expect(strict(r.doc)).toEqual(doc(
      { type: "paragraph", attrs: { textAlign: "center" }, content: [t("ab")] },
      { type: "paragraph", attrs: { textAlign: "center" }, content: [t("cd")] },
    ));
    expect(r.caret).toEqual({ path: [1], offset: 0 });
  });
  it("Return at the end of a heading opens a paragraph", () => {
    const r = splitBlock(doc(h(2, "Title")), [0], 5);
    expect(r.doc).toEqual(doc(h(2, "Title"), p()));
  });
  it("splits a list item, the new to-do unchecked", () => {
    expect(splitBlock(doc(ul(li(p("ab")))), [0, 0, 0], 1).doc).toEqual(doc(ul(li(p("a")), li(p("b"))), p()));
    const r = splitBlock(doc(tl(ti(true, "ab"))), [0, 0, 0], 2);
    expect(strict(r.doc)).toEqual(doc(tl(ti(true, "ab"), ti(false, "")), p()));
    expect(r.caret).toEqual({ path: [0, 1, 0], offset: 0 });
  });
  it("Return in an empty last item ends the list", () => {
    const r = splitBlock(doc(ul(li(p("a")), li(p())), p("after")), [0, 1, 0], 0);
    expect(strict(r.doc)).toEqual(doc(ul(li(p("a"))), p(), p("after")));
    expect(r.caret).toEqual({ path: [1], offset: 0 });
  });
  it("Return in an empty middle item splits the list around a paragraph", () => {
    const r = splitBlock(doc(ol(li(p("a")), li(p()), li(p("c")))), [0, 1, 0], 0);
    expect(strict(r.doc)).toEqual(doc(ol(li(p("a"))), p(), ol(li(p("c"))), p()));
  });
  it("Return in an empty nested item moves it out one level", () => {
    const r = splitBlock(doc(ul(li(p("a"), ul(li(p()))))), [0, 0, 1, 0, 0], 0);
    expect(strict(r.doc)).toEqual(doc(ul(li(p("a")), li(p())), p()));
    expect(r.caret).toEqual({ path: [0, 1, 0], offset: 0 });
  });
});

describe("joinBackward (Backspace at the start)", () => {
  it("joins a paragraph into the previous textblock, which keeps its type", () => {
    const r = joinBackward(doc(h(1, "Ti"), p(t("tle", "bold"))), [1]);
    expect(r && r.kind === "edit" && strict(r.doc)).toEqual(doc({ type: "heading", attrs: { textAlign: null, level: 1 }, content: [t("Ti"), t("tle", "bold")] }, p()));
    expect(r && r.kind === "edit" && r.caret).toEqual({ path: [0], offset: 2 });
  });
  it("joins into the last textblock of a list before it", () => {
    const r = joinBackward(doc(ul(li(p("a"))), p("b")), [1]);
    expect(r && r.kind === "edit" && strict(r.doc)).toEqual(doc(ul(li(p("ab"))), p()));
  });
  it("lifts a list item out instead of joining (Tiptap ListKeymap)", () => {
    const r = joinBackward(doc(ul(li(p("a")), li(p("b")))), [0, 1, 0]);
    expect(r && r.kind === "edit" && strict(r.doc)).toEqual(doc(ul(li(p("a"))), p("b")));
  });
  it("lifts the first paragraph of a quote out of it", () => {
    const r = joinBackward(doc(quote(p("a"), p("b"))), [0, 0]);
    expect(r && r.kind === "edit" && strict(r.doc)).toEqual(doc(p("a"), quote(p("b")), p()));
  });
  it("selects a read-only block before it, and removes an empty paragraph after one", () => {
    expect(joinBackward(doc(hr, p("a")), [1])).toEqual({ kind: "selectBlock", path: [0], doc: doc(hr, p("a")) });
    expect(joinBackward(doc(hr, p(), p("b")), [1])).toEqual({ kind: "selectBlock", path: [0], doc: doc(hr, p("b")) });
    // The web's trailing paragraph comes straight back after a last rule.
    expect(joinBackward(doc(p("x"), hr, p()), [2])).toEqual({ kind: "selectBlock", path: [1], doc: doc(p("x"), hr, p()) });
  });
  it("does nothing at the very start of the note", () => {
    expect(joinBackward(doc(p("a")), [0])).toBeNull();
  });
});

describe("block types", () => {
  it("turns a paragraph into a heading and back, keeping alignment and marks", () => {
    const d = doc({ type: "paragraph", attrs: { textAlign: "right" }, content: [t("x", "bold")] });
    const hd = setTextblockType(d, [0], { type: "heading", level: 2 });
    expect(strict(hd!)).toEqual(doc({ type: "heading", attrs: { textAlign: "right", level: 2 }, content: [t("x", "bold")] }, p()));
    expect(setTextblockType(hd!, [0], { type: "paragraph" })).toEqual(doc(d.content![0], p()));
  });
  it("refuses a heading as the first block of a list item (not in the schema)", () => {
    expect(setTextblockType(doc(ul(li(p("a")))), [0, 0, 0], { type: "heading", level: 1 })).toBeNull();
  });
  it("setAlign stores the web's physical values", () => {
    expect(setAlign(doc(p("a")), [0], "justify")).toEqual(doc({ type: "paragraph", attrs: { textAlign: "justify" }, content: [t("a")] }));
    expect(setAlign(doc({ type: "paragraph", attrs: { textAlign: "left" } }), [0], null)).toEqual(doc(p()));
  });
});

describe("lists", () => {
  it("wraps a paragraph, joining a list of the same type before and after", () => {
    const r = toggleList(doc(ul(li(p("a"))), p("b"), ul(li(p("c")))), [1], "bulletList");
    expect(strict(r!.doc)).toEqual(doc(ul(li(p("a")), li(p("b")), li(p("c"))), p()));
    expect(r!.caret).toEqual({ path: [0, 1, 0], offset: 0 });
  });
  it("a heading becomes a paragraph when wrapped (Tiptap clearNodes)", () => {
    expect(toggleList(doc(h(1, "a")), [0], "taskList")!.doc).toEqual(doc(tl(ti(false, "a")), p()));
  });
  it("the same type again lifts the item out", () => {
    expect(toggleList(doc(ul(li(p("a")), li(p("b")))), [0, 0, 0], "bulletList")!.doc).toEqual(doc(p("a"), ul(li(p("b"))), p()));
  });
  it("another type converts the whole list, to-dos unchecked", () => {
    expect(strict(toggleList(doc(ul(li(p("a")), li(p("b")))), [0, 1, 0], "taskList")!.doc)).toEqual(doc(tl(ti(false, "a"), ti(false, "b")), p()));
    expect(toggleList(doc(tl(ti(true, "a"))), [0, 0, 0], "orderedList")!.doc).toEqual(doc(ol(li(p("a"))), p()));
  });
  it("refuses to turn items with nested lists into to-dos (taskItem holds paragraphs only)", () => {
    expect(toggleList(doc(ul(li(p("a"), ul(li(p("b")))))), [0, 0, 0], "taskList")).toBeNull();
  });
  it("indent moves an item into the previous one; outdent moves it back", () => {
    const d = doc(ul(li(p("a")), li(p("b")), li(p("c"))));
    const r = indentItem(d, [0, 1, 0]);
    expect(strict(r!.doc)).toEqual(doc(ul(li(p("a"), ul(li(p("b")))), li(p("c"))), p()));
    expect(r!.caret).toEqual({ path: [0, 0, 1, 0, 0], offset: 0 });
    const back = outdentItem(r!.doc, [0, 0, 1, 0, 0]);
    expect(back!.doc).toEqual(doc(ul(li(p("a")), li(p("b")), li(p("c"))), p()));
  });
  it("indent appends to an existing nested list; the first item cannot indent", () => {
    const d = doc(ul(li(p("a"), ul(li(p("x")))), li(p("b"))));
    expect(indentItem(d, [0, 1, 0])!.doc).toEqual(doc(ul(li(p("a"), ul(li(p("x")), li(p("b"))))), p()));
    expect(indentItem(d, [0, 0, 0])).toBeNull();
  });
  it("to-dos cannot nest, as on the web", () => {
    expect(indentItem(doc(tl(ti(false, "a"), ti(false, "b"))), [0, 1, 0])).toBeNull();
  });
  it("outdent takes the following siblings along as its own nested list", () => {
    const d = doc(ul(li(p("a"), ul(li(p("b")), li(p("c"))))));
    expect(strict(outdentItem(d, [0, 0, 1, 0, 0])!.doc)).toEqual(doc(ul(li(p("a")), li(p("b"), ul(li(p("c"))))), p()));
  });
  it("toggleTask flips one item", () => {
    expect(toggleTask(doc(tl(ti(false, "a"), ti(false, "b"))), [0, 1])).toEqual(doc(tl(ti(false, "a"), ti(true, "b")), p()));
  });
});

describe("quote", () => {
  it("wraps the top-level block and lifts it back out", () => {
    const q = toggleQuote(doc(p("a"), p("b")), [1]);
    expect(strict(q!.doc)).toEqual(doc(p("a"), quote(p("b")), p()));
    expect(q!.caret).toEqual({ path: [1, 0], offset: 0 });
    expect(toggleQuote(q!.doc, [1, 0])!.doc).toEqual(doc(p("a"), p("b"), p()));
  });
});

describe("blocks: insert, remove, move", () => {
  it("inserts a rule after the caret's top-level block, with a paragraph to type in after it", () => {
    const r = insertBlock(doc(p("a"), p("b")), [0], hr);
    expect(strict(r.doc)).toEqual(doc(p("a"), hr, p("b")));
    expect(r.caret).toEqual({ path: [2], offset: 0 });
    expect(insertBlock(doc(p("a")), [0], hr).doc).toEqual(doc(p("a"), hr, p()));
  });
  it("an empty paragraph is replaced by the inserted block", () => {
    const img: DocNode = { type: "imageUploader", attrs: { src: "https://x/y.png", uploading: false, selectMedia: false } };
    const r = insertBlock(doc(p("a"), p()), [1], img);
    expect(strict(r.doc)).toEqual(finalize(doc(p("a"), img)));
  });
  it("removes a block, never leaving an empty doc", () => {
    expect(removeBlock(doc(p("a"), hr, p("b")), [1])).toEqual(doc(p("a"), p("b")));
    expect(removeBlock(doc(hr), [0])).toEqual(doc(p()));
    expect(removeBlock(doc(ul(li(p("a")))), [0, 0])).toEqual(doc(p()));
  });
  it("moves a top-level block, and a list item inside its list; refuses past an edge", () => {
    expect(moveBlock(doc(p("a"), p("b"), p("c")), [0], 1)).toEqual(doc(p("b"), p("a"), p("c")));
    expect(moveBlock(doc(ul(li(p("a")), li(p("b")))), [0, 1], -1)).toEqual(doc(ul(li(p("b")), li(p("a"))), p()));
    expect(moveBlock(doc(p("a"), p("b")), [0], -1)).toBeNull();
  });
});

describe("history", () => {
  const at = (s: string) => ({ doc: doc(p(s)), caret: { path: [0], offset: s.length } });
  it("groups typing within 500 ms into one step, and anything else is its own step", () => {
    let hist = createHistory();
    hist = record(hist, at(""), "typing", 0);
    hist = record(hist, at("a"), "typing", 300);
    hist = record(hist, at("ab"), "typing", 1000);
    hist = record(hist, at("abc"), "format", 1100);
    const u1 = undo(hist, at("abcd"))!;
    expect(u1.state).toEqual(at("abc"));
    const u2 = undo(u1.history, u1.state)!;
    expect(u2.state).toEqual(at("ab"));
    const u3 = undo(u2.history, u2.state)!;
    expect(u3.state).toEqual(at(""));
    expect(undo(u3.history, u3.state)).toBeNull();
    const r1 = redo(u3.history, u3.state)!;
    expect(r1.state).toEqual(at("ab"));
  });
  it("a new change clears redo", () => {
    let hist = record(createHistory(), at("a"), "format", 0);
    const u = undo(hist, at("b"))!;
    hist = record(u.history, u.state, "format", 10);
    expect(redo(hist, at("c"))).toBeNull();
  });
});

describe("with the stored HTML (cross-edit)", () => {
  it("an edit rewrites only the touched block: the other blocks keep their exact bytes", () => {
    const html = '<h1 style="text-align: center">Plan</h1><p>keep <STRONG>me</STRONG></p><img src="/legacy.png" data-width="300"><p>edit me</p>';
    const { doc: parsed, source } = fromHTMLWithSource(html, { preserveUnknown: true });
    const last = textblockPaths(parsed).pop()!;
    const edited = insertText(parsed, last, 7, 7, "!").doc;
    const out = toHTML(edited, { preserveUnknown: true, source });
    expect(out.startsWith('<h1 style="text-align: center">Plan</h1><p>keep <STRONG>me</STRONG></p><img src="/legacy.png" data-width="300">')).toBe(true);
    expect(out.endsWith("<p>edit me!</p>")).toBe(true);
  });
  it("a fuzz of 400 random edits never produces a doc the web would refuse", () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    let d = finalize(doc(h(1, "T"), ul(li(p("a")), li(p("b"))), tl(ti(false, "c")), quote(p("q")), hr, p("z")));
    const types = ["bulletList", "orderedList", "taskList"] as const;
    for (let i = 0; i < 400; i++) {
      const paths = textblockPaths(d);
      const path = paths[rnd(paths.length)];
      let n = d; for (const k of path) n = n.content![k];
      const len = (n.content ?? []).reduce((s, c) => s + (c.type === "text" ? c.text!.length : 1), 0);
      const a = rnd(len + 1), b = a + rnd(len - a + 1);
      const op = rnd(11);
      const next =
        op === 0 ? insertText(d, path, a, b, "xy").doc :
        op === 1 ? splitBlock(d, path, a).doc :
        op === 2 ? (() => { const r = joinBackward(d, path); return r && r.kind === "edit" ? r.doc : d; })() :
        op === 3 ? toggleMark(d, path, a, b, { type: ["bold", "code", "italic"][rnd(3)] }) :
        op === 4 ? setTextblockType(d, path, rnd(2) ? { type: "paragraph" } : { type: "heading", level: 1 + rnd(3) }) ?? d :
        op === 5 ? toggleList(d, path, types[rnd(3)])?.doc ?? d :
        op === 6 ? indentItem(d, path)?.doc ?? d :
        op === 7 ? outdentItem(d, path)?.doc ?? d :
        op === 8 ? toggleQuote(d, path)?.doc ?? d :
        op === 9 ? insertBlock(d, path, hr).doc :
        moveBlock(d, [path[0]], rnd(2) ? 1 : -1) ?? d;
      strict(next);
      expect(textblockPaths(next).length).toBeGreaterThan(0);
      d = next;
    }
  });
});
