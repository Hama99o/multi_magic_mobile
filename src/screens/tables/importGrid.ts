/**
 * WHAT A PASTE OR A CSV HOLDS (increment 7; the web's `clipboard.ts` and
 * `pasteImport.ts`, rule for rule): rows of cells, then the CSV the import
 * job reads. Pure, tested.
 *   - Tabs mean Excel or Google Sheets (their quoting, CRLF).
 *   - Text without tabs whose lines share a comma or semicolon count is CSV.
 *     The web reads that with SheetJS; the phone has no spreadsheet library
 *     (Hello, 2026-11-21), so `splitCsv` reads it, quotes and doubled quotes
 *     included.
 *   - Anything else is a list, one value a line (WhatsApp bullets dropped).
 */

/** Clipboard text (TSV) → rows of cells, Excel's quoting understood. */
export function parseClipboard(text: string): string[][] {
  return stripBullets(splitDelimited(text, "\t"));
}

/** A CSV text → rows of cells, with this separator and RFC 4180 quoting. */
export function splitCsv(text: string, sep: "," | ";"): string[][] {
  return splitDelimited(text, sep);
}

function splitDelimited(text: string, sep: string): string[][] {
  const source = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let atCellStart = true;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
    } else if (ch === sep) {
      row.push(cell);
      cell = "";
      atCellStart = true;
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atCellStart = true;
    } else {
      cell += ch;
      atCellStart = false;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r, i) => !(i === rows.length - 1 && r.length === 1 && r[0] === ""));
}

// "- Ahmad", "• Ahmad", "1. Ahmad", "2) Ahmad": a list typed in WhatsApp.
// Only when every line of a one-column paste has one: "-5" alone is a number.
const BULLET = /^\s*(?:[-–•*]|\d{1,3}[.)])\s+/;

function stripBullets(rows: string[][]): string[][] {
  const single = rows.length > 1 && rows.every((r) => r.length === 1);
  if (!single || !rows.every((r) => BULLET.test(r[0]))) return rows;
  return rows.map((r) => [r[0].replace(BULLET, "")]);
}

/** "," or ";" when every non-empty line has the same number of them (at least one), else null. */
export function csvSeparator(text: string): "," | ";" | null {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  for (const sep of [";", ","] as const) {
    const counts = lines.map((l) => outsideQuotes(l, sep));
    if (counts[0] > 0 && counts.every((c) => c === counts[0])) return sep;
  }
  return null;
}

/** How many times `sep` appears outside "quoted" parts: "Kabul, centre" is one cell. */
function outsideQuotes(line: string, sep: string): number {
  let quoted = false;
  let count = 0;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) count++;
  }
  return count;
}

const trimRows = (rows: string[][]) => rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));

/** Pasted text, or a CSV file's text, as rows of trimmed cells; blank rows dropped. */
export function pastedGrid(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\s+$/, "");
  if (!clean.trim()) return [];
  if (clean.includes("\t")) return trimRows(parseClipboard(clean));
  const sep = csvSeparator(clean);
  if (sep) return trimRows(splitCsv(clean, sep));
  // A list: blank lines dropped first, or one of them stops the bullets being recognised.
  return trimRows(parseClipboard(clean.split("\n").filter((l) => l.trim() !== "").join("\n")));
}

/**
 * Whether the first line looks like column names: every cell filled, none a
 * number or a date, all different ("Nom | Ville | Prix", not "Ahmad | Kabul | 12").
 * A single column cannot tell "Nom" from "Ahmad": there the first line is a
 * name only when it is one of the table's columns.
 */
export function looksLikeHeader(rows: string[][], columnNames: string[] = []): boolean {
  const [first, ...rest] = rows;
  if (!first?.length || rest.length === 0) return false;
  if (first.length === 1) return columnNames.some((n) => n.trim().toLowerCase() === first[0].toLowerCase());
  const numeric = /^-?[\d\s.,/:-]+$/;
  return first.every((c) => c !== "" && !numeric.test(c)) && new Set(first.map((c) => c.toLowerCase())).size === first.length;
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The CSV text the import reads. Without a header line the columns are named ("Column 1"…), so they are imported. */
export function toCsv(rows: string[][], firstRowNames: boolean, columnName: (n: number) => string): string {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const body = firstRowNames ? rows : [Array.from({ length: width }, (_, i) => columnName(i + 1)), ...rows];
  return `${body.map((r) => Array.from({ length: width }, (_, i) => csvCell(r[i] ?? "")).join(",")).join("\n")}\n`;
}
