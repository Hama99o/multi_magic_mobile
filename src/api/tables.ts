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
import { absoluteUrl } from "./conversations";
import { ApiShapeError, arr, id, obj, optStr, readable, readableRows, str } from "./parse";
import { parseDefinitions, parseFieldValues, type FieldDefinition, type FieldValues, type Selection } from "./fields";

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

/** One link column's rows, whole (`records#relations`): the record page's Relations section. */
export interface RelationGroup {
  fieldId: number;
  fieldName: string;
  /** Null when the linked table is gone. */
  table: { id: number; name: string; baseId: number } | null;
  rows: { id: number; title: string | null }[];
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

/**
 * `meta.groups`: `[{ value, count }]` in the column's option order, the rows
 * with no value last as `value: null` (`RecordQuery#group_counts`). Keyed
 * here by value, "" for none.
 */
function parseGroups(raw: unknown): Record<string, number> | null {
  if (!Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const { value, count } = g as Record<string, unknown>;
    if (typeof count === "number") out[value === null || value === undefined ? "" : String(value)] = count;
  }
  return out;
}

/**
 * A one-link column already holds a row (`records#link` 422, `code:
 * 'cardinality'`): the phone offers "Replace", as the web does.
 */
export class CardinalityError extends Error {
  constructor(public readonly cardinality: { id: number; label: string | null }) {
    super("cardinality");
  }
}

function cardinalityOf(error: unknown): { id: number; label: string | null } | null {
  const data = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (data?.status !== 422 || !data.data || typeof data.data !== "object") return null;
  const body = data.data as Record<string, unknown>;
  if (body.code !== "cardinality") return null;
  // `Links#link!`: `{ field_id, record_id, linked_id }`. No title: the
  // server puts it in its sentence only, so the screen names the row from
  // what it already holds (first seen on a device as "#0", 2026-11-20).
  const c = body.conflict && typeof body.conflict === "object" ? (body.conflict as Record<string, unknown>) : {};
  return { id: optId(c.linked_id) ?? optId(c.id) ?? 0, label: optStr(c.label) };
}

/** The selection a link made, read back from the row the server answers with. */
function selectionIn(raw: unknown, fieldId: number, linkedId: number): Selection {
  const r = obj(raw, "record");
  const values = r.values && typeof r.values === "object" ? (r.values as Record<string, unknown>) : {};
  const cell = values[String(fieldId)] as Record<string, unknown> | undefined;
  const found = Array.isArray(cell?.selected_records)
    ? (cell.selected_records as Record<string, unknown>[]).find((s) => optId(s.linked_record_id) === linkedId)
    : undefined;
  if (!found) throw new ApiShapeError("record.values.selected_records", "the new link");
  return { selectionId: id(found.selection_id, "selection_id"), recordId: linkedId, recordType: optStr(found.linked_record_type) ?? RECORD_TYPE };
}

const valuesBody = (values: Record<number, unknown>) => ({ record: { values: Object.fromEntries(Object.entries(values)) } });


// ── Collaborate (increment 5) ────────────────────────────────────────────

export interface TableComment {
  id: number;
  body: string;
  editedAt: string | null;
  createdAt: string;
  author: { id: number; name: string } | null;
  mine: boolean;
  canDelete: boolean;
  files: { id: number; filename: string; contentType: string | null; byteSize: number; url: string | null }[];
}

export interface HistoryItem {
  id: number;
  /** `row.updated`, `column.deleted`… (`TableApp::Activity::KINDS`). */
  action: string;
  /** `app`, `assistant` or `import`: who did it, the web's badge. */
  source: string | null;
  details: Record<string, unknown>;
  subjectType: string | null;
  subjectId: number | null;
  who: string | null;
  at: string;
  /** A deleted column still in the trash. */
  restorable: boolean;
}

export const HISTORY_KINDS = ["rows", "columns", "imports", "links", "sharing", "table"] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export interface BaseMember {
  id: number;
  role: "editor" | "viewer";
  pending: boolean;
  email: string;
  name: string | null;
}

function parseComment(raw: unknown): TableComment {
  const c = obj(raw, "comment");
  const u = c.user && typeof c.user === "object" ? (c.user as Record<string, unknown>) : null;
  return {
    id: id(c.id, "comment.id"),
    body: optStr(c.body) ?? "",
    editedAt: optStr(c.edited_at),
    createdAt: str(c.created_at, "comment.created_at"),
    author: u ? { id: id(u.id, "comment.user.id"), name: optStr(u.name) ?? "" } : null,
    mine: c.mine === true,
    canDelete: c.can_delete === true,
    files: readable(Array.isArray(c.files) ? c.files : [], (f) => {
      const x = obj(f, "comment.file");
      return { id: id(x.id, "file.id"), filename: optStr(x.filename) ?? "", contentType: optStr(x.content_type), byteSize: typeof x.byte_size === "number" ? x.byte_size : 0, url: absoluteUrl(optStr(x.url)) };
    }),
  };
}

function parseHistory(raw: unknown): HistoryItem {
  const a = obj(raw, "activity");
  const u = a.user && typeof a.user === "object" ? (a.user as Record<string, unknown>) : null;
  return {
    id: id(a.id, "activity.id"),
    action: str(a.action, "activity.action"),
    source: optStr(a.source),
    details: a.details && typeof a.details === "object" && !Array.isArray(a.details) ? (a.details as Record<string, unknown>) : {},
    subjectType: optStr(a.subject_type),
    subjectId: optId(a.subject_id),
    who: u ? (optStr(u.name) ?? null) : null,
    at: str(a.created_at, "activity.created_at"),
    restorable: a.restorable === true,
  };
}

function parseMember(raw: unknown): BaseMember {
  const m = obj(raw, "member");
  return { id: id(m.id, "member.id"), role: m.role === "editor" ? "editor" : "viewer", pending: m.pending === true, email: optStr(m.email) ?? "", name: optStr(m.name) };
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

  /** How many rows a query keeps, for the sheet's "Show 42" (one row asked, the count read). */
  async count(tableId: number, query: RecordsQuery): Promise<number> {
    const { data } = await http.get(`${BASE}/tables/${tableId}/records`, { params: { ...recordsParams(query, 0), limit: 1 } });
    const meta = obj(data, "records response").meta;
    const total = meta && typeof meta === "object" ? (meta as Record<string, unknown>).total_count : null;
    return typeof total === "number" ? total : 0;
  },

  /**
   * "Save as a new view…": the ONE place the phone writes a view, and it is a
   * NEW one, made on purpose and named by the person (SPEC C1). It starts from
   * the view on screen (`from_view_id`) with the person's layer over it, so a
   * colour, a width or a kanban column the phone does not edit is kept.
   */
  async createView(tableId: number, input: { name: string; viewType: ViewType; fromViewId: number; config: Partial<ViewConfig> }): Promise<View> {
    const c = input.config;
    const config: Record<string, unknown> = {};
    if (c.search !== undefined) config.search = c.search;
    if (c.match !== undefined) config.match = c.match;
    if (c.filters !== undefined) config.filters = c.filters.map((f) => ({ field_id: f.fieldId, op: f.op, value: f.value }));
    if (c.sorts !== undefined) config.sorts = c.sorts.map((s) => ({ field_id: s.fieldId, direction: s.direction }));
    if (c.groupByFieldId !== undefined) config.group_by_field_id = c.groupByFieldId;
    if (c.hiddenFieldIds !== undefined) config.hidden_field_ids = c.hiddenFieldIds;
    if (c.fieldOrder !== undefined) config.field_order = c.fieldOrder;
    if (c.rowColorFieldId !== undefined) config.row_color_field_id = c.rowColorFieldId;
    const { data } = await http.post(`${BASE}/tables/${tableId}/views`, { from_view_id: input.fromViewId, view: { name: input.name, view_type: input.viewType, config } });
    return parseView(obj(data, "view response").view);
  },

  async relations(recordId: number): Promise<RelationGroup[]> {
    const { data } = await http.get(`${BASE}/records/${recordId}/relations`);
    return readable(arr(obj(data, "relations response").relations, "relations"), (raw) => {
      const g = obj(raw, "relation");
      const t = g.table && typeof g.table === "object" ? (g.table as Record<string, unknown>) : null;
      return {
        fieldId: id(g.field_id, "relation.field_id"),
        fieldName: optStr(g.field_name) ?? "",
        table: t ? { id: id(t.id, "relation.table.id"), name: optStr(t.name) ?? "", baseId: id(t.base_id, "relation.table.base_id") } : null,
        rows: readable(Array.isArray(g.records) ? g.records : [], (r) => {
          const row = obj(r, "relation.record");
          return { id: id(row.id, "relation.record.id"), title: optStr(row.title) };
        }),
      };
    });
  },

  // ── Deleting (the owner, 2026-11-20; parity increment 6 brought forward) ──

  /** What a table's delete takes: its rows and columns, and other tables' link columns pointing here. */
  async tableImpact(tableId: number): Promise<{ rows: number; fields: number; linksFrom: { table: string; field: string; links: number }[] }> {
    const { data } = await http.get(`${BASE}/tables/${tableId}/impact`);
    const b = obj(data, "impact response");
    return {
      rows: typeof b.rows === "number" ? b.rows : 0,
      fields: typeof b.fields === "number" ? b.fields : 0,
      linksFrom: readable(Array.isArray(b.links_from) ? b.links_from : [], (raw) => {
        const l = obj(raw, "impact.link");
        return { table: optStr(l.table) ?? "", field: optStr(l.field) ?? "", links: typeof l.links === "number" ? l.links : 0 };
      }),
    };
  },

  /** Owners and editors (`TablePolicy#destroy?` = manage). Rows, views and the links pointing here go with it. */
  async deleteTable(tableId: number): Promise<void> {
    await http.delete(`${BASE}/tables/${tableId}`);
  },

  /** The owner only (`BasePolicy#destroy?`); the server checks the name too. The typed text is sent as typed. */
  async deleteBase(baseId: number, typedName: string): Promise<void> {
    await http.delete(`${BASE}/bases/${baseId}`, { params: { confirm_name: typedName } });
  },

  // ── Collaborate (increment 5) ─────────────────────────────────────────

  /** One column set on many rows (the web's bulk edit, one Undo there; `BulkWriter`). */
  async bulkSet(tableId: number, ids: number[], fieldId: number, value: unknown): Promise<void> {
    await http.post(`${BASE}/tables/${tableId}/records/bulk_write`, { rows: ids.map((rid) => ({ id: rid, values: { [String(fieldId)]: value } })) });
  },

  /** Many rows to the trash at once; `restore` with the ids brings them back. */
  async bulkDestroy(tableId: number, ids: number[]): Promise<number[]> {
    const { data } = await http.post(`${BASE}/tables/${tableId}/records/bulk_destroy`, { ids });
    const got = obj(data, "bulk_destroy response").ids;
    return Array.isArray(got) ? got.filter((x): x is number => typeof x === "number") : ids;
  },

  /** A table's comments, or one row's, newest first, 50 a page by an id cursor. */
  async comments(tableId: number, opts: { recordId?: number; before?: number } = {}): Promise<{ comments: TableComment[]; nextBefore: number | null }> {
    const params: Record<string, number> = {};
    if (opts.recordId) params.record_id = opts.recordId;
    if (opts.before) params.before = opts.before;
    const { data } = await http.get(`${BASE}/tables/${tableId}/comments`, { params });
    const body = obj(data, "comments response");
    return { comments: readable(arr(body.comments, "comments"), parseComment), nextBefore: optId(body.next_before) };
  },

  /** A comment; @mentions ring those people's bell (the server sends no email). */
  async addComment(tableId: number, input: { body: string; recordId?: number; mentionIds?: number[] }): Promise<TableComment> {
    const comment: Record<string, unknown> = { body: input.body };
    if (input.recordId) comment.record_id = input.recordId;
    if (input.mentionIds?.length) comment.mention_ids = input.mentionIds;
    const { data } = await http.post(`${BASE}/tables/${tableId}/comments`, { comment });
    return parseComment(obj(data, "comment response").comment);
  },

  async editComment(commentId: number, body: string): Promise<TableComment> {
    const { data } = await http.patch(`${BASE}/comments/${commentId}`, { comment: { body } });
    return parseComment(obj(data, "comment response").comment);
  },

  async deleteComment(commentId: number): Promise<void> {
    await http.delete(`${BASE}/comments/${commentId}`);
  },

  /** The table's history, or one row's, newest first, 50 a page; `kind` and `userId` filter. */
  async history(tableId: number, opts: { recordId?: number; kind?: HistoryKind; userId?: number; before?: number } = {}): Promise<{ items: HistoryItem[]; nextBefore: number | null }> {
    const params: Record<string, string | number> = {};
    if (opts.recordId) params.record_id = opts.recordId;
    if (opts.kind) params.kind = opts.kind;
    if (opts.userId) params.user_id = opts.userId;
    if (opts.before) params.before = opts.before;
    const { data } = await http.get(`${BASE}/tables/${tableId}/activities`, { params });
    const body = obj(data, "activities response");
    return { items: readable(arr(body.activities, "activities"), parseHistory), nextBefore: optId(body.next_before) };
  },

  async members(baseId: number): Promise<{ owner: { id: number; name: string; email: string }; members: BaseMember[] }> {
    const { data } = await http.get(`${BASE}/bases/${baseId}/members`);
    const body = obj(data, "members response");
    const o = obj(body.owner, "members.owner");
    return { owner: { id: id(o.id, "owner.id"), name: optStr(o.name) ?? "", email: optStr(o.email) ?? "" }, members: readable(arr(body.members, "members"), parseMember) };
  },

  /** Shares the base; an address with no account gets an invitation EMAIL (a message to a real person). */
  async share(baseId: number, email: string, role: "editor" | "viewer"): Promise<BaseMember> {
    const { data } = await http.post(`${BASE}/bases/${baseId}/members`, { email, role });
    return parseMember(obj(data, "member response").member);
  },

  async setRole(baseId: number, memberId: number, role: "editor" | "viewer"): Promise<BaseMember> {
    const { data } = await http.patch(`${BASE}/bases/${baseId}/members/${memberId}`, { role });
    return parseMember(obj(data, "member response").member);
  },

  async removeMember(baseId: number, memberId: number): Promise<void> {
    await http.delete(`${BASE}/bases/${baseId}/members/${memberId}`);
  },

  async resendInvite(baseId: number, memberId: number): Promise<BaseMember> {
    const { data } = await http.post(`${BASE}/bases/${baseId}/members/${memberId}/resend`);
    return parseMember(obj(data, "member response").member);
  },

  // ── Writes (increment 2), through Tables' own endpoints: TableApp::RecordWriter
  // checks the values and the table's history logs them (`row.updated`,
  // `link.added`); the core endpoints would skip both. ─────────────────────

  async updateValues(recordId: number, values: Record<number, unknown>): Promise<RecordRow> {
    const { data } = await http.patch(`${BASE}/records/${recordId}`, valuesBody(values));
    return parseRecord(obj(data, "record response").record);
  },

  async createRecord(tableId: number, values: Record<number, unknown> = {}): Promise<RecordRow> {
    const { data } = await http.post(`${BASE}/tables/${tableId}/records`, valuesBody(values));
    return parseRecord(obj(data, "record response").record);
  },

  /** A copy right under it, cells and links included (`TableApp::RowCopy`). */
  async duplicate(recordId: number): Promise<RecordRow> {
    const { data } = await http.post(`${BASE}/records/${recordId}/duplicate`);
    return parseRecord(obj(data, "record response").record);
  },

  /** To the row trash; `restore` (Undo) brings it back with its links and comments. */
  async destroy(recordId: number): Promise<void> {
    await http.delete(`${BASE}/records/${recordId}`);
  },

  async restore(tableId: number, ids: number[]): Promise<void> {
    await http.post(`${BASE}/tables/${tableId}/records/restore`, { ids });
  },

  async link(recordId: number, fieldId: number, linkedId: number, opts: { replace?: boolean } = {}): Promise<Selection> {
    try {
      const { data } = await http.post(`${BASE}/records/${recordId}/link`, { field_id: fieldId, linked_id: linkedId, ...(opts.replace ? { replace: true } : {}) });
      return selectionIn(obj(data, "record response").record, fieldId, linkedId);
    } catch (error) {
      const conflict = cardinalityOf(error);
      throw conflict ? new CardinalityError(conflict) : error;
    }
  },

  async unlink(recordId: number, fieldId: number, linkedId: number): Promise<void> {
    await http.post(`${BASE}/records/${recordId}/unlink`, { field_id: fieldId, linked_id: linkedId });
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
