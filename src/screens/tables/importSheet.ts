/**
 * AN IMPORT'S SHEET, whatever it came from (increment 7): a paste or a CSV
 * read on the phone, or a spreadsheet read by the server's preview
 * (`POST tables/:id/imports/preview`, multi-magic-83's draft contract of
 * 2026-11-21). Both become one `Sheet`, so the mapping screen does not care.
 *
 * The guesses are the web's `importGuess.ts`, rule for rule; the server runs
 * the same rules over the whole file, which is why its refusal counts win
 * when it answers.
 */
import type { FieldDefinition } from "@/api/fields";
import { REFUSAL_KEYS, type ColumnGuess, type ImportType, type Sheet } from "@/api/tableImports";
import { looksLikeHeader } from "./importGrid";

export { IMPORT_TYPES, REFUSAL_KEYS, type ColumnGuess, type ImportType, type RefusalKey, type Sheet } from "@/api/tableImports";

const NUMBER = /^-?\d{1,15}([.,]\d+)?$/;
const DATE = /^(\d{4}-\d{2}-\d{2}([T ].*)?|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})$/;
const PHONE = /^\+?[\d\s().-]{8,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const BOOL = /^(true|false|yes|no|oui|non|vrai|faux|x|✓|✔|0|1)$/i;
/** Every value must fit (empty ones aside): a typed column refuses what does not, and text keeps everything. */
const MOSTLY = 1;
const MAX_SELECT_OPTIONS = 12;

/** The server's own words for yes and no (`TableApp::Cell`). */
const TRUE_WORDS = ["true", "1", "yes", "y", "oui", "x", "vrai", "✓", "✔"];
const FALSE_WORDS = ["false", "0", "no", "n", "non", "faux"];

/** A day the server can read: an Excel day number, 15/10/2026 (day first) or ISO. */
function readsAsDate(v: string): boolean {
  if (/^\d{5}(\.\d+)?$/.test(v)) return true;
  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!dmy && !/^\d{4}-\d{2}-\d{2}/.test(v)) return false;
  const [y, m, d] = dmy ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])] : v.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Whether the import accepts this value for this type: the server's `TableApp::Cell` rules. Empty always fits. */
export function fitsType(type: string, raw: string): boolean {
  const v = raw.trim();
  if (v === "") return true;
  switch (type) {
    case "decimal":
    case "integer":
      return /^-?\d+(\.\d+)?$/.test(v.replace(/[\s ]/g, "").replace(/,/g, "."));
    case "boolean":
      return TRUE_WORDS.includes(v.toLowerCase()) || FALSE_WORDS.includes(v.toLowerCase());
    case "date":
      return readsAsDate(v);
    default:
      return true;
  }
}

export function guessColumn(values: string[]): ColumnGuess {
  const filled = values.map((v) => v.trim()).filter((v) => v !== "");
  const fillRate = values.length ? filled.length / values.length : 0;
  const samples = [...new Set(filled)].slice(0, 3);
  const share = (re: RegExp) => (filled.length ? filled.filter((v) => re.test(v)).length / filled.length : 0);
  const counts = new Map<string, number>();
  filled.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const options = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);

  let type: ImportType = "text";
  if (filled.length === 0) type = "text";
  else if (share(BOOL) >= MOSTLY && counts.size <= 2 && !share(NUMBER)) type = "boolean";
  else if (share(EMAIL) >= MOSTLY) type = "email";
  else if (share(URL_RE) >= MOSTLY) type = "url";
  else if (share(DATE) >= MOSTLY) type = "date";
  else if (share(PHONE) >= MOSTLY && filled.some((v) => v.startsWith("+") || v.replace(/\D/g, "").length >= 9) && share(NUMBER) < MOSTLY) type = "phone";
  else if (share(NUMBER) >= MOSTLY) type = "decimal";
  else if (counts.size <= MAX_SELECT_OPTIONS && filled.length >= 5 && counts.size < filled.length / 2) type = "single_select";
  else if (filled.reduce((n, v) => n + v.length, 0) / filled.length > 80) type = "long_text";

  const refused = Object.fromEntries(
    REFUSAL_KEYS.map((t) => {
      const bad = filled.filter((v) => !fitsType(t, v));
      return [t, { count: bad.length, first: bad[0] ?? null }];
    }),
  ) as ColumnGuess["refused"];
  return { type, fillRate, samples, options: type === "single_select" ? options : [], refused };
}

/** A paste or a CSV read on the phone, as a Sheet. `columnName` names a column with no header ("Column 3"). */
export function sheetFromGrid(rows: string[][], opts: { csv: string; filename: string; tableColumnNames: string[]; columnName: (n: number) => string }): Sheet {
  const header = looksLikeHeader(rows, opts.tableColumnNames);
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const head = header ? rows[0] : [];
  const body = header ? rows.slice(1) : rows;
  const unnamed = Array.from({ length: width }, (_, i) => !String(head[i] ?? "").trim());
  const headers = unnamed.map((empty, i) => (empty ? opts.columnName(i + 1) : String(head[i]).trim()));
  return {
    source: { kind: "csv", csv: opts.csv, filename: opts.filename },
    sheets: [{ index: 0, name: opts.filename }],
    sheet: 0,
    headers,
    // A paste without a header line names its columns itself: they are imported, not left out.
    unnamed: header ? unnamed : unnamed.map(() => false),
    rowCount: body.length,
    truncated: false,
    sample: body.slice(0, 5).map((r) => headers.map((_, i) => r[i] ?? "")),
    guesses: headers.map((_, i) => guessColumn(body.map((r) => r[i] ?? ""))),
  };
}

/** "skip", "field:<id>" or "new:<type>", one per sheet column. */
export type Target = "skip" | `field:${number}` | `new:${ImportType}`;
/** Mostly empty columns start as "don't import". */
export const SKIP_BELOW = 0.05;

/** The web's `defaultTarget`: a column whose header names a table column goes there; else a new column of the guessed type, unless it is unnamed, mostly empty, or the person cannot add columns. */
export function defaultTarget(sheet: Sheet, i: number, fields: FieldDefinition[], canManage: boolean): Target {
  const name = sheet.headers[i].toLowerCase();
  const match = !sheet.unnamed[i] && name ? fields.find((f) => f.name.trim().toLowerCase() === name && f.fieldType !== "multi_record") : undefined;
  if (match) return `field:${match.id}`;
  if (sheet.unnamed[i] || !canManage || sheet.guesses[i].fillRate < SKIP_BELOW) return "skip";
  return `new:${sheet.guesses[i].type}`;
}

/** What `imports#create` takes per sheet column, in the server's names. */
export function importColumns(sheet: Sheet, targets: Target[]): Record<string, unknown>[] {
  return targets.map((target, i) => {
    if (target.startsWith("field:")) return { field_id: Number(target.slice(6)) };
    if (target.startsWith("new:")) {
      const type = target.slice(4) as ImportType;
      return { new_field_name: sheet.headers[i], new_field_type: type, ...(type === "single_select" ? { options: sheet.guesses[i].options } : {}) };
    }
    return {};
  });
}
