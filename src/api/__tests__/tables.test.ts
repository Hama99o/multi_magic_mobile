/**
 * The Tables API boundary (`docs/design/tables/SPEC.md` §A, §C3, §E).
 *
 * Fixtures are shaped from the serializers at multi_magic e9adf512
 * (`table_app/base_serializer.rb`, `table_serializer.rb` :full,
 * `view_serializer.rb`, `record_presenter.rb#rows`), never from a device
 * capture: his tables are his data and this repo is public.
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "../http";
import { tablesApi, recordsParams, type RecordsQuery } from "../tables";

const BASE = "/api/v1/table_app";
let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
});
afterEach(() => mock.restore());

const base = {
  id: 3,
  name: "Shop",
  description: "Stock and orders",
  icon: null,
  color: "#10b981",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-19T10:00:00Z",
  owner: { id: 1, name: "Owner Person" },
  role: "editor",
  tables: [
    { id: 11, base_id: 3, name: "Orders", icon: null, color: null, description: null, position: 1, updated_at: "2026-11-19T10:00:00Z" },
    { id: 10, base_id: 3, name: "Items", icon: null, color: null, description: "What we sell", position: 0, updated_at: "2026-11-18T10:00:00Z" },
  ],
  record_counts: { "10": 42, "11": 7 },
};

describe("bases", () => {
  it("reads a base with its tables in tab order, counts and role", async () => {
    mock.onGet(`${BASE}/bases`).reply(200, { bases: [base] });
    const [b] = await tablesApi.bases();
    expect(b).toMatchObject({ id: 3, name: "Shop", description: "Stock and orders", color: "#10b981", role: "editor", createdAt: "2026-11-01T10:00:00Z" });
    expect(b.tables.map((t) => t.name)).toEqual(["Items", "Orders"]);
    expect(b.tables[0]).toMatchObject({ id: 10, rows: 42, description: "What we sell" });
    expect(b.rowCount).toBe(49);
  });

  it("sends the chosen order, and nothing for the server's default (newest first)", async () => {
    mock.onGet(`${BASE}/bases`, { params: { sort: "name_asc" } }).reply(200, { bases: [] });
    await expect(tablesApi.bases("name_asc")).resolves.toEqual([]);
    mock.reset();
    mock.onGet(`${BASE}/bases`).reply((config) => [200, { bases: config.params?.sort === undefined ? [base] : [] }]);
    expect(await tablesApi.bases("created_at_desc")).toHaveLength(1);
  });

  it("an unknown role reads as a viewer: the screen never offers what it cannot do", async () => {
    mock.onGet(`${BASE}/bases`).reply(200, { bases: [{ ...base, role: "superuser" }] });
    expect((await tablesApi.bases())[0].role).toBe("viewer");
  });
});

const field = (id: number, name: string, field_type: string, config: Record<string, unknown> = {}) => ({
  id,
  name,
  key: `f${id}`,
  field_type,
  record_class: field_type === "multi_record" ? "TableApp::Record" : null,
  core_tag_category_id: null,
  position: id,
  required: false,
  config,
  owner_type: "TableApp::Table",
  owner_id: 10,
});

const table = {
  table: {
    id: 10,
    base_id: 3,
    name: "Items",
    icon: null,
    color: null,
    description: "What we sell",
    position: 0,
    updated_at: "2026-11-18T10:00:00Z",
    fields: [
      field(1, "Name", "text"),
      field(2, "Status", "single_select", { options: [{ value: "in", label: "In stock", color: "green" }] }),
      field(3, "Supplier", "multi_record", { table_id: 12 }),
      field(4, "Photos", "attachments"),
      field(5, "Added", "created_time"),
      field(6, "Cells", "a_type_from_the_future"),
    ],
    relations: { "3": "many_to_one" },
    primary_field_id: 1,
    view: { id: 70, table_id: 10, name: "Grid", view_type: "grid", position: 0, config: { sorts: [], hidden_field_ids: [4], row_height: "medium" } },
    views: [
      { id: 70, table_id: 10, name: "Grid", view_type: "grid", position: 0, config: { sorts: [], hidden_field_ids: [4], row_height: "medium" } },
      { id: 71, table_id: 10, name: "Pictures", view_type: "gallery", position: 1, config: { cover_field_id: 4, filters: [{ field_id: 2, op: "any_of", value: ["in"] }], match: "or" } },
    ],
  },
};

describe("table", () => {
  it("reads the columns, the title column and every view with its config", async () => {
    mock.onGet(`${BASE}/tables/10`).reply(200, table);
    const t = await tablesApi.table(10);
    expect(t).toMatchObject({ id: 10, baseId: 3, name: "Items", description: "What we sell", primaryFieldId: 1 });
    // A type this app does not know is left out, never drawn wrong.
    expect(t.fields.map((f) => f.name)).toEqual(["Name", "Status", "Supplier", "Photos", "Added"]);
    expect(t.relations).toEqual({ 3: "many_to_one" });
    expect(t.views.map((v) => [v.name, v.viewType])).toEqual([["Grid", "grid"], ["Pictures", "gallery"]]);
    expect(t.view.id).toBe(70);
    expect(t.views[0].config).toMatchObject({ hiddenFieldIds: [4], rowHeight: "medium", sorts: [], filters: [], match: "and" });
    expect(t.views[1].config).toMatchObject({ coverFieldId: 4, match: "or", filters: [{ fieldId: 2, op: "any_of", value: ["in"] }] });
  });

  it("an unknown view type reads as the grid (the card list), not as an error", async () => {
    const odd = { table: { ...table.table, views: [{ ...table.table.view, view_type: "timeline" }] } };
    mock.onGet(`${BASE}/tables/10`).reply(200, odd);
    expect((await tablesApi.table(10)).views[0].viewType).toBe("grid");
  });
});

const rows = {
  records: [
    {
      id: 501,
      position: 3,
      created_at: "2026-11-19T09:00:00Z",
      updated_at: "2026-11-19T09:30:00Z",
      values: {
        "1": { scalar_value: "Blue scarf" },
        "2": { scalar_value: "in" },
        "3": { selected_ids: [900, 901], selected_count: 2, selected_records: [{ selection_id: 1, linked_record_id: 900, linked_record_type: "TableApp::Record", label: "Kabul office" }, { selection_id: 2, linked_record_id: 901, linked_record_type: "TableApp::Record", label: null }] },
        "4": { attachments: [{ id: 80, filename: "scarf.jpg", content_type: "image/jpeg", byte_size: 2048, url: "/rails/active_storage/blobs/x/scarf.jpg" }] },
        "5": { scalar_value: "2026-11-19 09:00" },
      },
    },
    { id: "broken" },
  ],
  meta: { offset: 0, limit: 100, has_more: true, total_count: 1204, table_total: 1300 },
};

describe("records", () => {
  it("reads a page: values through the shared field parser, link titles, counts", async () => {
    mock.onGet(`${BASE}/tables/10/records`).reply(200, rows);
    const page = await tablesApi.records(10, {}, 0);
    expect(page.rows).toHaveLength(1);
    expect(page.unreadable).toBe(1);
    const r = page.rows[0];
    expect(r).toMatchObject({ id: 501, createdAt: "2026-11-19T09:00:00Z" });
    expect(r.values[1]).toEqual({ kind: "scalar", value: "Blue scarf" });
    expect(r.values[3]).toMatchObject({ kind: "records" });
    expect(r.values[4]).toMatchObject({ kind: "files" });
    expect(r.linkLabels).toEqual({ 900: "Kabul office" });
    expect(r.linkCounts).toEqual({ 3: 2 });
    expect(page).toMatchObject({ offset: 0, hasMore: true, totalCount: 1204, tableTotal: 1300, groups: null });
  });

  it("reads one row on its own", async () => {
    mock.onGet(`${BASE}/records/501`).reply(200, { record: rows.records[0] });
    expect(await tablesApi.record(501)).toMatchObject({ id: 501, linkLabels: { 900: "Kabul office" } });
  });

  it("a later page carries no counts", async () => {
    mock.onGet(`${BASE}/tables/10/records`).reply(200, { records: [], meta: { offset: 100, limit: 100, has_more: false } });
    expect(await tablesApi.records(10, {}, 100)).toMatchObject({ totalCount: null, tableTotal: null, hasMore: false });
  });
});

describe("recordsParams: the query the phone sends (never the view)", () => {
  it("asks 100 rows a page and sends only what is set", () => {
    expect(recordsParams({}, 0)).toEqual({ offset: 0, limit: 100 });
  });

  it("JSON-encodes filters and sorts in the server's names", () => {
    const q: RecordsQuery = {
      search: "  scarf ",
      filters: [{ fieldId: 2, op: "any_of", value: ["in"] }],
      match: "or",
      sorts: [{ fieldId: 1, direction: "asc" }],
      groupBy: 2,
    };
    expect(recordsParams(q, 200)).toEqual({
      offset: 200,
      limit: 100,
      search: "scarf",
      filters: JSON.stringify([{ field_id: 2, op: "any_of", value: ["in"] }]),
      match: "or",
      sorts: JSON.stringify([{ field_id: 1, direction: "asc" }]),
      group_by: 2,
    });
  });

  it("newest first is the row's own creation time, ahead of any column sort", () => {
    expect(recordsParams({ newestFirst: true }, 0)).toEqual({ offset: 0, limit: 100, sort: "-created_at" });
  });
});

describe("writes (increment 2): through Tables' own endpoints, so its checks and history run", () => {
  it("saves values on the row in the server's names, and reads the row back", async () => {
    mock.onPatch(`${BASE}/records/501`).reply(200, { record: rows.records[0] });
    const r = await tablesApi.updateValues(501, { 1: "Blue scarf", 2: "in" });
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ record: { values: { "1": "Blue scarf", "2": "in" } } });
    expect(r.id).toBe(501);
  });

  it("adds a row, empty or with values", async () => {
    mock.onPost(`${BASE}/tables/10/records`).reply(201, { record: rows.records[0] });
    await tablesApi.createRecord(10);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ record: { values: {} } });
  });

  it("duplicates, deletes to the trash, and restores (Undo)", async () => {
    mock.onPost(`${BASE}/records/501/duplicate`).reply(201, { record: { ...rows.records[0], id: 777 } });
    expect((await tablesApi.duplicate(501)).id).toBe(777);
    mock.onDelete(`${BASE}/records/501`).reply(204);
    await tablesApi.destroy(501);
    mock.onPost(`${BASE}/tables/10/records/restore`).reply(200, {});
    await tablesApi.restore(10, [501]);
    expect(JSON.parse(mock.history.post[1].data)).toEqual({ ids: [501] });
  });

  it("links and unlinks by the row's own endpoints; the new selection is read from the answer", async () => {
    mock.onPost(`${BASE}/records/501/link`).reply(200, { record: rows.records[0] });
    const sel = await tablesApi.link(501, 3, 901);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ field_id: 3, linked_id: 901 });
    expect(sel).toEqual({ selectionId: 2, recordId: 901, recordType: "TableApp::Record" });
    mock.onPost(`${BASE}/records/501/unlink`).reply(200, { record: rows.records[0] });
    await tablesApi.unlink(501, 3, 900);
    expect(JSON.parse(mock.history.post[1].data)).toEqual({ field_id: 3, linked_id: 900 });
  });

  it("a one-link column already linked answers 'cardinality': the phone can offer Replace", async () => {
    mock.onPost(`${BASE}/records/501/link`).replyOnce(422, { message: "already linked", code: "cardinality", conflict: { id: 900, label: "Kabul office" } });
    await expect(tablesApi.link(501, 3, 901)).rejects.toMatchObject({ cardinality: { id: 900, label: "Kabul office" } });
    mock.onPost(`${BASE}/records/501/link`).reply(200, { record: rows.records[0] });
    await tablesApi.link(501, 3, 901, { replace: true });
    expect(JSON.parse(mock.history.post[1].data)).toEqual({ field_id: 3, linked_id: 901, replace: true });
  });
});
