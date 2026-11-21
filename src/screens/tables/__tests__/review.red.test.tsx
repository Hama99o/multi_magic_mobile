/**
 * REVIEW (ee, 2026-11-21) of feat/tables 5583dc6: red tests, one per finding.
 *
 * T1 (HIGH, data loss): a paste or a CSV with NO header line loses its first row. Both calls in
 *    importFlow.ts (:39 paste, :52 fallback) pass `toCsv(rows, true, …)`, so the "Column N" header
 *    toCsv exists to add is never written, and the server always takes the first line as the header.
 * T3 (HIGH, data loss): bulk edit of a number column with "1,250.50" (or "12 AFN"): parseNumber
 *    returns null, Apply stays enabled, and null means "clear": the column is emptied on every
 *    selected row.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { FieldDefinition } from "@/api/fields";
import { readForImport, type ReadDeps } from "../importFlow";
import type { LocalFile } from "@/api/tableImports";
import { BulkEditSheet } from "../BulkEditSheet";

const notDeployed = { response: { status: 404 } };
function deps(over: Partial<ReadDeps> = {}): ReadDeps {
  return {
    preview: jest.fn(async () => Promise.reject(notDeployed)),
    refusal: (e) => ((e as { response?: { status?: number } }).response?.status === 404 ? "missing" : "unreadable"),
    readText: jest.fn(async () => ""),
    saveCsv: jest.fn((_text: string, name: string): LocalFile => ({ uri: `file:///c/${name}`, name, mimeType: "text/csv" })),
    tableColumnNames: [],
    columnName: (n) => `Column ${n}`,
    maxBytes: 50 * 1024 * 1024,
    ...over,
  } as ReadDeps;
}

describe("T1: a list with no header keeps its first row", () => {
  it("the CSV sent for a headerless paste starts with the Column N names, not with the first person", async () => {
    const d = deps();
    await readForImport({ kind: "paste", text: "Ahmad,Kabul,12\nBilal,Herat,15" }, d);
    const sent = (d.saveCsv as jest.Mock).mock.calls[0][0] as string;
    expect(sent.split("\n")[0]).toBe("Column 1,Column 2,Column 3");
    expect(sent).toContain("Ahmad,Kabul,12");
  });

  it("preview not deployed: the CSV the import will read has a header line, so 2 rows stay 2 rows", async () => {
    const out = await readForImport({ kind: "paste", text: "Ahmad,Kabul,12\nBilal,Herat,15" }, deps());
    expect(out.kind).toBe("sheet");
    if (out.kind !== "sheet") return;
    const csv = (out.sheet as { source?: { csv?: string } }).source?.csv ?? "";
    expect(csv.split("\n")[0]).toBe("Column 1,Column 2,Column 3");
  });
});

describe("T3: a number the phone cannot read never clears the column on every row", () => {
  const decimal = { id: 7, name: "Price", key: "price", fieldType: "decimal", recordClass: null, tagCategoryId: null, position: 1, required: false, config: {}, ownerType: "Table" } as unknown as FieldDefinition;
  it.each(["1,250.50", "12 AFN", "12abc"])("typed %p: Apply is refused or does not send null", (typed) => {
    const onApply = jest.fn();
    render(<BulkEditSheet count={40} fields={[decimal]} busy={false} error={null} onApply={onApply} onClose={() => {}} />);
    fireEvent.changeText(screen.getByTestId("tables-bulk-value"), typed);
    fireEvent.press(screen.getByTestId("tables-bulk-edit-apply"));
    const sentNull = onApply.mock.calls.some(([, v]) => v === null);
    expect(sentNull).toBe(false);
  });
});
