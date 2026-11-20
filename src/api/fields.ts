/**
 * CUSTOM FIELDS: the `core/*` field system Flow and Tables share
 * (`docs/design/flow/SPEC.md` §F).
 *
 * The server keeps one model for both apps: a `Core::FieldDefinition` belongs
 * to an owner (a `FlowApp::Project` today, a `TableApp::Table` tomorrow) and
 * a value belongs to a record (`FlowApp::Card`, `TableApp::Record`). So this
 * file names no app. It is the boundary for every call the web's
 * `components/core/*` and `core.api.ts` make, read 2026-11-20 at multi_magic
 * 0041bc0b:
 *
 * - scalars (text, numbers, dates, selects) go in ONE batch PATCH
 *   (`core/field_values#batch_update`), keyed by definition id;
 * - record links (users, labels, cards, sprints) are one selection each,
 *   created and deleted (`core/field_record_selections`); a single-record
 *   field's create REPLACES the old one on the server;
 * - files are multipart uploads (`core/field_attachments`);
 * - a picker's choices come from `core/record_options`, 20 a page.
 *
 * Bodies use the SERVER's names: nothing in this app converts case.
 */
import { absoluteUrl } from "./conversations";
import { http } from "./http";
import { ApiShapeError, arr, id, obj, optStr, readable, readableRows, str } from "./parse";

const CORE = "/api/v1/core";

/** The 13 types a person can create (the web's `ProjectFields.tsx` FIELD_TYPES), in the web's order. */
export const EDITABLE_FIELD_TYPES = [
  "text",
  "rich_text",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "single_select",
  "multi_select",
  "single_record",
  "multi_record",
  "attachment",
  "attachments",
] as const;

/**
 * Every type the server knows (`Core::FieldDefinition::FIELD_TYPES`). The four
 * text variants arrive from Tables and from the API; the last four are
 * computed by the server and are shown, never edited.
 */
export const FIELD_TYPES = [
  ...EDITABLE_FIELD_TYPES,
  "long_text",
  "phone",
  "email",
  "url",
  "created_time",
  "last_modified_time",
  "lookup",
  "rollup",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const RECORD_CLASSES = ["User", "Core::Tag", "FlowApp::Card", "FlowApp::Sprint", "TableApp::Record"] as const;
export type RecordClass = (typeof RECORD_CLASSES)[number];

const SCALAR_TYPES: readonly FieldType[] = ["text", "rich_text", "integer", "decimal", "boolean", "date", "datetime", "single_select", "multi_select", "long_text", "phone", "email", "url"];
const RECORD_TYPES: readonly FieldType[] = ["single_record", "multi_record"];
const ATTACHMENT_TYPES: readonly FieldType[] = ["attachment", "attachments"];
const READ_ONLY_TYPES: readonly FieldType[] = ["created_time", "last_modified_time", "lookup", "rollup"];

export const isScalarType = (t: FieldType) => SCALAR_TYPES.includes(t);
export const isRecordType = (t: FieldType) => RECORD_TYPES.includes(t);
export const isAttachmentType = (t: FieldType) => ATTACHMENT_TYPES.includes(t);
export const isReadOnlyType = (t: FieldType) => READ_ONLY_TYPES.includes(t);
export const isSelectType = (t: FieldType) => t === "single_select" || t === "multi_select";

export interface SelectOption {
  value: string;
  label: string;
  color: string | null;
}

export interface FieldConfig {
  options: SelectOption[];
  min: number | null;
  max: number | null;
  /** A labels field lets anybody on the board add a label (`TagPolicy#allow_create_enabled?`). */
  allowCreate: boolean;
  /** `"project_members"`: a user field offers the board's people only. */
  scope: string | null;
  /** Everything the server sent, so an update never drops a key this app does not read. */
  raw: Record<string, unknown>;
}

export interface FieldDefinition {
  id: number;
  name: string;
  key: string;
  fieldType: FieldType;
  recordClass: RecordClass | null;
  tagCategoryId: number | null;
  position: number;
  required: boolean;
  config: FieldConfig;
  ownerType: string;
  ownerId: number;
}

export interface Selection {
  /** The selection row's own id: what a removal deletes. */
  selectionId: number;
  /** The linked record (a user, a tag, a card, a sprint). */
  recordId: number;
  recordType: string;
}

export interface FieldFile {
  id: number;
  filename: string;
  contentType: string | null;
  byteSize: number;
  /** Absolute, ready for `<Image>` or the browser. */
  url: string | null;
}

/** One field's value on one record, by the definition's kind. */
export type FieldValue =
  | { kind: "scalar"; value: unknown }
  | { kind: "records"; selections: Selection[] }
  | { kind: "files"; files: FieldFile[] };

/** Every field's value on one record, by definition id. */
export type FieldValues = Record<number, FieldValue>;

/** The record a value belongs to (`record_type` + `record_id` on every write). */
export interface FieldRecord {
  type: string;
  id: number;
}

export interface RecordOption {
  id: number;
  label: string;
  color: string | null;
}

export interface RecordOptionsPage {
  options: RecordOption[];
  page: number;
  pages: number;
}

export interface Tag {
  id: number;
  label: string;
  color: string | null;
  position: number;
  categoryId: number;
}

export interface TagCategory {
  id: number;
  name: string;
  tags: Tag[];
}

export interface DefinitionInput {
  name?: string;
  fieldType?: FieldType;
  recordClass?: RecordClass | null;
  tagCategoryId?: number | null;
  required?: boolean;
  config?: Record<string, unknown>;
  position?: number;
}

const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function parseOption(raw: unknown): SelectOption {
  const o = obj(raw, "option");
  const value = typeof o.value === "string" ? o.value : typeof o.value === "number" ? String(o.value) : str(o.value, "option.value");
  return { value, label: optStr(o.label) || value, color: optStr(o.color) };
}

export function parseConfig(raw: unknown): FieldConfig {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    options: Array.isArray(c.options) ? readable(c.options, parseOption) : [],
    min: numOrNull(c.min),
    max: numOrNull(c.max),
    allowCreate: c.allow_create === true || c.allow_create === "true",
    scope: optStr(c.scope),
    raw: c,
  };
}

