/**
 * A grid card's preview (owner's Keep screenshots, 2026-11-13, not stored):
 * several lines of the body, keeping line breaks and indents, lists shown as
 * lists, truncated with "…". Plain text only; never the stored HTML.
 */
import { cardPreview } from "../cardPreview";

it("keeps paragraphs as lines and hard breaks as line breaks", () => {
  expect(cardPreview("<p>one</p><p>two<br>three</p>", 10).lines).toEqual(["one", "two", "three"]);
});

it("shows lists as lists, nested items indented, to-dos as boxes", () => {
  const html = '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul><ol><li><p>c</p></li></ol><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li></ul>';
  expect(cardPreview(html, 10).lines).toEqual(["• a", "    • b", "1. c", "☑ done", "☐ todo"]);
});

it("keeps a code block's lines and their indentation", () => {
  expect(cardPreview("<pre><code>def x\n  1\nend</code></pre>", 10).lines).toEqual(["def x", "  1", "end"]);
});

it("stops at the line budget and says it was cut", () => {
  const out = cardPreview("<p>1</p><p>2</p><p>3</p><p>4</p>", 3);
  expect(out.lines).toEqual(["1", "2", "3"]);
  expect(out.truncated).toBe(true);
  expect(cardPreview("<p>1</p>", 3).truncated).toBe(false);
});

it("cuts a very long line", () => {
  const out = cardPreview(`<p>${"x".repeat(500)}</p>`, 3);
  expect(out.lines[0].length).toBeLessThanOrEqual(281);
  expect(out.lines[0].endsWith("…")).toBe(true);
});

it("drops empty paragraphs at the start and end, keeps one blank line inside", () => {
  expect(cardPreview("<p></p><p>a</p><p></p><p></p><p>b</p><p></p>", 10).lines).toEqual(["a", "", "b"]);
});

it("legacy and unknown markup never leaks as HTML", () => {
  const out = cardPreview('<p>see</p><img src="https://x/y.png" data-width="300"><iframe src="https://www.youtube.com/embed/a"></iframe>', 10);
  expect(out.lines.join("\n")).not.toMatch(/[<>]/);
});

it("stays fast on a 1 MB note (it only reads what it shows)", () => {
  const big = `<p>${"word ".repeat(200000)}</p>`.repeat(1);
  const t0 = Date.now();
  cardPreview(big, 8);
  expect(Date.now() - t0).toBeLessThan(1500);
});

it("shows a table as one line per row, cells joined (not one cell per line)", () => {
  const html = '<p>November</p><table><tbody><tr><th colspan="1" rowspan="1"><p>Item</p></th><th><p>Plan</p></th><th><p>Spent</p></th></tr><tr><td><p>Rent</p></td><td><p>800</p></td><td><p>800</p></td></tr></tbody></table><p>after</p>';
  expect(cardPreview(html, 10).lines).toEqual(["November", "Item · Plan · Spent", "Rent · 800 · 800", "after"]);
});

it("a cell with two paragraphs stays in its row", () => {
  const html = "<table><tbody><tr><td><p>a</p><p>b</p></td><td><p>c</p></td></tr></tbody></table>";
  expect(cardPreview(html, 10).lines).toEqual(["a b · c"]);
});
