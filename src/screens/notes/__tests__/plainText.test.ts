/** The note as plain text: what Copy (the web's copy-content icon) and Send give. */
import { notePlainText } from "../plainText";

it("is the title, a blank line, then the body's lines", () => {
  expect(notePlainText("Groceries", "<p>bread</p><ul><li><p>fruit</p></li></ul>")).toBe("Groceries\n\nbread\n• fruit");
});

it("without a title it is just the body; an empty note is empty", () => {
  expect(notePlainText("  ", "<p>only body</p>")).toBe("only body");
  expect(notePlainText("", "<p></p>")).toBe("");
});
