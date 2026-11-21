/**
 * The text editor's model (web TextEditorDoc): runs addressed by page, stream
 * and position; only changed lines sent; the font's alphabet checked while
 * typing; the four "nothing to edit" cases told apart; the edit report summed.
 */
import { addressOf, boxOn, buildEdits, isChanged, keyOf, loadWarning, missingGlyphs, parseTextDocument, summarise, type TextRun } from "../textRuns";

const run = (over: Partial<TextRun> = {}): TextRun => ({
  page: 0, container: "page", index: 3, text: "Total 12", readable: true, visible: true,
  x: 72, y: 700, width: 100, height: 12, size: 10, font: "Helvetica", color: "#000000", alphabet: "Total 12", ...over,
});

it("reads the server's answer, defaults filled in", () => {
  const doc = parseTextDocument({ runs: [{ page: 0, container: "form:Fm1", index: 2, text: "Hi", x: 1, y: 2, width: 3, height: 4, size: 9, font: "F", color: "#111111" }], pages: [{ index: 0, width: 612, height: 792, rotation: 90 }], truncated: false, unreadable: 1 });
  expect(doc.runs[0]).toMatchObject({ readable: true, visible: true, alphabet: null, container: "form:Fm1" });
  expect(doc.pages[0].rotation).toBe(90);
  expect(doc.outlines).toEqual([]);
});

it("a run's address survives a stream name with a bar in it", () => {
  const r = run({ container: "form:a|b", index: 7, page: 2 });
  expect(addressOf(keyOf(r))).toEqual({ page: 2, container: "form:a|b", index: 7 });
});

it("only changed lines go to the server, a highlight with its box", () => {
  const a = run();
  const b = run({ index: 4, text: "Name" });
  const byKey = new Map([[keyOf(a), a], [keyOf(b), b]]);
  const edits = buildEdits({ [keyOf(a)]: { text: "Total 21", size: 10, color: "#000000" }, [keyOf(b)]: { text: "Name", highlight: "#ffe066" } }, byKey);
  expect(edits).toEqual([
    { page: 0, container: "page", index: 3, text: "Total 21" },
    { page: 0, container: "page", index: 4, text: "Name", highlight: "#ffe066", box: { x: 72, y: 700, width: 100, height: 12 } },
  ]);
  expect(isChanged(a, { text: "Total 12" })).toBe(false);
});

it("says which characters the embedded subset cannot write, unless the line is restyled", () => {
  const r = run();
  expect(missingGlyphs(r, { text: "Total 42€" })).toEqual(["4", "€"]);
  expect(missingGlyphs(r, { text: "Total 42€", family: "sans" })).toEqual([]);
  expect(missingGlyphs(r, { text: "Total 42€", bold: true })).toEqual([]);
  expect(missingGlyphs(run({ alphabet: null }), { text: "anything" })).toEqual([]);
});

it("places a box from PDF points (origin bottom-left) as fractions from the top-left", () => {
  expect(boxOn({ index: 0, width: 600, height: 800, rotation: 0 }, { x: 60, y: 700, width: 120, height: 20 })).toEqual({ left: 0.1, top: 0.1, width: 0.2, height: 0.025 });
  expect(boxOn({ index: 0, width: 600, height: 800, rotation: 0 }, { x: 0, y: 0, width: 1, height: 1 }).width).toBe(0.012);
});

it("tells the four kinds of nothing-to-edit apart", () => {
  const base = { pages: [], truncated: false, unreadable: 0, outlines: [] };
  expect(loadWarning({ ...base, runs: [run()] })).toBeNull();
  expect(loadWarning({ ...base, truncated: true, runs: [run()] })).toBe("tooMuchText");
  expect(loadWarning({ ...base, runs: [run({ visible: false })] })).toBe("onlyInvisible");
  expect(loadWarning({ ...base, runs: [run({ readable: false, text: null })] })).toBe("onlyUnreadable");
  expect(loadWarning({ ...base, runs: [] })).toBe("noText");
});

it("sums the X-Edit-Report: substituted fonts, rejections, shared blocks", () => {
  expect(summarise({ applied: [{ strategy: "in_place" }, { strategy: "substituted_font", forced_by: "4" }, { strategy: "substituted_font", forced_by: "€4", shared_with: 3 }], rejected: [{}] }, 4)).toEqual({
    applied: 3, rejected: 1, substituted: { count: 2, characters: "4€" }, sharedWith: 3,
  });
  expect(summarise(null, 2)).toEqual({ applied: 2, rejected: 0, substituted: { count: 0, characters: "" }, sharedWith: 0 });
});
