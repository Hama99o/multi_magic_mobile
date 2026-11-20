/**
 * Grouped rows as one flat list of headers and cards (increment 3), so the
 * list keeps FIXED item heights (`getItemLayout`) and a recycled cell never
 * changes size: a header is `GROUP_HEADER` tall, a card the view's card
 * height. The server sends the rows already ordered by group (`group_by`)
 * and each group's size over the whole view (`meta.groups`, first page).
 */
import type { FieldDefinition } from "@/api/fields";
import type { RecordRow } from "@/api/tables";
import { scalar } from "@/components/fields/display";

export const GROUP_HEADER = 44;
/** The key of rows with no value in the grouping column. */
export const NO_VALUE = "";

export type ListItem =
  | { kind: "header"; key: string; label: string | null; color: string | null; count: number | null; folded: boolean }
  | { kind: "row"; row: RecordRow; index: number };

export function groupKey(row: RecordRow, field: FieldDefinition): string {
  const v = scalar(row.values[field.id]);
  return v === null || v === undefined || v === "" ? NO_VALUE : String(v);
}

export function listItems(rows: RecordRow[], field: FieldDefinition | null, counts: Record<string, number> | null, folded: Set<string>): ListItem[] {
  if (!field) return rows.map((row, index) => ({ kind: "row", row, index }));
  const out: ListItem[] = [];
  let current: string | null = null;
  let index = 0;
  for (const row of rows) {
    const key = groupKey(row, field);
    if (key !== current) {
      current = key;
      const option = field.config.options.find((o) => o.value === key);
      out.push({ kind: "header", key, label: key === NO_VALUE ? null : (option?.label ?? key), color: option?.color ?? null, count: counts?.[key] ?? null, folded: folded.has(key) });
    }
    if (!folded.has(key)) out.push({ kind: "row", row, index: index++ });
  }
  return out;
}

/** Offsets for `getItemLayout`: two fixed heights, summed once per list. */
export function layoutOf(items: ListItem[], cardHeight: number): { length: number; offset: number }[] {
  let offset = 0;
  return items.map((item) => {
    const length = item.kind === "header" ? GROUP_HEADER : cardHeight;
    const at = { length, offset };
    offset += length;
    return at;
  });
}
