/**
 * TABLE IMPORTS (increment 7): the server's background import
 * (`imports_controller.rb`) and its spreadsheet preview (multi-magic-83's
 * contract, branch feat/spreadsheet-preview 11e7db65, checked on :3020
 * 2026-11-21; `docs/table_app/SPREADSHEET_PREVIEW.md` there).
 *
 * The file goes up ONCE: the preview keeps it and answers an `upload` id,
 * which `create` sends instead of the file. A paste is a small "paste.csv"
 * through the same preview (one guesser, the server's, over the whole file).
 * While the preview endpoint is not deployed (404), the phone reads CSV and
 * pastes itself (`importSheet.ts`) and sends the CSV with the import.
 */
import { http } from "./http";
import { arr, id, obj, optStr } from "./parse";

const BASE = "/api/v1/table_app";

export const IMPORT_TYPES = ["text", "long_text", "decimal", "phone", "email", "url", "single_select", "date", "boolean"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

/** The types a value can be refused for, as the preview names them (`integer` too: the mapping may pick it). */
export const REFUSAL_KEYS = ["text", "long_text", "decimal", "integer", "phone", "email", "url", "single_select", "date", "boolean"] as const;
export type RefusalKey = (typeof REFUSAL_KEYS)[number];

export interface ColumnGuess {
  type: ImportType;
  /** Share of rows with a value, 0–1. */
  fillRate: number;
  /** First distinct non-empty values, for the mapping screen. */
  samples: string[];
  /** A select's distinct values, most frequent first. */
  options: string[];
  /**
   * Per type the column could be given: how many values it would refuse, and the first. Every
   * key is always there (the server's contract, multi-magic-83 2026-11-21); only decimal,
   * integer, boolean and date can refuse anything, the rest are always 0.
   */
  refused: Record<RefusalKey, { count: number; first: string | null }>;
}

export interface Sheet {
  /** Where it came from: the server's upload id to import it without sending it again, or the CSV text built on the phone. */
  source: { kind: "upload"; upload: string; filename: string } | { kind: "csv"; csv: string; filename: string };
  sheets: { index: number; name: string }[];
  sheet: number;
  headers: string[];
  unnamed: boolean[];
  rowCount: number;
  truncated: boolean;
  sample: string[][];
  guesses: ColumnGuess[];
}

/** The import's own cap, and the preview's. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export type LocalFile = { uri: string; name: string; mimeType: string };

export interface TableImport {
  id: number;
  tableId: number;
  status: "queued" | "running" | "done" | "failed" | "cancelled" | string;
  filename: string;
  totalRows: number | null;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errorMessage: string | null;
  cancelRequested: boolean;
  percent: number;
  hasErrors: boolean;
  dismissedAt: string | null;
}

const n = (v: unknown) => (typeof v === "number" ? v : 0);

export function parseImport(raw: unknown): TableImport {
  const i = obj(raw, "import");
  return {
    id: id(i.id, "import.id"),
    tableId: id(i.table_id, "import.table_id"),
    status: optStr(i.status) ?? "queued",
    filename: optStr(i.filename) ?? "",
    totalRows: typeof i.total_rows === "number" ? i.total_rows : null,
    processedRows: n(i.processed_rows),
    createdCount: n(i.created_count),
    updatedCount: n(i.updated_count),
    errorCount: n(i.error_count),
    errorMessage: optStr(i.error_message),
    cancelRequested: i.cancel_requested === true,
    percent: n(i.percent),
    hasErrors: i.has_errors === true,
    dismissedAt: optStr(i.dismissed_at),
  };
}

/** The preview's answer as the mapping screen's Sheet. */
export function parsePreview(raw: unknown): Sheet {
  const p = obj(raw, "preview");
  const strings = (v: unknown) => (Array.isArray(v) ? v.map((x) => (x === null || x === undefined ? "" : String(x))) : []);
  const guesses = arr(p.guesses, "preview.guesses").map((g): ColumnGuess => {
    const x = obj(g, "guess");
    const refusedRaw = x.refused && typeof x.refused === "object" ? (x.refused as Record<string, unknown>) : {};
    const refused = Object.fromEntries(
      REFUSAL_KEYS.map((k) => {
        const r = refusedRaw[k] && typeof refusedRaw[k] === "object" ? (refusedRaw[k] as Record<string, unknown>) : {};
        return [k, { count: n(r.count), first: optStr(r.first) }];
      }),
    ) as ColumnGuess["refused"];
    return { type: (optStr(x.type) ?? "text") as ImportType, fillRate: n(x.fill_rate), samples: strings(x.samples), options: strings(x.options), refused };
  });
  return {
    source: { kind: "upload", upload: String(p.upload ?? ""), filename: optStr(p.filename) ?? "" },
    sheets: (Array.isArray(p.sheets) ? p.sheets : []).map((s) => {
      const x = obj(s, "sheet");
      return { index: n(x.index), name: optStr(x.name) ?? "" };
    }),
    sheet: n(p.sheet),
    headers: strings(p.headers),
    unnamed: Array.isArray(p.unnamed) ? p.unnamed.map((u) => u === true) : [],
    rowCount: n(p.row_count),
    truncated: p.truncated === true,
    sample: (Array.isArray(p.sample) ? p.sample : []).map(strings),
    guesses,
  };
}

/** Why a preview was refused, in the contract's words (or "missing": the endpoint is not deployed yet). */
export type PreviewRefusal = "too_large" | "unsupported_type" | "unreadable" | "empty" | "no_sheet" | "upload_expired" | "missing" | "other";

export function previewRefusal(e: unknown): PreviewRefusal {
  const r = (e as { response?: { status?: number; data?: { reason?: unknown } } })?.response;
  if (!r) return "other";
  if (r.status === 404) return "missing";
  const reason = typeof r.data?.reason === "string" ? r.data.reason : null;
  return reason && ["too_large", "unsupported_type", "unreadable", "empty", "no_sheet", "upload_expired"].includes(reason) ? (reason as PreviewRefusal) : r.status === 413 ? "too_large" : "other";
}

const fileForm = (f: LocalFile) => ({ uri: f.uri, name: f.name, type: f.mimeType }) as unknown as Blob;
const multipart = { headers: { "Content-Type": "multipart/form-data" }, timeout: 120_000 };

export const tableImportsApi = {
  /** A file (or a paste saved as paste.csv) read by the server: headers, guesses, a sample, and the upload id. */
  async preview(tableId: number, input: { file: LocalFile; sheet?: number } | { upload: string; sheet: number }): Promise<Sheet> {
    const form = new FormData();
    if ("file" in input) form.append("file", fileForm(input.file));
    else form.append("upload", input.upload);
    if (input.sheet !== undefined) form.append("sheet", String(input.sheet));
    const { data } = await http.post(`${BASE}/tables/${tableId}/imports/preview`, form, multipart);
    return parsePreview(data);
  },

  /** Start the import: the preview's upload, or the CSV file when the phone read it itself. 409: one is already running. */
  async create(tableId: number, input: { upload: string; sheet: number } | { file: LocalFile }, columns: Record<string, unknown>[], opts: { upsertOn: number | null; idempotencyKey: string }): Promise<TableImport> {
    const form = new FormData();
    // The sheet goes with the upload, so the import reads the sheet that was previewed.
    if ("upload" in input) {
      form.append("upload", input.upload);
      form.append("sheet", String(input.sheet));
    } else form.append("file", fileForm(input.file));
    form.append("columns", JSON.stringify(columns));
    if (opts.upsertOn) form.append("upsert_on", String(opts.upsertOn));
    form.append("idempotency_key", opts.idempotencyKey);
    const { data } = await http.post(`${BASE}/tables/${tableId}/imports`, form, multipart);
    return parseImport(obj(data, "import response").import);
  },

  /** The running import, or the last one not closed (the banner's subject). */
  async latest(tableId: number): Promise<TableImport | null> {
    const { data } = await http.get(`${BASE}/tables/${tableId}/imports/latest`);
    const raw = obj(data, "latest response").import;
    return raw ? parseImport(raw) : null;
  },

  async show(importId: number): Promise<TableImport> {
    const { data } = await http.get(`${BASE}/imports/${importId}`);
    return parseImport(obj(data, "import response").import);
  },

  /** Stops after the current batch; the rows already in stay. */
  async cancel(importId: number): Promise<TableImport> {
    const { data } = await http.post(`${BASE}/imports/${importId}/cancel`);
    return parseImport(obj(data, "import response").import);
  },

  /** The banner closed, here and on every device. */
  async dismiss(importId: number): Promise<TableImport> {
    const { data } = await http.post(`${BASE}/imports/${importId}/dismiss`);
    return parseImport(obj(data, "import response").import);
  },
};
