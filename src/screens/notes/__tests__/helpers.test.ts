import { dirOf, textOf } from "../editor/dir";
import { bulletMarker, orderedMarker, rawInfo, tableRows, tableSize } from "../editor/preview";
import { noteSnippet } from "../snippet";

describe("dirOf", () => {
  it.each([
    ["hello", "ltr"],
    ["د سفر لپاره لیست", "rtl"],
    ["  123 – שלום", "rtl"],
    ["123 !", "ltr"],
    ["", "ltr"],
  ])("%s → %s", (text, dir) => expect(dirOf(text)).toBe(dir));

  it("falls back to the note's direction without a strong character", () => {
    expect(dirOf("123", "rtl")).toBe("rtl");
  });
});

describe("orderedMarker", () => {
  it.each([
    [0, 1, null, "1."],
    [2, 3, null, "5."],
    [0, 1, "a", "a."],
    [26, 1, "a", "aa."],
    [1, 1, "A", "B."],
    [3, 1, "i", "iv."],
    [8, 1, "I", "IX."],
    [0, 0, null, "0."],
  ])("item %i of a list starting at %i, type %s → %s", (i, start, type, out) => {
    expect(orderedMarker(i, start, type)).toBe(out);
  });

  it("cycles bullets by depth", () => {
    expect([0, 1, 2, 3].map(bulletMarker)).toEqual(["•", "◦", "▪", "•"]);
  });
});

describe("tables", () => {
  const cell = (text: string, colspan = 1) => ({ type: "tableCell", attrs: { colspan }, content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] });
  const table = { type: "table", content: [{ type: "tableRow", content: [cell("Month"), cell("Paid")] }, { type: "tableRow", content: [cell("Sept", 2)] }] };

  it("reads cell text row by row", () => expect(tableRows(table)).toEqual([["Month", "Paid"], ["Sept"]]));
  it("counts columns with colspans", () => expect(tableSize(table)).toEqual([2, 2]));
});

describe("rawInfo", () => {
  it("a legacy image shows its picture", () => {
    expect(rawInfo("img", '<img src="https://example.com/a.png" data-width="300">')).toEqual({ kind: "legacyImage", imageUri: "https://example.com/a.png" });
  });
  it("a YouTube embed leads to the watch page", () => {
    expect(rawInfo("iframe", '<iframe src="https://www.youtube.com/embed/abc123XYZ"></iframe>')).toEqual({ kind: "embed", url: "https://www.youtube.com/watch?v=abc123XYZ" });
  });
  it("never opens a non-http source", () => {
    expect(rawInfo("img", '<img src="javascript:alert(1)">')).toEqual({ kind: "unknown" });
    expect(rawInfo("iframe", "<iframe src=\"data:text/html,x\"></iframe>")).toEqual({ kind: "embed", url: undefined });
  });
});

describe("noteSnippet", () => {
  it("joins blocks with a dot and decodes entities", () => {
    expect(noteSnippet("<h1>Plan</h1><p>a &amp; b</p><ul><li><p>one</p></li></ul>")).toBe("Plan · a & b · one");
  });
  it("is empty for an empty note", () => expect(noteSnippet("<p></p>")).toBe(""));
  it("cuts long text", () => expect(noteSnippet(`<p>${"x".repeat(300)}</p>`, 20)).toHaveLength(20));
  // Device QA 2026-11-12: the notes list hung forever on real dev notes (a
  // 914 KB note, runs of empty paragraphs): the separator clean-up regexes
  // backtracked exponentially. Each case must finish in well under a second.
  it("stays fast on many empty paragraphs followed by text", () => {
    const t0 = Date.now();
    expect(noteSnippet(`${"<p></p>".repeat(40)}<p>end</p>${"<p></p>".repeat(40)}x`)).toBe("end · x");
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it("stays fast on a megabyte note with an inline image", () => {
    const t0 = Date.now();
    const html = `<p><img src="data:image/png;base64,${"A".repeat(1_000_000)}"></p>${"<p>a</p><p></p>".repeat(5000)}`;
    expect(noteSnippet(html).startsWith("a · a")).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe("textOf", () => {
  it("joins text nodes", () => expect(textOf({ type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }] })).toBe("ab"));
});
