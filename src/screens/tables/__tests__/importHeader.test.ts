/**
 * The other side of review T1 (ee, 2026-11-21): a list WITH a header line keeps
 * it as the header. The fix guesses with looksLikeHeader, so "Name,City,Age" is
 * not demoted to a data row under "Column 1,Column 2,Column 3".
 */
import { readForImport, type ReadDeps } from "../importFlow";
import type { LocalFile } from "@/api/tableImports";

function deps(): ReadDeps {
  return {
    preview: jest.fn(async () => Promise.reject({ response: { status: 404 } })),
    refusal: () => "missing",
    readText: jest.fn(async () => ""),
    saveCsv: jest.fn((_text: string, name: string): LocalFile => ({ uri: `file:///c/${name}`, name, mimeType: "text/csv" })),
    tableColumnNames: [],
    columnName: (n: number) => `Column ${n}`,
    maxBytes: 50 * 1024 * 1024,
  } as ReadDeps;
}

it("a pasted list with a header line sends that line as the header, and no Column N line", async () => {
  const d = deps();
  const out = await readForImport({ kind: "paste", text: "Name,City,Age\nAhmad,Kabul,12\nBilal,Herat,15" }, d);
  const sent = (d.saveCsv as jest.Mock).mock.calls[0][0] as string;
  expect(sent.split("\n")[0]).toBe("Name,City,Age");
  expect(sent).not.toContain("Column 1");
  expect(out.kind).toBe("sheet");
  if (out.kind === "sheet") expect(out.sheet.rowCount).toBe(2);
});
