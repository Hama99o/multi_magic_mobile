/**
 * A page gets the note's whole editor (parity #50): only the note-record keys
 * (note colour, the note's ⋮ menu) are left out. Links, images and code
 * blocks are offered.
 */
import { buildToolbar, type ToolbarInput } from "@/screens/notes/editor/toolbarModel";
import { forPage, linkHref } from "../pageEditor";

const base: ToolbarInput = { marks: {}, nodes: { paragraph: true }, canUndo: true, canRedo: true, hasSelection: false, panel: null, focused: true };
const ids = (input: ToolbarInput) => forPage(buildToolbar(input).keys).map((k) => k.id);

it("leaves out the note colour and the note's menu, and nothing else on the main row", () => {
  const all = buildToolbar(base).keys.map((k) => k.id);
  const page = ids(base);
  expect(page).not.toContain("noteColor");
  expect(page).not.toContain("more");
  expect(all.filter((id) => !page.includes(id)).sort()).toEqual(["more", "noteColor"]);
});

it("offers a link on a selection", () => {
  expect(ids({ ...base, hasSelection: true })).toContain("link");
});

it("offers an image and a code block in the Insert panel", () => {
  const insert = forPage(buildToolbar({ ...base, panel: "insert" }).keys).map((k) => JSON.stringify(k.command));
  expect(insert).toContain(JSON.stringify({ kind: "insert", value: "image" }));
  expect(insert.some((c) => c.includes('"codeBlock"'))).toBe(true);
});

it("offers the language key inside a code block", () => {
  expect(ids({ ...base, nodes: { codeBlock: true }, codeLanguage: "ruby" })).toContain("codeLanguage");
});

it("turns a typed address into a link the web opens", () => {
  expect(linkHref("  example.com ")).toBe("https://example.com");
  expect(linkHref("mailto:a@b.c")).toBe("mailto:a@b.c");
  expect(linkHref("http://x.y")).toBe("http://x.y");
  expect(linkHref("   ")).toBeNull();
});
