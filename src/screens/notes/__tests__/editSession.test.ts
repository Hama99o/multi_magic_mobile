/**
 * The editor's open → edit → save path (phase 3, plan §11 condition 1):
 *   stored HTML → doc + source map → engine doc → (the engine edits) →
 *   fromEngine → validate → toHTML({ source }).
 *
 * The engine is not in Jest: an edit is simulated on the engine's JSON, the
 * way engine B hands it back (getContentJson). What must hold:
 *  - the saved HTML round-trips through the codec (what the web will load);
 *  - blocks the phone may not edit — tables, code, anything with a comment
 *    or sub/sup — leave the phone byte for byte, edited note or not;
 *  - a document the engine damaged is never saved: the screen falls back to
 *    the read view ("edit on the web").
 */
import { fromHTML, toHTML, validate, type DocNode } from "@/vendor/tiptop-schema";
import { READ_ONLY_ATOM } from "../editor/engineGlue";
import { openForEditing, saveFromEngine } from "../editor/editSession";

const typeInFirstParagraph = (engineDoc: DocNode, text: string): DocNode => {
  const doc = JSON.parse(JSON.stringify(engineDoc)) as DocNode;
  const para = doc.content!.find((n) => n.type === "paragraph")!;
  para.content = [...(para.content ?? []), { type: "text", text }];
  return doc;
};

const roundTrips = (html: string) => {
  const again = toHTML(fromHTML(html, { preserveUnknown: true }), { preserveUnknown: true });
  expect(again).toBe(html);
};

