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

  it("reads each group's size, the rows with no value as \"\"", async () => {
    mock.onGet(`${BASE}/tables/10/records`).reply(200, { records: [], meta: { offset: 0, limit: 100, has_more: false, total_count: 9, table_total: 9, groups: [{ value: "in", count: 7 }, { value: null, count: 2 }] } });
    expect((await tablesApi.records(10, { groupBy: 2 }, 0)).groups).toEqual({ in: 7, "": 2 });
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

describe("relations: every linked row per link column, past the 12 a page carries", () => {
  it("reads each group with its target table and row titles", async () => {
    mock.onGet(`${BASE}/records/501/relations`).reply(200, {
      relations: [
        { field_id: 3, field_name: "Supplier", table: { id: 12, name: "Offices", base_id: 3 }, limit: null, count: 2, records: [{ id: 900, title: "Kabul office", fields: [] }, { id: 901, title: null, fields: [] }] },
        { field_id: 8, field_name: "Gone", table: null, limit: 1, count: 0, records: [] },
      ],
    });
    const groups = await tablesApi.relations(501);
    expect(groups[0]).toEqual({ fieldId: 3, fieldName: "Supplier", table: { id: 12, name: "Offices", baseId: 3 }, rows: [{ id: 900, title: "Kabul office" }, { id: 901, title: null }] });
    expect(groups[1].table).toBeNull();
  });
});

describe("Save as a new view: the one view write, a NEW view", () => {
  it("posts from the view on screen with the person's choices, in the server's names", async () => {
    mock.onPost(`${BASE}/tables/10/views`).reply(201, { view: { id: 72, table_id: 10, name: "Mine", view_type: "grid", position: 2, config: {} } });
    const v = await tablesApi.createView(10, { name: "Mine", viewType: "grid", fromViewId: 70, config: { filters: [{ fieldId: 2, op: "any_of", value: ["in"] }], sorts: [], groupByFieldId: null, hiddenFieldIds: [4] } });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ from_view_id: 70, view: { name: "Mine", view_type: "grid", config: { filters: [{ field_id: 2, op: "any_of", value: ["in"] }], sorts: [], group_by_field_id: null, hidden_field_ids: [4] } } });
    expect(v.id).toBe(72);
    expect(mock.history.patch).toHaveLength(0);
  });
});

describe("collaborate (increment 5)", () => {
  it("bulk-sets one column on the chosen rows (rows by id, values by field id), and bulk-deletes to the trash", async () => {
    mock.onPost(`${BASE}/tables/10/records/bulk_write`).reply(200, { result: { created: 0, updated: 2, ids: [501, 502] }, records: [] });
    await tablesApi.bulkSet(10, [501, 502], 2, "out");
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ rows: [{ id: 501, values: { "2": "out" } }, { id: 502, values: { "2": "out" } }] });
    mock.onPost(`${BASE}/tables/10/records/bulk_destroy`).reply(200, { deleted: 2, ids: [501, 502] });
    expect(await tablesApi.bulkDestroy(10, [501, 502])).toEqual([501, 502]);
  });

  it("reads comments newest first with a cursor, and posts one with its mentions", async () => {
    mock.onGet(`${BASE}/tables/10/comments`, { params: { record_id: 501 } }).reply(200, {
      comments: [{ id: 9, body: "Checked @QA", edited_at: null, created_at: "2026-11-20T10:00:00Z", user: { id: 1, name: "QA" }, mine: true, can_delete: true, files: [] }],
      next_before: 9,
    });
    const page1 = await tablesApi.comments(10, { recordId: 501 });
    expect(page1).toEqual({ comments: [{ id: 9, body: "Checked @QA", editedAt: null, createdAt: "2026-11-20T10:00:00Z", author: { id: 1, name: "QA" }, mine: true, canDelete: true, files: [] }], nextBefore: 9 });
    mock.onPost(`${BASE}/tables/10/comments`).reply(201, { comment: { id: 10, body: "Hi", edited_at: null, created_at: "x", user: { id: 1, name: "QA" }, mine: true, can_delete: true, files: [] } });
    await tablesApi.addComment(10, { body: "Hi", recordId: 501, mentionIds: [2] });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ comment: { body: "Hi", record_id: 501, mention_ids: [2] } });
  });

  it("reads the history with its filters and cursor", async () => {
    mock.onGet(`${BASE}/tables/10/activities`, { params: { kind: "rows", before: 50 } }).reply(200, {
      activities: [{ id: 49, action: "row.updated", source: "assistant", details: { fields: ["Status"] }, subject_type: "record", subject_id: 501, user: { id: 1, name: "QA" }, created_at: "c", updated_at: "u", restorable: false }],
      next_before: null,
    });
    const h = await tablesApi.history(10, { kind: "rows", before: 50 });
    expect(h.items[0]).toMatchObject({ id: 49, action: "row.updated", source: "assistant", details: { fields: ["Status"] }, subjectId: 501, who: "QA", restorable: false });
    expect(h.nextBefore).toBeNull();
  });

  it("reads the base's people, and shares by email with a role", async () => {
    mock.onGet(`${BASE}/bases/3/members`).reply(200, { owner: { id: 1, name: "QA", email: "qa@example.test" }, members: [{ id: 5, role: "viewer", pending: true, email: "friend@example.test", name: null, user_id: null, invited_at: "t" }] });
    const people = await tablesApi.members(3);
    expect(people.members[0]).toMatchObject({ id: 5, role: "viewer", pending: true, email: "friend@example.test" });
    mock.onPost(`${BASE}/bases/3/members`).reply(201, { member: { id: 6, role: "editor", pending: false, email: "e@example.test", name: "E", user_id: 7, invited_at: null }, state: "added" });
    await tablesApi.share(3, "e@example.test", "editor");
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ email: "e@example.test", role: "editor" });
  });
});
