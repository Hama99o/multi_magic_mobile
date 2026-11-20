/**
 * Kanban and Calendar, as rules (increment 4, SPEC C6). Pure, so each one is
 * a test.
 *
 * Kanban: one column per option of a single select (the view's
 * `kanban_field_id`), in the option order, then "Empty" (the web's
 * `KanbanBoard.tsx:39-45`); a column's count is the server's over the whole
 * view (`meta.groups`).
 *
 * Calendar: the rows whose date column (`calendar_field_id`) falls in the
 * month on screen, asked for by a date range (the web fetches the visible
 * weeks only, `TableScreen.tsx:221-231`), and the rows with no date apart.
 */
import type { FieldDefinition } from "@/api/fields";
import type { FilterCondition, RecordRow } from "@/api/tables";
import { scalar } from "@/components/fields/display";
import { addDays, startOfMonth } from "@/screens/calendar/dates";

export const EMPTY_COLUMN = "";

export interface KanbanColumn {
  key: string;
  label: string | null;
  color: string | null;
  rows: RecordRow[];
  /** The server's count over the whole view; null until the first page says. */
  count: number | null;
}

export function kanbanColumns(field: FieldDefinition, rows: RecordRow[], counts: Record<string, number> | null): KanbanColumn[] {
  const columns: KanbanColumn[] = [
    ...field.config.options.map((o) => ({ key: o.value, label: o.label, color: o.color, rows: [] as RecordRow[], count: counts ? (counts[o.value] ?? 0) : null })),
    { key: EMPTY_COLUMN, label: null, color: null, rows: [], count: counts ? (counts[EMPTY_COLUMN] ?? 0) : null },
  ];
  const byKey = new Map(columns.map((c) => [c.key, c]));
  for (const row of rows) {
    const v = scalar(row.values[field.id]);
    const key = v === null || v === undefined || v === "" ? EMPTY_COLUMN : String(v);
    // A value no option has any more lands in Empty rather than vanishing.
    (byKey.get(key) ?? byKey.get(EMPTY_COLUMN))!.rows.push(row);
  }
  return columns;
}

/** The value a row takes when it moves to a column: the option, or none. */
export const columnValue = (key: string) => (key === EMPTY_COLUMN ? null : key);

/** The first and last day of the month on screen. */
export function monthRange(month: string): { from: string; to: string } {
  const from = startOfMonth(month);
  const next = startOfMonth(addDays(from, 31));
  return { from, to: addDays(next, -1) };
}

/** The month's conditions on the date column, added to the person's own (AND). */
export function monthFilters(fieldId: number, month: string): FilterCondition[] {
  const { from, to } = monthRange(month);
  return [
    { fieldId, op: "on_or_after", value: from },
    { fieldId, op: "on_or_before", value: to },
  ];
}

/** The day a row falls on (a datetime's day as stored), or null for none. */
export function dayOf(row: RecordRow, field: FieldDefinition): string | null {
  const v = scalar(row.values[field.id]);
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

export function rowsByDay(rows: RecordRow[], field: FieldDefinition): Map<string, RecordRow[]> {
  const out = new Map<string, RecordRow[]>();
  for (const row of rows) {
    const day = dayOf(row, field);
    if (!day) continue;
    out.set(day, [...(out.get(day) ?? []), row]);
  }
  return out;
}

/** Columns a kanban can use: single selects. Columns a calendar can use: dates. */
export const kanbanable = (fields: FieldDefinition[]) => fields.filter((f) => f.fieldType === "single_select");
export const calendarable = (fields: FieldDefinition[]) => fields.filter((f) => f.fieldType === "date" || f.fieldType === "datetime" || f.fieldType === "created_time");

/** The columns a new view of this type can be built on (the web's ViewSwitcher): none for a grid; a gallery's cover is optional. */
export function viewColumnChoices(viewType: "grid" | "kanban" | "calendar" | "gallery", fields: FieldDefinition[]): FieldDefinition[] {
  if (viewType === "kanban") return kanbanable(fields);
  if (viewType === "calendar") return calendarable(fields);
  if (viewType === "gallery") return fields.filter((f) => f.fieldType === "attachments" || f.fieldType === "attachment");
  return [];
}

/** A kanban needs its select and a calendar its date before it can be made; a grid and a gallery are ready with a name. */
export const newViewReady = (viewType: "grid" | "kanban" | "calendar" | "gallery", columnId: number | null) => (viewType !== "kanban" && viewType !== "calendar") || columnId !== null;
