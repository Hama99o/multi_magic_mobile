/**
 * THE COLUMN EDITOR'S RULES (increment 6c), pure so each is a test. Ported
 * from the web's `FieldEditor.tsx`, `defaultValue.ts` and
 * `types/table_app.ts`, rule for rule, so a column made on the phone is the
 * column the web would make:
 *   - the types a table column can be, and those a TITLE column cannot;
 *   - lookup / rollup need a link column, and a target except a rollup's count;
 *   - a select needs one named option;
 *   - a link needs its table, and says its relation (four kinds);
 *   - a default only for the types the server keeps one for, sent as labels
 *     (an option added in this same edit has no value yet).
 * `fieldBody` builds exactly what `fields#create` / `fields#update` permit.
 */
import type { FieldDefinition } from "@/api/fields";
import { OPTION_PALETTE } from "./palette";

export const TABLE_FIELD_TYPES = ["text", "long_text", "decimal", "phone", "email", "url", "single_select", "multi_select", "date", "boolean", "created_time", "last_modified_time", "attachments", "multi_record", "lookup", "rollup"] as const;
export type TableFieldType = (typeof TABLE_FIELD_TYPES)[number];

export const ROLLUP_FUNCTIONS = ["count", "sum", "avg", "min", "max"] as const;
export type RollupFunction = (typeof ROLLUP_FUNCTIONS)[number];

export const RELATIONS = ["one_to_many", "many_to_one", "one_to_one", "many_to_many"] as const;
export type Relation = (typeof RELATIONS)[number];

/** `TableApp::Defaults::TYPES`. */
const DEFAULT_TYPES: readonly TableFieldType[] = ["text", "long_text", "decimal", "phone", "email", "url", "single_select", "multi_select", "date", "boolean"];
/** A row's title cannot be one of these (the web's `NON_TITLE`). */
const NON_TITLE: readonly TableFieldType[] = ["multi_record", "created_time", "last_modified_time", "attachments", "lookup", "rollup"];

export type OptionDraft = { key: string; value?: string; label: string; color: string };
/** Text or a number as typed; the chosen option key(s); ticked; '' / 'today' / 'YYYY-MM-DD'. */
export type DefaultDraft = string | string[] | boolean;

export interface FieldDraft {
  name: string;
  description: string;
  type: TableFieldType;
  options: OptionDraft[];
  defaultValue: DefaultDraft;
  linkTableId: number | null;
  relation: Relation;
  linkFieldId: number | null;
  targetFieldId: number | null;
  rollup: RollupFunction;
}

export const canHaveDefault = (type: TableFieldType) => DEFAULT_TYPES.includes(type);
export const isComputed = (type: TableFieldType) => type === "lookup" || type === "rollup";
export const needsTarget = (type: TableFieldType, rollup: RollupFunction) => type === "lookup" || (type === "rollup" && rollup !== "count");

export function emptyDefault(type: TableFieldType): DefaultDraft {
  if (type === "multi_select") return [];
  if (type === "boolean") return false;
  return "";
}

/** The types offered: no NON_TITLE type for the title column; a lookup or rollup only with a link column to read through (or when it already is one). */
export function typesFor(opts: { isPrimary: boolean; hasLinkColumn: boolean; current: TableFieldType | null }): TableFieldType[] {
  return TABLE_FIELD_TYPES.filter((ft) => !(opts.isPrimary && NON_TITLE.includes(ft)) && !(isComputed(ft) && !opts.hasLinkColumn && opts.current !== ft));
}

/** A lookup shows any plain column of the linked table; a rollup adds up a number column. */
export function targetsFor(type: TableFieldType, linkedFields: FieldDefinition[]): FieldDefinition[] {
  return linkedFields.filter((f) => (type === "rollup" ? f.fieldType === "decimal" : !["multi_record", "lookup", "rollup", "attachments"].includes(f.fieldType)));
}

let nextKey = 0;
/** A new option: an unused colour from the palette, a key that stays put while it is edited. */
export function newOption(existing: OptionDraft[]): OptionDraft {
  const used = new Set(existing.map((o) => o.color));
  const color = OPTION_PALETTE.find((c) => !used.has(c)) ?? OPTION_PALETTE[existing.length % OPTION_PALETTE.length];
  nextKey += 1;
  return { key: `new-${nextKey}`, label: "", color };
}

/** The next colour in the palette (a tap on an option's dot, as the web cycles it). */
export const cycleColor = (color: string) => OPTION_PALETTE[(OPTION_PALETTE.indexOf(color as (typeof OPTION_PALETTE)[number]) + 1) % OPTION_PALETTE.length];

