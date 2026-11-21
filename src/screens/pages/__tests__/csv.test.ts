/**
 * Sheet preview (parity #46): a CSV or TSV read into rows the phone can
 * draw, by RFC 4180, capped for a preview. Invented values only.
 */
import { MAX_COLUMNS, MAX_ROWS, parseDelimited } from "../csv";
import { modeFor } from "../viewerModes";

it("reads quotes, doubled quotes and line breaks inside quotes", () => {
  const { rows } = parseDelimited('name,note\r\n"Ada, L.","says ""hi""\nthen leaves"\nBob,ok\n', "Budget.csv");
  expect(rows).toEqual([
    ["name", "note"],
    ["Ada, L.", 'says "hi"\nthen leaves'],
    ["Bob", "ok"],
  ]);
});

it("picks the separator: tab for .tsv, else the one the first line uses most", () => {
  expect(parseDelimited("a\tb\n1\t2", "x.tsv").rows).toEqual([["a", "b"], ["1", "2"]]);
  expect(parseDelimited("a;b;c\n1;2;3", "x.csv").rows).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
});

it("caps a big sheet for the preview and says it did", () => {
  const big = Array.from({ length: MAX_ROWS + 5 }, (_, i) => Array.from({ length: MAX_COLUMNS + 3 }, (_, j) => `${i}-${j}`).join(",")).join("\n");
  const out = parseDelimited(big, "big.csv");
  expect(out.rows).toHaveLength(MAX_ROWS);
  expect(out.rows[0]).toHaveLength(MAX_COLUMNS);
  expect(out.truncated).toBe(true);
});

it("a CSV opens as a sheet, by type or by name; an .xlsx is read by the server, not parsed on the phone", () => {
  expect(modeFor({ kind: "file", mimeType: "text/csv", title: "a.csv" }, "android")).toBe("sheet");
  expect(modeFor({ kind: "file", mimeType: "application/octet-stream", title: "a.tsv" }, "android")).toBe("sheet");
  expect(modeFor({ kind: "file", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", title: "a.xlsx" }, "android")).toBe("workbook"); // WorkbookView, spreadsheet_preview
});
