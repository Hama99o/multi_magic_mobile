/**
 * TABLES, the bases and their tables (`docs/design/tables/SPEC.md`).
 *
 * Every call the web's `pages/table_app/api/table_app.api.ts` makes for
 * browsing, against `Api::V1::TableApp::*Controller`, read 2026-11-20 at
 * multi_magic e9adf512. The full inventory with file:line is
 * `docs/parity/tables.md`. Column values go through `./fields.ts`, which Flow
 * shares (SPEC C9).
 *
 * ── WHAT THE SERVER DOES THAT A SCREEN MUST KNOW ─────────────────────────
 * - Bases come newest first by creation (multi_magic feat/flow-rest-paging,
 *   API_ASKS §6.2; before that deploy, `updated_at desc`). `?sort=` picks
 *   another order. Tables inside a base keep the user's tab order.
 * - `records#index` takes the query as REQUEST PARAMETERS (`search`,
 *   `filters`, `match`, `sorts`, `group_by`) and never reads the view's saved
 *   config (`records_controller.rb:21-37`). That is what makes a personal
 *   filter possible with no server change (SPEC C1): the phone sends its own
 *   query, and this file has no call that writes a view.
 * - `sort=-created_at` orders by the row's own creation time, ahead of any
 *   column sort (API_ASKS §6.1, deploy pending). Without it the table's own
 *   order applies; an older server ignores the parameter.
 * - Paging is offset/limit. The counts (`total_count`, `table_total`,
 *   `groups`) come with the FIRST page only.
 * - A link cell carries every linked id, but titles for the first 12 only
 *   (`RecordPresenter::LINK_PREVIEW`); `selected_count` says how many there are.
 */
import { http } from "./http";
import { arr, id, obj, optStr, readable, readableRows, str } from "./parse";
import { parseDefinitions, parseFieldValues, type FieldDefinition, type FieldValues } from "./fields";

const BASE = "/api/v1/table_app";

/** The record type a row's field values are stored under. */
export const RECORD_TYPE = "TableApp::Record";

/** Rows a page on the phone (the server's default is 200): SPEC C10. */
export const PAGE_SIZE = 100;

export const BASE_ROLES = ["owner", "editor", "viewer"] as const;
export type BaseRole = (typeof BASE_ROLES)[number];

export const BASE_SORTS = ["created_at_desc", "updated_at_desc", "name_asc"] as const;
export type BaseSort = (typeof BASE_SORTS)[number];

