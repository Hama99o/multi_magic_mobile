/**
 * A CSV or TSV, read for the phone's sheet preview (parity audit #46; the web
 * previews spreadsheets with `ExcelPreview`). RFC 4180: quoted fields may
 * hold the separator, doubled quotes and line breaks. The separator is a tab
 * for .tsv, otherwise whichever of , ; or tab the first line uses most (a
 * French Excel writes ;). A preview, not an editor: capped at MAX_ROWS by
 * MAX_COLUMNS, and it says so. An .xlsx is not read on the phone (that needs
 * a parser this app does not ship); it opens in the system viewer.
 */
export const MAX_ROWS = 200;
export const MAX_COLUMNS = 20;

function separatorFor(text: string, name: string): string {
  if (/\.tsv$/i.test(name)) return "\t";
  const firstLine = text.slice(0, Math.max(0, text.indexOf("\n")) || text.length);
  const counts = [",", ";", "\t"].map((sep) => ({ sep, n: firstLine.split(sep).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].sep : ",";
}

export function parseDelimited(text: string, name: string): { rows: string[][]; truncated: boolean } {
  const sep = separatorFor(text, name);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let truncated = false;
  const endRow = () => {
    row.push(field);
    field = "";
    if (row.length > MAX_COLUMNS) {
      truncated = true;
      row = row.slice(0, MAX_COLUMNS);
    }
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\r" && text[i + 1] === "\n") continue;
    else if (c === "\n" || c === "\r") {
      endRow();
      if (rows.length >= MAX_ROWS) {
        truncated = i < text.length - 1;
        return { rows, truncated };
      }
    } else field += c;
  }
  if (field !== "" || row.length) endRow();
  return { rows: rows.slice(0, MAX_ROWS), truncated: truncated || rows.length > MAX_ROWS };
}
