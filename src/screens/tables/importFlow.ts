/**
 * READING WHAT IS TO BE IMPORTED (increment 7): a file picked on the phone,
 * or pasted text. The server's preview reads it when it can (any format, the
 * whole file, its guesses); while the preview is not deployed (404), the
 * phone reads a CSV or a paste itself and says an Excel file needs the web
 * or a CSV copy. Dependencies are injected, so every branch is a test.
 */
import type { LocalFile, PreviewRefusal, Sheet } from "@/api/tableImports";
import { looksLikeHeader, pastedGrid, toCsv } from "./importGrid";
import { sheetFromGrid } from "./importSheet";

export type ImportInput = { kind: "file"; file: LocalFile & { size: number | null } } | { kind: "paste"; text: string };

export type ReadOutcome = { kind: "sheet"; sheet: Sheet } | { kind: "refused"; reason: PreviewRefusal | "needs_server" | "empty" };

export interface ReadDeps {
  preview: (file: LocalFile) => Promise<Sheet>;
  refusal: (e: unknown) => PreviewRefusal;
  /** A file's text (UTF-8). */
  readText: (uri: string) => Promise<string>;
  /** Pasted text saved as a CSV in the cache, as a file the preview and the import can take. */
  saveCsv: (text: string, name: string) => LocalFile;
  tableColumnNames: string[];
  columnName: (n: number) => string;
  maxBytes: number;
}

const TEXT_FILE = /\.(csv|tsv|txt)$/i;
export const isTextFile = (f: { name: string; mimeType: string | null }) => TEXT_FILE.test(f.name) || Boolean(f.mimeType?.startsWith("text/"));

export async function readForImport(input: ImportInput, deps: ReadDeps): Promise<ReadOutcome> {
  if (input.kind === "file" && input.file.size !== null && input.file.size > deps.maxBytes) return { kind: "refused", reason: "too_large" };
  // A paste is a small CSV through the same preview (one guesser, the server's): multi-magic-83, 2026-11-21.
  let grid: string[][] | null = null;
  let file: LocalFile;
  if (input.kind === "paste") {
    grid = pastedGrid(input.text);
    if (!grid.length) return { kind: "refused", reason: "empty" };
    // The same guess the phone's own sheet makes (importSheet), so a list with no header line
    // gets "Column N" names and its first row is imported, not read as the header (review T1, ee).
    file = deps.saveCsv(toCsv(grid, looksLikeHeader(grid, deps.tableColumnNames), deps.columnName), "paste.csv");
  } else file = input.file;

  try {
    return { kind: "sheet", sheet: await deps.preview(file) };
  } catch (e) {
    const reason = deps.refusal(e);
    if (reason !== "missing") return { kind: "refused", reason };
  }
  // The preview is not there yet: the phone reads text itself.
  if (input.kind === "file" && !isTextFile(input.file)) return { kind: "refused", reason: "needs_server" };
  const rows = grid ?? pastedGrid(await deps.readText(file.uri));
  if (!rows.length) return { kind: "refused", reason: "empty" };
  const csv = toCsv(rows, looksLikeHeader(rows, deps.tableColumnNames), deps.columnName);
  return { kind: "sheet", sheet: sheetFromGrid(rows, { csv, filename: file.name, tableColumnNames: deps.tableColumnNames, columnName: deps.columnName }) };
}
