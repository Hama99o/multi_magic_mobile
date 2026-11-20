/**
 * The filter and sort vocabulary (increment 3), the web's
 * (`pages/table_app/filters.ts`), which is the server's
 * (`TableApp::RecordQuery::OPERATORS`) minus what a person never needs
 * spelled out. Pure: every rule here is a test, not a screen.
 */
import type { FieldDefinition } from "@/api/fields";
import type { FilterCondition, SortRule } from "@/api/tables";

export type FieldKind = "text" | "number" | "date" | "datetime" | "boolean" | "single_select" | "multi_select" | "attachments" | "link" | "lookup";

const TEXT = ["text", "long_text", "phone", "email", "url", "rich_text"];

export function kindOf(field: FieldDefinition): FieldKind {
  const t = field.fieldType;
  if (TEXT.includes(t)) return "text";
  if (t === "decimal" || t === "integer" || t === "rollup") return "number";
  if (t === "date") return "date";
  if (t === "datetime" || t === "created_time" || t === "last_modified_time") return "datetime";
  if (t === "boolean") return "boolean";
  if (t === "single_select") return "single_select";
  if (t === "multi_select") return "multi_select";
  if (t === "attachments" || t === "attachment") return "attachments";
  if (t === "lookup") return "lookup";
  return "link";
}

export const OPERATORS: Record<FieldKind, readonly string[]> = {
  text: ["contains", "not_contains", "is", "is_not", "empty", "not_empty"],
  number: ["is", "is_not", "gt", "gte", "lt", "lte", "empty", "not_empty"],
  date: ["is", "before", "after", "on_or_before", "on_or_after", "empty", "not_empty"],
  boolean: ["is"],
  single_select: ["any_of", "is_not", "empty", "not_empty"],
  multi_select: ["any_of", "all_of", "none_of", "empty", "not_empty"],
  datetime: ["is", "before", "after", "on_or_before", "on_or_after"],
  attachments: ["empty", "not_empty"],
  link: ["not_empty", "empty"],
  lookup: ["contains", "not_contains", "empty", "not_empty"],
};

/** Every operator any kind uses: what the i18n has words for (`tables.ops.*`). */
export const ALL_OPERATORS = [...new Set(Object.values(OPERATORS).flat())];

/** Operators that take no value. */
export const VALUELESS = ["empty", "not_empty"];

export const takesValue = (op: string) => !VALUELESS.includes(op);

/** A new condition on a column: its first operator, and an empty value of the right shape. */
export function defaultCondition(field: FieldDefinition): FilterCondition {
  const kind = kindOf(field);
  const op = OPERATORS[kind][0];
  const many = kind === "single_select" || kind === "multi_select";
  return { fieldId: field.id, op, value: kind === "boolean" ? true : many ? [] : null };
}

/** A condition still being filled in (no value yet) is left out of the query, as on the web. */
export function isComplete(condition: FilterCondition): boolean {
  if (!takesValue(condition.op)) return true;
  const { value } = condition;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== "";
}

/** Changing a condition's column resets it (an operator of one kind means nothing to another). */
export function retarget(condition: FilterCondition, field: FieldDefinition): FilterCondition {
  return condition.fieldId === field.id ? condition : defaultCondition(field);
}

/** Changing the operator keeps the value when it still fits, and drops it when the new one takes none. */
export function withOperator(condition: FilterCondition, op: string): FilterCondition {
  return { ...condition, op, value: takesValue(op) ? condition.value : null };
}

/** Columns a person can filter on: every one but a type the server cannot compare. */
export const filterable = (fields: FieldDefinition[]) => fields;

/** Columns a sort can use: not a link or a file (the server skips those, `apply_sort`). */
export const sortable = (fields: FieldDefinition[]) => fields.filter((f) => kindOf(f) !== "link" && kindOf(f) !== "attachments");

/** Columns a view can group by: a single select (the web's GroupPicker). */
export const groupable = (fields: FieldDefinition[]) => fields.filter((f) => f.fieldType === "single_select");

/** How a sort direction reads for a column (the web's words): letters, digits, time, the option order. */
export function directionSet(field: FieldDefinition | undefined): "text" | "number" | "date" | "boolean" | "option" {
  if (!field) return "text";
  if (field.fieldType === "phone") return "number";
  const kind = kindOf(field);
  if (kind === "single_select" || kind === "multi_select") return "option";
  if (kind === "datetime" || kind === "date") return "date";
  if (kind === "number" || kind === "boolean") return kind;
  return "text";
}

/** A number typed in the person's language ("1,5" in French) to what the server compares. */
export function parseNumber(typed: string): number | null {
  const cleaned = typed.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** A sort list with one column at most once (adding a column already sorted moves it). */
export function addSort(sorts: SortRule[], fieldId: number): SortRule[] {
  return [...sorts.filter((s) => s.fieldId !== fieldId), { fieldId, direction: "asc" }];
}
