/**
 * Reading what is to be imported (increment 7): the server's preview when it
 * answers, the phone's own CSV reader while it is not deployed, and a clear
 * refusal otherwise.
 */
import type { LocalFile, Sheet } from "@/api/tableImports";
import { readForImport, type ReadDeps } from "../importFlow";

const csvFile = { uri: "file:///c/stock.csv", name: "stock.csv", mimeType: "text/csv", size: 120 };
const xlsx = { uri: "file:///c/stock.xlsx", name: "stock.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 9000 };
const serverSheet = { headers: ["Nom"] } as unknown as Sheet;
const notDeployed = Object.assign(new Error("404"), { response: { status: 404 } });

function deps(over: Partial<ReadDeps> = {}): ReadDeps {
  return {
    preview: jest.fn(async () => serverSheet),
    refusal: (e) => ((e as { response?: { status?: number } }).response?.status === 404 ? "missing" : "unreadable"),
    readText: jest.fn(async () => "Nom,Ville\nAhmad,Kabul\nBilal,Herat"),
    saveCsv: jest.fn((_text: string, name: string): LocalFile => ({ uri: `file:///c/${name}`, name, mimeType: "text/csv" })),
    tableColumnNames: [],
    columnName: (n) => `Column ${n}`,
    maxBytes: 50 * 1024 * 1024,
    ...over,
  };
}

it("the server reads the file when it can", async () => {
  const d = deps();
  expect(await readForImport({ kind: "file", file: xlsx }, d)).toEqual({ kind: "sheet", sheet: serverSheet });
  expect(d.readText).not.toHaveBeenCalled();
});

it("a paste goes to the same preview as paste.csv", async () => {
  const d = deps();
  await readForImport({ kind: "paste", text: "Nom\tVille\nAhmad\tKabul" }, d);
  expect(d.saveCsv).toHaveBeenCalledWith("Nom,Ville\nAhmad,Kabul\n", "paste.csv");
  expect(d.preview).toHaveBeenCalledWith({ uri: "file:///c/paste.csv", name: "paste.csv", mimeType: "text/csv" });
});

it("preview not deployed: a CSV is read on the phone, with its header and guesses", async () => {
  const out = await readForImport({ kind: "file", file: csvFile }, deps({ preview: jest.fn(async () => Promise.reject(notDeployed)) }));
  expect(out.kind).toBe("sheet");
  if (out.kind !== "sheet") return;
  expect(out.sheet.headers).toEqual(["Nom", "Ville"]);
  expect(out.sheet.rowCount).toBe(2);
  expect(out.sheet.source).toEqual({ kind: "csv", csv: "Nom,Ville\nAhmad,Kabul\nBilal,Herat\n", filename: "stock.csv" });
});

it("preview not deployed: an Excel file is refused as needing the server (save as CSV, or the web)", async () => {
  expect(await readForImport({ kind: "file", file: xlsx }, deps({ preview: jest.fn(async () => Promise.reject(notDeployed)) }))).toEqual({ kind: "refused", reason: "needs_server" });
});

it("a refusal the server names is passed on; a file over the cap is refused before any upload; a blank paste is empty", async () => {
  expect(await readForImport({ kind: "file", file: xlsx }, deps({ preview: jest.fn(async () => Promise.reject({ response: { status: 422 } })) }))).toEqual({ kind: "refused", reason: "unreadable" });
  const d = deps();
  expect(await readForImport({ kind: "file", file: { ...xlsx, size: 60 * 1024 * 1024 } }, d)).toEqual({ kind: "refused", reason: "too_large" });
  expect(d.preview).not.toHaveBeenCalled();
  expect(await readForImport({ kind: "paste", text: "  \n " }, deps())).toEqual({ kind: "refused", reason: "empty" });
});