export const VIEW_TYPES = ["grid", "kanban", "calendar", "gallery"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export const ROW_HEIGHTS = ["short", "medium", "tall", "extra"] as const;
export type RowHeight = (typeof ROW_HEIGHTS)[number];

export interface TableSummary {
  id: number;
  name: string;
  description: string | null;
  position: number;
  /** Rows in it (kept ones), from the base's `record_counts`. */
  rows: number;
}

export interface Base {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  role: BaseRole;
  owner: { id: number; name: string };
  /** In the user's tab order. */
  tables: TableSummary[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FilterCondition {
  fieldId: number;
  op: string;
  value: unknown;
}

export interface SortRule {
  fieldId: number;
  direction: "asc" | "desc";
}

/** A view's saved config, the parts the phone reads (`views_controller.rb` CONFIG_KEYS). */
export interface ViewConfig {
  search: string;
  match: "and" | "or";
  filters: FilterCondition[];
  sorts: SortRule[];
  groupByFieldId: number | null;
  hiddenFieldIds: number[];
  fieldOrder: number[];
  rowHeight: RowHeight;
  rowColorFieldId: number | null;
  coverFieldId: number | null;
  kanbanFieldId: number | null;
  calendarFieldId: number | null;
}

export interface View {
  id: number;
  name: string;
  viewType: ViewType;
  position: number;
  config: ViewConfig;
}

export type Relation = "many_to_many" | "one_to_many" | "many_to_one" | "one_to_one";

export interface Table {
  id: number;
  baseId: number;
  name: string;
  description: string | null;
  fields: FieldDefinition[];
  primaryFieldId: number | null;
  relations: Record<number, Relation>;
  /** The view the table opens on. */
  view: View;
  views: View[];
}

export interface RecordRow {
  id: number;
  position: number;
  createdAt: string;
  updatedAt: string;
  values: FieldValues;
  /** Titles of linked rows, by linked row id (the first 12 per cell). */
  linkLabels: Record<number, string>;
  /** How many rows each link column holds, by field id (more than the titles sent). */
  linkCounts: Record<number, number>;
}

export interface RecordsPage {
  rows: RecordRow[];
  unreadable: number;
  offset: number;
  hasMore: boolean;
  /** First page only. */
  totalCount: number | null;
  tableTotal: number | null;
  /** Group sizes by group key, first page only, when grouped. */
  groups: Record<string, number> | null;
}

/** What the phone asks for: the shared view's query with the personal layer over it (SPEC C1). */
export interface RecordsQuery {
  search?: string;
  filters?: FilterCondition[];
  match?: "and" | "or";
  sorts?: SortRule[];
  groupBy?: number | null;
  /** The row's own creation time, newest first, ahead of the column sorts (SPEC C3). */
  newestFirst?: boolean;
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const optId = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
};

const ids = (value: unknown): number[] => (Array.isArray(value) ? value.map(optId).filter((n): n is number => n !== null) : []);

function parseTableSummary(raw: unknown, counts: Record<string, unknown>): TableSummary {
  const t = obj(raw, "table");
  const tableId = id(t.id, "table.id");
  const rows = counts[String(tableId)];
  return {
    id: tableId,
    name: str(t.name, "table.name"),
    description: optStr(t.description),
    position: typeof t.position === "number" ? t.position : 0,
    rows: typeof rows === "number" ? rows : 0,
  };
}

export function parseBase(raw: unknown): Base {
  const b = obj(raw, "base");
  const counts = b.record_counts && typeof b.record_counts === "object" ? (b.record_counts as Record<string, unknown>) : {};
  const tables = readable(Array.isArray(b.tables) ? b.tables : [], (t) => parseTableSummary(t, counts)).sort((x, y) => x.position - y.position);
  const owner = b.owner && typeof b.owner === "object" ? (b.owner as Record<string, unknown>) : {};
  return {
    id: id(b.id, "base.id"),
    name: str(b.name, "base.name"),
    description: optStr(b.description),
    color: optStr(b.color),
    icon: optStr(b.icon),
    role: pick(b.role, BASE_ROLES, "viewer"),
    owner: { id: optId(owner.id) ?? 0, name: optStr(owner.name) ?? "" },
    tables,
    rowCount: tables.reduce((sum, t) => sum + t.rows, 0),
    createdAt: str(b.created_at, "base.created_at"),
    updatedAt: str(b.updated_at, "base.updated_at"),
  };
}

function parseFilter(raw: unknown): FilterCondition {
  const f = obj(raw, "filter");
  return { fieldId: id(f.field_id, "filter.field_id"), op: str(f.op, "filter.op"), value: f.value ?? null };
}

function parseSort(raw: unknown): SortRule {
  const s = obj(raw, "sort");
  return { fieldId: id(s.field_id, "sort.field_id"), direction: s.direction === "desc" ? "desc" : "asc" };
}

export function parseViewConfig(raw: unknown): ViewConfig {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    search: optStr(c.search) ?? "",
    match: c.match === "or" ? "or" : "and",
    filters: readable(Array.isArray(c.filters) ? c.filters : [], parseFilter),
    sorts: readable(Array.isArray(c.sorts) ? c.sorts : [], parseSort),
    groupByFieldId: optId(c.group_by_field_id),
    hiddenFieldIds: ids(c.hidden_field_ids),
    fieldOrder: ids(c.field_order),
    rowHeight: pick(c.row_height, ROW_HEIGHTS, "short"),
    rowColorFieldId: optId(c.row_color_field_id),
    coverFieldId: optId(c.cover_field_id),
    kanbanFieldId: optId(c.kanban_field_id),
    calendarFieldId: optId(c.calendar_field_id),
  };
}

export function parseView(raw: unknown): View {
  const v = obj(raw, "view");
  return {
    id: id(v.id, "view.id"),
    name: str(v.name, "view.name"),
    viewType: pick(v.view_type, VIEW_TYPES, "grid"),
    position: typeof v.position === "number" ? v.position : 0,
    config: parseViewConfig(v.config),
  };
}

const RELATIONS: readonly Relation[] = ["many_to_many", "one_to_many", "many_to_one", "one_to_one"];

export function parseTable(raw: unknown): Table {
  const t = obj(raw, "table");
  const relations: Record<number, Relation> = {};
  if (t.relations && typeof t.relations === "object") {
    for (const [key, value] of Object.entries(t.relations as Record<string, unknown>)) {
      const fieldId = optId(key);
      if (fieldId && RELATIONS.includes(value as Relation)) relations[fieldId] = value as Relation;
    }
  }
  const view = parseView(t.view);
  const views = readable(Array.isArray(t.views) ? t.views : [], parseView);
  return {
    id: id(t.id, "table.id"),
    baseId: id(t.base_id, "table.base_id"),
    name: str(t.name, "table.name"),
    description: optStr(t.description),
    fields: parseDefinitions(Array.isArray(t.fields) ? t.fields : []),
    primaryFieldId: optId(t.primary_field_id),
    relations,
    view,
    views: views.length ? views : [view],
  };
}

export function parseRecord(raw: unknown): RecordRow {
  const r = obj(raw, "record");
  const values = r.values && typeof r.values === "object" ? (r.values as Record<string, unknown>) : {};
  const linkLabels: Record<number, string> = {};
  const linkCounts: Record<number, number> = {};
  for (const [key, cell] of Object.entries(values)) {
    if (!cell || typeof cell !== "object") continue;
    const c = cell as Record<string, unknown>;
    if (!Array.isArray(c.selected_records)) continue;
    const fieldId = optId(key);
    if (fieldId) linkCounts[fieldId] = typeof c.selected_count === "number" ? c.selected_count : c.selected_records.length;
    for (const s of c.selected_records) {
      if (!s || typeof s !== "object") continue;
      const sel = s as Record<string, unknown>;
      const linked = optId(sel.linked_record_id);
      const label = optStr(sel.label);
      if (linked && label) linkLabels[linked] = label;
    }
  }
  return {
    id: id(r.id, "record.id"),
    position: typeof r.position === "number" ? r.position : 0,
    createdAt: str(r.created_at, "record.created_at"),
    updatedAt: str(r.updated_at, "record.updated_at"),
    values: parseFieldValues(values),
    linkLabels,
    linkCounts,
  };
}

/** The request parameters for one page of rows: only what is set, in the server's names. */
export function recordsParams(query: RecordsQuery, offset: number): Record<string, string | number> {
  const params: Record<string, string | number> = { offset, limit: PAGE_SIZE };
  const search = query.search?.trim();
  if (search) params.search = search;
  if (query.filters?.length) params.filters = JSON.stringify(query.filters.map((f) => ({ field_id: f.fieldId, op: f.op, value: f.value })));
  if (query.filters?.length && query.match) params.match = query.match;
  if (query.sorts?.length) params.sorts = JSON.stringify(query.sorts.map((s) => ({ field_id: s.fieldId, direction: s.direction })));
  if (query.groupBy) params.group_by = query.groupBy;
  if (query.newestFirst) params.sort = "-created_at";
  return params;
}

function parseGroups(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) if (typeof value === "number") out[key] = value;
  return out;
}

export const tablesApi = {
  /** Every base the user can open. The server's default order is newest first; it is not sent. */
  async bases(sort: BaseSort = "created_at_desc"): Promise<Base[]> {
    const params = sort === "created_at_desc" ? undefined : { sort };
    const { data } = await http.get(`${BASE}/bases`, { params });
    return readable(arr(obj(data, "bases response").bases, "bases"), parseBase);
  },

  async table(tableId: number): Promise<Table> {
    const { data } = await http.get(`${BASE}/tables/${tableId}`);
    return parseTable(obj(data, "table response").table);
  },

  /** One row, fresh (`records#show`): a link from elsewhere, or the record page. */
  async record(recordId: number): Promise<RecordRow> {
    const { data } = await http.get(`${BASE}/records/${recordId}`);
    return parseRecord(obj(data, "record response").record);
  },

  async records(tableId: number, query: RecordsQuery, offset: number): Promise<RecordsPage> {
    const { data } = await http.get(`${BASE}/tables/${tableId}/records`, { params: recordsParams(query, offset) });
    const body = obj(data, "records response");
    const meta = body.meta && typeof body.meta === "object" ? (body.meta as Record<string, unknown>) : {};
    const { rows, unreadable } = readableRows(arr(body.records, "records"), parseRecord);
    return {
      rows,
      unreadable,
      offset: typeof meta.offset === "number" ? meta.offset : offset,
      hasMore: meta.has_more === true,
      totalCount: typeof meta.total_count === "number" ? meta.total_count : null,
      tableTotal: typeof meta.table_total === "number" ? meta.table_total : null,
      groups: parseGroups(meta.groups),
    };
  },
};