describe("openForEditing → saveFromEngine", () => {
  it("an untouched note saves back to the exact stored bytes", () => {
    const html = '<h2 style="text-align: center">Plan</h2><p>one <strong>two</strong></p><ul><li><p>a</p></li></ul>';
    const s = openForEditing(html);
    const out = saveFromEngine(s.engineDoc, s);
    expect(out).toEqual(expect.objectContaining({ ok: true, html }));
  });

  it("an edit produces HTML the codec round-trips and that validates for the web", () => {
    const s = openForEditing("<p>hello</p><ul><li><p>item</p></li></ul>");
    const out = saveFromEngine(typeInFirstParagraph(s.engineDoc, " world"), s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html).toBe("<p>hello world</p><ul><li><p>item</p></li></ul>");
    roundTrips(out.html);
    expect(validate(fromHTML(out.html)).valid).toBe(true);
  });

  it("an edit elsewhere keeps tables and code blocks byte for byte", () => {
    const table = '<table style="min-width: 50px"><colgroup><col><col></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th><th colspan="1" rowspan="1"><p>B</p></th></tr></tbody></table>';
    const code = '<pre><code class="language-ruby">def x\n  1\nend</code></pre>';
    const s = openForEditing(`<p>top</p>${table}${code}`);
    expect(s.engineDoc.content!.map((n) => n.type)).toEqual(["paragraph", READ_ONLY_ATOM, "codeBlock"]);
    const out = saveFromEngine(typeInFirstParagraph(s.engineDoc, "!"), s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html).toBe(`<p>top!</p>${table}${code}`);
  });

  it("editing inside a code block writes the web's pre/code with every space, tab and line kept", () => {
    const stored = '<p>intro</p><pre><code class="language-ruby">def x\n  1\nend</code></pre>';
    const s = openForEditing(stored);
    const engine = JSON.parse(JSON.stringify(s.engineDoc)) as DocNode;
    const block = engine.content![1];
    expect(block.type).toBe("codeBlock");
    block.content = [{ type: "text", text: "def x\n\t  1 # tab and spaces\n\nend" }];
    const out = saveFromEngine(engine, s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html).toBe('<p>intro</p><pre><code class="language-ruby">def x\n\t  1 # tab and spaces\n\nend</code></pre>');
    roundTrips(out.html);
  });

  it("sub/sup are edited on the phone: the block is plain text, and an edit in it keeps the marks", () => {
    const chem = "<p>H<sub>2</sub>O and E=mc<sup>2</sup></p>";
    const s = openForEditing(`<p>edit me</p>${chem}`);
    expect(s.engineDoc.content!.map((n) => n.type)).toEqual(["paragraph", "paragraph"]);
    const engine = JSON.parse(JSON.stringify(s.engineDoc)) as DocNode;
    engine.content![1].content!.push({ type: "text", text: "!" });
    const out = saveFromEngine(engine, s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html).toBe("<p>edit me</p><p>H<sub>2</sub>O and E=mc<sup>2</sup>!</p>");
  });

  it("a web comment survives an edit in its own paragraph, as an invisible mark (comments are off on both)", () => {
    const commented = '<p>see <span data-comment-id="c-42" class="tiptop-comment">this part</span> here</p>';
    const s = openForEditing(`<p>edit me</p>${commented}`);
    expect(s.engineDoc.content![1].type).toBe("paragraph");
    const engine = JSON.parse(JSON.stringify(s.engineDoc)) as DocNode;
    engine.content![1].content!.push({ type: "text", text: "!" });
    const out = saveFromEngine(engine, s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html).toBe('<p>edit me</p><p>see <span data-comment-id="c-42" class="tiptop-comment">this part</span> here!</p>');
  });

  it("deleting the commented text deletes the comment", () => {
    const s = openForEditing('<p>see <span data-comment-id="c-42" class="tiptop-comment">this</span></p>');
    const engine = JSON.parse(JSON.stringify(s.engineDoc)) as DocNode;
    engine.content![0].content = [{ type: "text", text: "see " }];
    const out = saveFromEngine(engine, s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html).toBe("<p>see </p>");
  });

  it("a list with sup inside is edited like any list (no lock)", () => {
    const list = "<ul><li><p>x<sup>2</sup></p></li><li><p>plain</p></li></ul>";
    const s = openForEditing(`<p>a</p>${list}`);
    expect(s.engineDoc.content![1].type).toBe("bulletList");
    const out = saveFromEngine(s.engineDoc, s);
    expect(out).toEqual(expect.objectContaining({ ok: true, html: `<p>a</p>${list}` }));
  });

  it("legacy content the web does not know (img, iframe) survives an edit", () => {
    const legacy = '<img src="/uploads/a.png" data-width="300"><iframe src="https://www.youtube.com/embed/x"></iframe>';
    const s = openForEditing(`<p>a</p>${legacy}`);
    const out = saveFromEngine(typeInFirstParagraph(s.engineDoc, "b"), s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html).toBe(`<p>ab</p>${legacy}`);
  });

  it("a damaged read-only block is not saved: the screen falls back to the read view", () => {
    const s = openForEditing('<table><tbody><tr><td><p>x</p></td></tr></tbody></table><p>a</p>');
    const damaged = JSON.parse(JSON.stringify(s.engineDoc)) as DocNode;
    expect(damaged.content![0].type).toBe(READ_ONLY_ATOM);
    damaged.content![0].attrs = { kind: "table", node: "{broken" };
    expect(saveFromEngine(damaged, s)).toEqual({ ok: false, reason: "damaged", message: expect.stringMatching(/read-only block/) });
  });

  it("a document the web could not load is not saved", () => {
    const s = openForEditing("<p>a</p>");
    const bad = { type: "doc", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] } as DocNode;
    expect(saveFromEngine(bad, s)).toEqual(expect.objectContaining({ ok: false, reason: "invalid" }));
  });

  it("an empty note saves as something the web loads as its empty note", () => {
    const s = openForEditing("");
    const out = saveFromEngine({ type: "doc", content: [{ type: "paragraph" }] }, s);
    if (!out.ok) throw new Error(out.message);
    expect(fromHTML(out.html)).toEqual({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: null } }] });
  });
});