export function parseDefinition(raw: unknown): FieldDefinition {
  const d = obj(raw, "field_definition");
  const fieldType = oneOf(d.field_type, FIELD_TYPES);
  if (!fieldType) throw new ApiShapeError("field_definition.field_type", d.field_type);
  return {
    id: id(d.id, "field_definition.id"),
    name: str(d.name, "field_definition.name"),
    key: optStr(d.key) ?? "",
    fieldType,
    recordClass: oneOf(d.record_class, RECORD_CLASSES),
    tagCategoryId: typeof d.core_tag_category_id === "number" ? d.core_tag_category_id : null,
    position: typeof d.position === "number" ? d.position : 0,
    required: d.required === true,
    config: parseConfig(d.config),
    ownerType: optStr(d.owner_type) ?? "",
    ownerId: typeof d.owner_id === "number" ? d.owner_id : 0,
  };
}

/** A list of definitions: one the app cannot read (an unknown type) is left out, not fatal. */
export function parseDefinitions(items: unknown[]): FieldDefinition[] {
  const out: FieldDefinition[] = [];
  for (const item of items) {
    try {
      out.push(parseDefinition(item));
    } catch (e) {
      // An unknown type from a newer server: no editor here can be right for it.
      if (!(e instanceof ApiShapeError)) throw e;
    }
  }
  return out.sort((a, b) => a.position - b.position);
}

function parseFile(raw: unknown): FieldFile {
  const f = obj(raw, "attachment");
  const file = f.file && typeof f.file === "object" ? (f.file as Record<string, unknown>) : f;
  return {
    id: id(f.id, "attachment.id"),
    filename: optStr(file.filename) ?? "",
    contentType: optStr(file.content_type),
    byteSize: typeof file.byte_size === "number" ? file.byte_size : 0,
    url: absoluteUrl(optStr(file.url)),
  };
}

function parseSelection(raw: unknown): Selection {
  const s = obj(raw, "selection");
  return {
    selectionId: id(s.selection_id ?? s.id, "selection.selection_id"),
    recordId: id(s.linked_record_id, "selection.linked_record_id"),
    recordType: optStr(s.linked_record_type) ?? "",
  };
}

/**
 * `field_values` as the server sends it on a card or a record: an object keyed
 * by definition id (a STRING on the wire), each value shaped by its kind
 * (`Core::FieldValueService.values_for_records`).
 */
export function parseFieldValues(raw: unknown): FieldValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: FieldValues = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const defId = Number(key);
    if (!Number.isFinite(defId) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if ("scalar_value" in v) out[defId] = { kind: "scalar", value: v.scalar_value };
    else if (Array.isArray(v.selected_records)) out[defId] = { kind: "records", selections: readable(v.selected_records, parseSelection) };
    else if (Array.isArray(v.attachments)) out[defId] = { kind: "files", files: readable(v.attachments, parseFile) };
  }
  return out;
}

export function parseTag(raw: unknown): Tag {
  const t = obj(raw, "tag");
  return {
    id: id(t.id, "tag.id"),
    label: str(t.label, "tag.label"),
    color: optStr(t.color),
    position: typeof t.position === "number" ? t.position : 0,
    categoryId: typeof t.core_tag_category_id === "number" ? t.core_tag_category_id : 0,
  };
}

function parseCategory(raw: unknown): TagCategory {
  const c = obj(raw, "tag_category");
  return {
    id: id(c.id, "tag_category.id"),
    name: optStr(c.name) ?? "",
    tags: Array.isArray(c.tags) ? readable(c.tags, parseTag) : [],
  };
}

function parseRecordOption(raw: unknown): RecordOption {
  const o = obj(raw, "record_option");
  return { id: id(o.id, "record_option.id"), label: optStr(o.label) ?? `#${String(o.id)}`, color: optStr(o.color) };
}