/** An option moved one place. */
export function moveOption(options: OptionDraft[], index: number, by: -1 | 1): OptionDraft[] {
  const to = index + by;
  if (to < 0 || to >= options.length) return options;
  const next = [...options];
  const [o] = next.splice(index, 1);
  next.splice(to, 0, o);
  return next;
}

const raw = (f: FieldDefinition | null) => (f?.config.raw ?? {}) as Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

/** The column as a draft (a new one when `field` is null). `relation` is the table's map for its link columns. */
export function draftFrom(field: FieldDefinition | null, relation: Relation | null): FieldDraft {
  const type = ((field && (TABLE_FIELD_TYPES as readonly string[]).includes(field.fieldType) ? field.fieldType : "text") as TableFieldType);
  const r = raw(field);
  const options: OptionDraft[] = (field?.config.options ?? []).map((o) => ({ key: o.value, value: o.value, label: o.label, color: o.color && (OPTION_PALETTE as readonly string[]).includes(o.color) ? o.color : OPTION_PALETTE[0] }));
  const stored = field ? r.default : undefined;
  let defaultValue: DefaultDraft = emptyDefault(type);
  if (stored !== null && stored !== undefined && canHaveDefault(type)) {
    if (type === "multi_select") defaultValue = (Array.isArray(stored) ? stored : [stored]).map(String);
    else if (type === "boolean") defaultValue = stored === true;
    else defaultValue = String(stored);
  }
  return {
    name: field?.name ?? "",
    description: typeof r.description === "string" ? r.description : "",
    type,
    options,
    defaultValue,
    linkTableId: num(r.table_id),
    relation: relation ?? "many_to_many",
    linkFieldId: num(r.link_field_id),
    targetFieldId: num(r.target_field_id),
    rollup: (ROLLUP_FUNCTIONS as readonly string[]).includes(String(r.function)) ? (r.function as RollupFunction) : "count",
  };
}

/** What the server takes as `default_value`, or undefined when the type keeps none (then nothing is sent). */
export function defaultPayload(type: TableFieldType, draft: DefaultDraft, options: OptionDraft[]): string | string[] | true | null | undefined {
  if (!canHaveDefault(type)) return undefined;
  const label = (key: string) => options.find((o) => o.key === key)?.label.trim() || null;
  if (type === "single_select") return typeof draft === "string" && draft ? label(draft) : null;
  if (type === "multi_select") {
    const labels = (Array.isArray(draft) ? draft : []).map(label).filter((l): l is string => Boolean(l));
    return labels.length ? labels : null;
  }
  if (type === "boolean") return draft === true ? true : null;
  return typeof draft === "string" && draft.trim() ? draft.trim() : null;
}

/** Why Save is off, or null when the draft can be saved (the web's `canSave`). */
export function blockedBy(draft: FieldDraft, targets: FieldDefinition[]): "name" | "options" | "linkTable" | "linkColumn" | "target" | null {
  if (!draft.name.trim()) return "name";
  if ((draft.type === "single_select" || draft.type === "multi_select") && !draft.options.some((o) => o.label.trim())) return "options";
  if (draft.type === "multi_record" && !draft.linkTableId) return "linkTable";
  if (isComputed(draft.type)) {
    if (!draft.linkFieldId) return "linkColumn";
    if (needsTarget(draft.type, draft.rollup) && !targets.some((f) => f.id === draft.targetFieldId)) return "target";
  }
  return null;
}

/**
 * The body for `fields#create` / `fields#update`, in the server's names. On an
 * update the type, and a link's relation, are sent only when they change, as
 * the web does (a type change converts the cells, so it is never sent by accident).
 */
export function fieldBody(draft: FieldDraft, existing: { type: TableFieldType; relation: Relation | null } | null): { field: Record<string, unknown> } {
  const field: Record<string, unknown> = { name: draft.name.trim(), description: draft.description.trim() };
  if (!existing || existing.type !== draft.type) field.field_type = draft.type;
  if (draft.type === "single_select" || draft.type === "multi_select") {
    field.options = draft.options.filter((o) => o.label.trim()).map((o) => ({ ...(o.value ? { value: o.value } : {}), label: o.label.trim(), color: o.color }));
  }
  const def = defaultPayload(draft.type, draft.defaultValue, draft.options);
  if (def !== undefined) field.default_value = def;
  if (isComputed(draft.type)) {
    field.link_field_id = draft.linkFieldId;
    field.target_field_id = needsTarget(draft.type, draft.rollup) ? draft.targetFieldId : null;
    if (draft.type === "rollup") field.function = draft.rollup;
  }
  if (draft.type === "multi_record") {
    field.link_table_id = draft.linkTableId;
    if (!existing || existing.type !== "multi_record" || draft.relation !== existing.relation) field.relation = draft.relation;
  }
  return { field };
}
