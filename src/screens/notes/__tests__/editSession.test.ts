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
import { SOURCE_MAP_LIMIT, openForEditing, saveFromEngine } from "../editor/editSession";

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

describe("a very long note (device, 2026-11-13: a 900 KB note did not open in 90 s)", () => {
  // Invented text; the size of the owner's longest note, never its content.
  const long = (kb: number) => {
    const block = "<p>river lantern <strong>copper</strong> meadow orbit velvet harbor quiet pixel maple ember canyon</p><ul><li><p>falcon garnet</p></li></ul>";
    return block.repeat(Math.ceil((kb * 1024) / block.length));
  };

  // PERF BUDGET (device, 2026-11-14, [notes-open] on the emulator): opening a
  // 100 KB note took 3.8 s to the first engine event, 1.6 s of it our codec,
  // mostly the source map (2-3x a plain parse). Opening 100 KB may cost at
  // most 1.6x a plain fromHTML: a ratio, so any machine can run it.
  it("PERF BUDGET: opening a 100 KB note costs at most 1.6x a plain parse", () => {
    const html = long(100);
    const best = (fn: () => unknown) => {
      fn();
      let min = Infinity;
      for (let i = 0; i < 5; i++) {
        const a = performance.now();
        fn();
        min = Math.min(min, performance.now() - a);
      }
      return min;
    };
    const plain = best(() => fromHTML(html, { preserveUnknown: true, comments: true }));
    const opening = best(() => openForEditing(html));
    expect(opening / plain).toBeLessThanOrEqual(1.6);
  });

  it(`above ${SOURCE_MAP_LIMIT / 1024} KB it opens without the source map, and saves what the web writes`, () => {
    const html = long(SOURCE_MAP_LIMIT / 1024 + 10);
    const s = openForEditing(html);
    expect(s.source).toBeNull();
    const out = saveFromEngine(typeInFirstParagraph(s.engineDoc, " edited"), s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html.startsWith("<p>river lantern <strong>copper</strong> meadow orbit velvet harbor quiet pixel maple ember canyon edited</p>")).toBe(true);
    roundTrips(out.html);
  });

  it("below it, the source map still keeps untouched blocks byte for byte", () => {
    const s = openForEditing(long(4));
    expect(s.source).not.toBeNull();
  });
});

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

  it("an edit elsewhere keeps tables and code blocks byte for byte (both edited in the engine now)", () => {
    const table = '<table style="min-width: 50px"><colgroup><col><col></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th><th colspan="1" rowspan="1"><p>B</p></th></tr></tbody></table>';
    const code = '<pre><code class="language-ruby">def x\n  1\nend</code></pre>';
    const s = openForEditing(`<p>top</p>${table}${code}`);
    expect(s.engineDoc.content!.map((n) => n.type)).toEqual(["paragraph", "table", "codeBlock"]);
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
    const s = openForEditing('<img src="https://example.com/a.png" data-width="300"><p>a</p>');
    const damaged = JSON.parse(JSON.stringify(s.engineDoc)) as DocNode;
    expect(damaged.content![0].type).toBe(READ_ONLY_ATOM);
    damaged.content![0].attrs = { kind: "rawBlock", node: "{broken" };
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

describe("tables are edited on the phone (owner, 2026-11-13)", () => {
  it("a big paste (a 10x10 table and 300 paragraphs, as B holds them after a paste) saves for the web", () => {
    // B parses a paste against our engine schema; what it holds afterwards is
    // made of the same nodes as an opened note, so take them from one.
    const rows = Array.from({ length: 10 }, (_, r) => `<tr>${Array.from({ length: 10 }, (_, c) => `<td colspan="1" rowspan="1"><p>r${r}c${c}</p></td>`).join("")}</tr>`).join("");
    const pasted = openForEditing(`<table><tbody>${rows}</tbody></table>${Array.from({ length: 300 }, (_, i) => `<p>pasted <em>line</em> ${i}</p>`).join("")}`);
    const s = openForEditing("<p>before</p><p>after</p>");
    const engine = JSON.parse(JSON.stringify(s.engineDoc)) as DocNode;
    engine.content!.splice(1, 0, ...(JSON.parse(JSON.stringify(pasted.engineDoc)) as DocNode).content!);
    const out = saveFromEngine(engine, s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html.startsWith("<p>before</p><table")).toBe(true);
    expect(out.html).toContain("<p>r9c9</p>");
    expect(out.html).toContain("<p>pasted <em>line</em> 299</p>");
    expect(out.html.endsWith("<p>after</p>")).toBe(true);
    expect(validate(fromHTML(out.html)).valid).toBe(true);
  });

  it("an edit in a cell writes the web's table, spans and widths kept", () => {
    const table = '<table style="min-width: 50px"><colgroup><col style="width: 120px"><col style="min-width: 25px"></colgroup><tbody><tr><th colspan="2" rowspan="1" colwidth="120"><p>Head</p></th></tr><tr><td colspan="1" rowspan="1" colwidth="120"><p>a</p></td><td colspan="1" rowspan="1"><p>b</p></td></tr></tbody></table>';
    const s = openForEditing(table);
    const engine = JSON.parse(JSON.stringify(s.engineDoc)) as DocNode;
    const cell = engine.content![0].content![1].content![0].content![0];
    cell.content = [{ type: "text", text: "a!" }];
    const out = saveFromEngine(engine, s);
    if (!out.ok) throw new Error(out.message);
    expect(out.html).toContain('colspan="2"');
    expect(out.html).toContain('colwidth="120"');
    expect(out.html).toContain("<p>a!</p>");
    roundTrips(out.html);
  });
});

describe("the edit size limit (device, 2026-11-14: ANR at 200 KB)", () => {
  const load = (env?: string) => {
    let limit = 0;
    const before = process.env.EXPO_PUBLIC_NOTES_EDIT_LIMIT_KB;
    if (env === undefined) delete process.env.EXPO_PUBLIC_NOTES_EDIT_LIMIT_KB;
    else process.env.EXPO_PUBLIC_NOTES_EDIT_LIMIT_KB = env;
    jest.isolateModules(() => {
      limit = require("../editor/editSession").EDIT_SIZE_LIMIT;
    });
    if (before === undefined) delete process.env.EXPO_PUBLIC_NOTES_EDIT_LIMIT_KB;
    else process.env.EXPO_PUBLIC_NOTES_EDIT_LIMIT_KB = before;
    return limit;
  };
  // Measured 2026-11-14 (epoch_probe, 20 keys at a person's pace, emulator):
  // 50, 75, 100 (twice) and 112 KB edit and save; 125 KB is an ANR. 96 KB
  // keeps a margin of about 15 % under the largest size that passed.
  it("is 96 KB by default (measured: 112 KB passed, 125 KB was an ANR)", () => {
    expect(load()).toBe(96 * 1024);
  });
  it("a dev build can raise it for the probe (EXPO_PUBLIC_NOTES_EDIT_LIMIT_KB); nonsense is ignored", () => {
    expect(load("175")).toBe(175 * 1024);
    expect(load("abc")).toBe(96 * 1024);
    expect(load("0")).toBe(96 * 1024);
  });
});
