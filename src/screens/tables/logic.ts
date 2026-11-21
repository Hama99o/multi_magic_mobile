/**
 * Tables' pure rules (no React): what a screen decides, kept testable.
 */
import type { FieldDefinition } from "@/api/fields";
import type { Base, BaseRole, RecordRow, RecordsPage, RowHeight, Table } from "@/api/tables";
import { colorHex } from "@/screens/flow/logic";
import { APP_COLORS } from "@/theme/appColors";

export const TABLES_COLOR = APP_COLORS.tables;

/** A base's colour as a hex (the web stores hexes from its option palette). */
export const baseColor = (color: string | null | undefined) => colorHex(color) ?? TABLES_COLOR;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Search across the bases: the base's name, its description, and its tables' names, accent-blind. */
export function baseMatches(base: Base, term: string): boolean {
  const q = fold(term.trim());
  if (!q) return true;
  return [base.name, base.description ?? "", ...base.tables.map((t) => t.name)].some((s) => fold(s).includes(q));
}

/** Rows from every loaded page, the first copy of each id only: offset pages shift when someone adds a row (parity gap 3). */
export function mergePages(pages: RecordsPage[]): RecordRow[] {
  const seen = new Set<number>();
  const out: RecordRow[] = [];
  for (const page of pages) {
    for (const row of page.rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/** "1,204 rows", or "42 of 1,204" when the view or the person narrows it. */
export function countLine(first: RecordsPage | undefined, t: (k: string, o?: Record<string, unknown>) => string, language: string): string | null {
  if (!first || first.totalCount === null) return null;
  const n = (v: number) => v.toLocaleString(language);
  if (first.tableTotal !== null && first.totalCount !== first.tableTotal) return t("tables.rowsOf", { shown: n(first.totalCount), total: n(first.tableTotal) });
  return t("tables.rowCount", { count: first.totalCount, formatted: n(first.totalCount) });
}

/** The title column: the table's primary field, else its first. */
export function titleField(table: Table): FieldDefinition | null {
  return table.fields.find((f) => f.id === table.primaryFieldId) ?? table.fields[0] ?? null;
}

/** Fields under a card's title, from the view's row height (the web's short → extra), at most `CARD_FIELDS`. */
export const CARD_LINES: Record<RowHeight, number> = { short: 1, medium: 2, tall: 3, extra: 3 };

/** The position "3 / 25" of a row among the loaded ones; null when it is not among them. */
export function positionOf(rows: RecordRow[], recordId: number): { index: number; total: number } | null {
  const index = rows.findIndex((r) => r.id === recordId);
  return index === -1 ? null : { index, total: rows.length };
}

/** Who may add, change and delete rows: the owner and editors (`TableApp::BasePolicy#edit_records?`). Unknown = no. */
export const canEditRows = (role: BaseRole | undefined) => role === "owner" || role === "editor";

/**
 * Did the server really sort newest first? (Hello, 2026-11-20, after a device
 * pass against an older server that ignored `sort=-created_at` while the chip
 * said "Newest first".) Proven only by the page itself: at least two rows, and
 * none created after the one above it. Anything less and the screen claims
 * nothing.
 */
export function newestProven(rows: RecordRow[], groupOf?: (row: RecordRow) => string): boolean {
  if (!groupOf) {
    if (rows.length < 2) return false;
    for (let i = 1; i < rows.length; i++) if (rows[i].createdAt > rows[i - 1].createdAt) return false;
    return rows[0].createdAt > rows[rows.length - 1].createdAt;
  }
  // A board or a grouped list comes sorted by group first, newest first WITHIN each group, so
  // that is where the proof is read (qa_phone, 2026-11-21: across columns it never held, the chip
  // hid on every board, and Table order, which a card's Move up needs, could not be reached).
  const groups = new Map<string, RecordRow[]>();
  for (const row of rows) {
    const key = groupOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  let shown = false;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (!newestProven(group)) return false;
    shown = true;
  }
  return shown;
}

/**
 * Type-the-name before a delete (the owner, 2026-11-20): the text must be the
 * name EXACTLY. No trim, no case-folding, no accent-folding; an empty name
 * never matches. Stricter than the server's own base check, which trims.
 */
export function nameMatches(typed: string, name: string): boolean {
  return name.length > 0 && typed === name;
}
