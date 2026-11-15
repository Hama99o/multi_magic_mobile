/**
 * Server fields the web writes with its rich-text editor (contact notes) come
 * back as Tiptap HTML. These helpers decide whether a value is HTML, turn it
 * into a document for the native read view, and into plain text for a copy or
 * a one-line preview. Invented fixtures only.
 */
import { htmlToPlainText, isRichText, parseRichText } from "../richText";

describe("isRichText", () => {
  it.each([
    ["<p>Door code is on the fridge</p><p></p>", true],
    ["Line one<br>line two", true],
    ['<span style="color: red">red</span>', true],
    ["Gate code 4411", false],
    ["5 < 6 and 7 > 3", false],
    ["a <3 heart", false],
    ["", false],
  ])("%s → %s", (value, expected) => expect(isRichText(value)).toBe(expected));
});

describe("parseRichText", () => {
  it("drops the empty paragraphs the web editor leaves at the end", () => {
    const doc = parseRichText("<p>Door code is on the fridge</p><p></p><p>  </p><p></p>");
    expect(doc.content?.map((n) => n.type)).toEqual(["paragraph"]);
  });

  it("keeps an empty paragraph between two written ones", () => {
    const doc = parseRichText("<p>first</p><p></p><p>second</p><p></p>");
    expect(doc.content).toHaveLength(3);
  });
});

describe("htmlToPlainText", () => {
  it("strips tags, decodes entities and puts each block on its own line", () => {
    expect(htmlToPlainText("<p>Door code is on the <strong>fridge</strong> &amp; spare key</p><p></p><ul><li><p>Water   the plants</p></li></ul>"))
      .toBe("Door code is on the fridge & spare key\nWater the plants");
  });

  it("joins with the separator given, for a one-line preview", () => {
    expect(htmlToPlainText("<p>one</p><p>two</p>", " · ")).toBe("one · two");
  });

  it("leaves plain text as it is, line breaks included", () => {
    expect(htmlToPlainText("Gate code 4411\nAsk for Bilal at 5 < 6")).toBe("Gate code 4411\nAsk for Bilal at 5 < 6");
  });
});