function definitionBody(input: DefinitionInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.fieldType !== undefined) body.field_type = input.fieldType;
  if (input.recordClass !== undefined) body.record_class = input.recordClass;
  if (input.tagCategoryId !== undefined) body.core_tag_category_id = input.tagCategoryId;
  if (input.required !== undefined) body.required = input.required;
  if (input.config !== undefined) body.config = input.config;
  if (input.position !== undefined) body.position = input.position;
  return body;
}

export const fieldsApi = {
  /** Every scalar in one request, all or nothing on the server (`ApplicationRecord.transaction`). */
  setValues: async (record: FieldRecord, values: Record<number, unknown>): Promise<void> => {
    await http.patch(`${CORE}/field_values/batch_update`, { record_type: record.type, record_id: record.id, values });
  },

  addSelection: async (definition: FieldDefinition, record: FieldRecord, linkedId: number): Promise<Selection> => {
    const res = await http.post(`${CORE}/field_record_selections`, {
      core_field_definition_id: definition.id,
      record_type: record.type,
      record_id: record.id,
      linked_record_type: definition.recordClass,
      linked_record_id: linkedId,
    });
    return parseSelection(obj(obj(res.data, "selection").field_record_selection, "field_record_selection"));
  },

  removeSelection: async (selectionId: number): Promise<void> => {
    await http.delete(`${CORE}/field_record_selections/${selectionId}`);
  },

  upload: async (definition: FieldDefinition, record: FieldRecord, file: { uri: string; name: string; mimeType: string }): Promise<FieldFile> => {
    const form = new FormData();
    form.append("core_field_definition_id", String(definition.id));
    form.append("record_type", record.type);
    form.append("record_id", String(record.id));
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    const res = await http.post(`${CORE}/field_attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
    return parseFile(obj(res.data, "upload").attachment);
  },

  removeFile: async (attachmentId: number): Promise<void> => {
    await http.delete(`${CORE}/field_attachments/${attachmentId}`);
  },

  /** A picker's choices for a record field, searched on the server, 20 a page. */
  recordOptions: async (definitionId: number, search: string, page: number): Promise<RecordOptionsPage> => {
    const term = search.trim();
    const res = await http.get(`${CORE}/record_options`, { params: { field_definition_id: definitionId, page, per_page: 20, ...(term ? { search: term } : {}) } });
    const body = obj(res.data, "record_options");
    const pagy = ((body.meta ?? {}) as { pagy?: { page?: unknown; pages?: unknown } }).pagy ?? {};
    return {
      options: readableRows(arr(body.record_options, "record_options"), parseRecordOption).rows,
      page: typeof pagy.page === "number" ? pagy.page : page,
      pages: typeof pagy.pages === "number" ? pagy.pages : 1,
    };
  },

  definitions: async (ownerType: string, ownerId: number): Promise<FieldDefinition[]> => {
    const res = await http.get(`${CORE}/field_definitions`, { params: { owner_type: ownerType, owner_id: ownerId } });
    return parseDefinitions(arr(obj(res.data, "field_definitions").field_definitions, "field_definitions"));
  },

  /** The server makes the `key` from the name when none is sent (`generate_key`). */
  createDefinition: async (ownerType: string, ownerId: number, input: DefinitionInput): Promise<FieldDefinition> => {
    const res = await http.post(`${CORE}/field_definitions`, { field_definition: { owner_type: ownerType, owner_id: ownerId, ...definitionBody(input) } });
    return parseDefinition(obj(res.data, "create").field_definition);
  },

  updateDefinition: async (definitionId: number, input: DefinitionInput): Promise<FieldDefinition> => {
    const res = await http.patch(`${CORE}/field_definitions/${definitionId}`, { field_definition: definitionBody(input) });
    return parseDefinition(obj(res.data, "update").field_definition);
  },

  removeDefinition: async (definitionId: number): Promise<void> => {
    await http.delete(`${CORE}/field_definitions/${definitionId}`);
  },

  tagCategories: async (ownerType: string, ownerId: number): Promise<TagCategory[]> => {
    const res = await http.get(`${CORE}/tag_categories`, { params: { owner_type: ownerType, owner_id: ownerId } });
    return readable(arr(obj(res.data, "tag_categories").tag_categories, "tag_categories"), parseCategory);
  },

  createTagCategory: async (ownerType: string, ownerId: number, name: string): Promise<TagCategory> => {
    const res = await http.post(`${CORE}/tag_categories`, { tag_category: { name, owner_type: ownerType, owner_id: ownerId } });
    return parseCategory(obj(res.data, "create").tag_category);
  },

  createTag: async (categoryId: number, label: string, color: string | null): Promise<Tag> => {
    const res = await http.post(`${CORE}/tag_categories/${categoryId}/tags`, { tag: { label, color } });
    return parseTag(obj(res.data, "create").tag);
  },

  removeTag: async (categoryId: number, tagId: number): Promise<void> => {
    await http.delete(`${CORE}/tag_categories/${categoryId}/tags/${tagId}`);
  },
};

/**
 * The key a new select option gets from its label (the web's `toFieldKey`):
 * lower case, words joined by `_`, nothing else. Empty for a label with no
 * letter or digit, which the editor refuses.
 */
export function optionKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
