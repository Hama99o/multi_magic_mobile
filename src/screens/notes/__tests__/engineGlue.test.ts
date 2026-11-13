/**
 * The glue between our document and engine B (plan §11, decision B). Each
 * rule comes from the device spike of 2026-11-12:
 *  - B refuses repeated object references, and the codec shares mark objects;
 *  - B validates and rewrites a mark named textStyle (var() refused, rgb()
 *    turned into #rrggbbaa), so the colour travels under another name;
 *  - code blocks and tables are read-only on the phone (SPEC §C8), so they
 *    travel as opaque atoms and come back exactly as they went in.
 */
import { fromHTMLWithSource, normalize, toHTML, type DocMark, type DocNode } from "@/vendor/tiptop-schema";
import { ENGINE_COLOR_MARK, READ_ONLY_ATOM, fromEngine, toEngine } from "../editor/engineGlue";

const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", attrs: { textAlign: null }, content });
const t = (text: string, marks?: DocMark[]): DocNode => (marks ? { type: "text", text, marks } : { type: "text", text });

const code: DocNode = { type: "codeBlock", attrs: { language: "js" }, content: [t("const a = 1\n\nb()")] };
const table: DocNode = {
  type: "table",
  content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [p(t("cell"))] }] }],
};

function collect(node: unknown, seen: Set<unknown>, repeated: unknown[]) {
  if (node === null || typeof node !== "object") return;
  if (seen.has(node)) repeated.push(node);
  seen.add(node);
  for (const v of Object.values(node as Record<string, unknown>)) collect(v, seen, repeated);
}

describe("toEngine", () => {
  it("never repeats an object reference, even when the input shares marks", () => {
    const bold = { type: "bold" };
    const doc: DocNode = { type: "doc", content: [p(t("a", [bold]), t("b", [bold, { type: "italic" }]))] };
    const repeated: unknown[] = [];
    collect(toEngine(doc), new Set(), repeated);
    expect(repeated).toEqual([]);
  });

  it("does not touch its input", () => {
    const doc: DocNode = { type: "doc", content: [p(t("x", [{ type: "textStyle", attrs: { color: "var(--a)" } }])), code] };
    const before = JSON.stringify(doc);
    toEngine(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("sends the text colour under its own name, as written", () => {
    const doc: DocNode = { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [p(t("x", [{ type: "bold" }, { type: "textStyle", attrs: { color: "var(--sys-color-token-tag)" } }]))] }] }] };
    const out = toEngine(doc);
    const marks = out.content![0].content![0].content![0].content![0].marks;
    expect(marks).toEqual([{ type: "bold" }, { type: ENGINE_COLOR_MARK, attrs: { color: "var(--sys-color-token-tag)" } }]);
  });

  it("sends code blocks as editable code blocks, language kept (owner, 2026-11-13)", () => {
    const out = toEngine({ type: "doc", content: [code, p(t("after"))] });
    expect(out.content![0]).toEqual(code);
  });

  it("sends tables as tables (editable in the engine), spans and widths as written", () => {
    const out = toEngine({ type: "doc", content: [table, p(t("after"))] });
    expect(out.content!.map((n) => n.type)).toEqual(["table", "paragraph"]);
    expect(out.content![0]).toEqual(table);
  });

  it("sends legacy raw blocks and images as atoms too, so the editor draws them with our card", () => {
    const raw: DocNode = { type: "rawBlock", attrs: { html: '<iframe src="https://www.youtube.com/embed/x"></iframe>', tag: "iframe" } };
    const img: DocNode = { type: "imageUploader", attrs: { src: "https://x/a.png", uploading: false } };
    const out = toEngine({ type: "doc", content: [raw, img] });
    expect(out.content!.map((n) => n.attrs?.kind)).toEqual(["rawBlock", "imageUploader"]);
    expect(fromEngine(out).content).toEqual([raw, img]);
  });
});

describe("fromEngine", () => {
  it("gives back exactly what went in", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        { type: "heading", attrs: { textAlign: "center", level: 2 }, content: [t("Plan")] },
        p(t("red", [{ type: "textStyle", attrs: { color: "rgb(0, 0, 255)" } }]), { type: "hardBreak" }, t("hl", [{ type: "highlight", attrs: { color: "#fef08a" } }])),
        code,
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(t("done"))] }] },
        table,
        { type: "rawBlock", attrs: { html: '<img src="/a.png" data-width="300">', tag: "img" } },
      ],
    };
    expect(fromEngine(toEngine(doc))).toEqual(doc);
  });

  it("accepts the engine dropping attributes at their default (the web fills them back)", () => {
    const sent = toEngine({ type: "doc", content: [p(t("a"))] });
    const engineOut = { type: "doc", content: [{ type: "paragraph", content: [{ text: "a", type: "text" }] }] };
    expect(normalize(fromEngine(engineOut as DocNode))).toEqual(normalize(fromEngine(sent)));
  });

  it("an atom whose payload is damaged is an error, never a silent drop", () => {
    expect(() => fromEngine({ type: "doc", content: [{ type: READ_ONLY_ATOM, attrs: { kind: "codeBlock", node: "{oops" } }] })).toThrow(/read-only block/);
  });

  it("keeps the stored bytes of blocks the engine did not change (source map)", () => {
    const html = '<p>keep <STRONG>me</STRONG></p><pre><code class="language-rb">puts 1</code></pre><p>edit</p>';
    const { doc, source } = fromHTMLWithSource(html, { preserveUnknown: true });
    const back = fromEngine(toEngine(doc));
    expect(toHTML(back, { preserveUnknown: true, source })).toBe(html);
  });
});

describe("colours the engine can draw (the B render patch, EDIT_EVERYTHING §2)", () => {
  it("adds a #rrggbb 'display' to text colour and highlight marks; the stored colour is untouched", () => {
    const doc: DocNode = { type: "doc", content: [p(
      t("a", [{ type: "textStyle", attrs: { color: "hsl(202, 64%, 52%)" } }]),
      t("b", [{ type: "highlight", attrs: { color: "hsl(1, 69%, 60%)" } }]),
    )] };
    const marks = toEngine(doc).content![0].content!.map((n) => n.marks![0]);
    expect(marks[0]).toEqual({ type: ENGINE_COLOR_MARK, attrs: { color: "hsl(202, 64%, 52%)", display: "#3699d3" } });
    expect(marks[1]).toEqual({ type: "highlight", attrs: { color: "hsl(1, 69%, 60%)", display: "#df5553" } });
  });

  it("a colour the phone cannot resolve (a CSS variable) gets no display: drawn in the default ink", () => {
    const doc: DocNode = { type: "doc", content: [p(t("a", [{ type: "textStyle", attrs: { color: "var(--x)" } }]))] };
    expect(toEngine(doc).content![0].content![0].marks![0]).toEqual({ type: ENGINE_COLOR_MARK, attrs: { color: "var(--x)" } });
  });

  it("the display colour never comes back to the document", () => {
    const doc: DocNode = { type: "doc", content: [p(t("b", [{ type: "highlight", attrs: { color: "#fef08a" } }]))] };
    expect(fromEngine(toEngine(doc))).toEqual(doc);
  });
});
