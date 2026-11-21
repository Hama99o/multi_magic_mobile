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
    // The server's own shape (`Links#link!`), not a guess: it once read as "#0" on a device.
    mock.onPost(`${BASE}/records/501/link`).replyOnce(422, { message: "Office already links to Kabul office", code: "cardinality", conflict: { field_id: 3, record_id: 501, linked_id: 900 } });
    await expect(tablesApi.link(501, 3, 901)).rejects.toMatchObject({ cardinality: { id: 900, label: null } });
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

describe("manage views (4b; the web's ViewSwitcher): editors make, rename, duplicate and delete", () => {
  const view = (id: number, name: string, view_type = "grid") => ({ view: { id, table_id: 10, name, view_type, position: 3, config: {} } });

  it("a new kanban, calendar or gallery view carries its own column, posted from the view on screen", async () => {
    mock.onPost(`${BASE}/tables/10/views`).reply(201, view(73, "Board", "kanban"));
    await tablesApi.createView(10, { name: "Board", viewType: "kanban", fromViewId: 70, config: { kanbanFieldId: 5 } });
    await tablesApi.createView(10, { name: "Dates", viewType: "calendar", fromViewId: 70, config: { calendarFieldId: 6 } });
    await tablesApi.createView(10, { name: "Photos", viewType: "gallery", fromViewId: 70, config: { coverFieldId: null } });
    expect(mock.history.post.map((r) => JSON.parse(r.data))).toEqual([
      { from_view_id: 70, view: { name: "Board", view_type: "kanban", config: { kanban_field_id: 5 } } },
      { from_view_id: 70, view: { name: "Dates", view_type: "calendar", config: { calendar_field_id: 6 } } },
      { from_view_id: 70, view: { name: "Photos", view_type: "gallery", config: { cover_field_id: null } } },
    ]);
  });

  it("rename sends the NAME and nothing else (SPEC C1: the phone never writes a view's settings)", async () => {
    mock.onPatch(`${BASE}/views/70`).reply(200, view(70, "Kabul (2)"));
    const v = await tablesApi.renameView(70, "Kabul");
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ view: { name: "Kabul" } });
    expect(v.name).toBe("Kabul (2)"); // the server's unique name is the one shown
  });

  it("duplicate posts to the view; delete deletes it; the server's refusal of the last view reaches the caller", async () => {
    mock.onPost(`${BASE}/views/70/duplicate`).reply(201, view(74, "Kabul (copie)"));
    expect((await tablesApi.duplicateView(70)).id).toBe(74);
    mock.onDelete(`${BASE}/views/74`).reply(204);
    await tablesApi.deleteView(74);
    mock.onDelete(`${BASE}/views/70`).reply(422, { message: "A table keeps at least one view." });
    await expect(tablesApi.deleteView(70)).rejects.toMatchObject({ response: { status: 422 } });
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

  it("sends a comment with files as multipart comment[...] fields, with a long timeout (the server's `comment[files][]`)", async () => {
    const appended: [string, unknown][] = [];
    const original = FormData.prototype.append;
    jest.spyOn(FormData.prototype, "append").mockImplementation(function (this: FormData, field: string, part: unknown) {
      appended.push([field, typeof part === "string" ? part : { ...(part as object) }]);
      return original.call(this, field, String(part) as unknown as Blob);
    });
    let headers: Record<string, unknown> = {};
    let timeout = 0;
    mock.onPost(`${BASE}/tables/10/comments`).reply((config) => {
      headers = config.headers as Record<string, unknown>;
      timeout = config.timeout ?? 0;
      return [201, { comment: { id: 11, body: "", edited_at: null, created_at: "x", user: { id: 1, name: "QA" }, mine: true, can_delete: true, files: [{ id: 3, filename: "shop.jpg", content_type: "image/jpeg", byte_size: 2048, url: "/rails/x/shop.jpg" }] } }];
    });
    const c = await tablesApi.addComment(10, { body: "", recordId: 501, mentionIds: [2, 4], files: [{ uri: "file:///shop.jpg", name: "shop.jpg", mimeType: "image/jpeg" }, { uri: "file:///r.pdf", name: "r.pdf", mimeType: "application/pdf" }] });
    jest.restoreAllMocks();
    expect(appended).toEqual([
      ["comment[body]", ""],
      ["comment[record_id]", "501"],
      ["comment[mention_ids][]", "2"],
      ["comment[mention_ids][]", "4"],
      ["comment[files][]", { uri: "file:///shop.jpg", name: "shop.jpg", type: "image/jpeg" }],
      ["comment[files][]", { uri: "file:///r.pdf", name: "r.pdf", type: "application/pdf" }],
    ]);
    expect(String(headers["Content-Type"])).toMatch(/multipart\/form-data/);
    expect(timeout).toBeGreaterThanOrEqual(60_000);
    expect(c.files).toEqual([{ id: 3, filename: "shop.jpg", contentType: "image/jpeg", byteSize: 2048, url: expect.stringMatching(/\/rails\/x\/shop\.jpg$/) }]);
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

describe("deleting a table or a base (the owner, 2026-11-20)", () => {
  it("reads what a table's delete takes with it", async () => {
    mock.onGet(`${BASE}/tables/10/impact`).reply(200, { rows: 25, fields: 4, links_from: [{ table: "Offices", field: "Items", links: 1 }] });
    expect(await tablesApi.tableImpact(10)).toEqual({ rows: 25, fields: 4, linksFrom: [{ table: "Offices", field: "Items", links: 1 }] });
  });

  it("deletes a table, and a base with the exact name typed, untouched", async () => {
    mock.onDelete(`${BASE}/tables/10`).reply(204);
    await tablesApi.deleteTable(10);
    mock.onDelete(`${BASE}/bases/3`).reply(204);
    await tablesApi.deleteBase(3, "Shop ");
    expect(JSON.parse(mock.history.delete[1].data)).toEqual({ confirm_name: "Shop " });
    expect(mock.history.delete[1].params).toBeUndefined();
  });
});

describe("admin (increment 6a): bases and tables, as the server names things", () => {
  it("a new base posts its name, description, colour and first table; an edit patches only what changed", async () => {
    mock.onPost(`${BASE}/bases`).reply(201, { base });
    mock.onPatch(`${BASE}/bases/3`).reply(200, { base });
    await tablesApi.createBase({ name: "Shop", description: "What we sell", color: "#10b981", firstTableName: "Items" });
    await tablesApi.updateBase(3, { description: null });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ base: { name: "Shop", description: "What we sell", color: "#10b981", first_table_name: "Items" } });
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ base: { description: null } });
  });

  it("a table is made in its base, renamed or described by PATCH, duplicated with or without its rows", async () => {
    mock.onPost(`${BASE}/bases/3/tables`).reply(201, table);
    mock.onPatch(`${BASE}/tables/10`).reply(200, table);
    mock.onPost(`${BASE}/tables/10/duplicate`).reply(201, table);
    await tablesApi.createTable(3, "Suppliers");
    await tablesApi.updateTable(10, { name: "Items", description: "What we sell" });
    await tablesApi.duplicateTable(10, { withRows: false });
    expect(mock.history.post.map((r) => [r.url, JSON.parse(r.data)])).toEqual([
      [`${BASE}/bases/3/tables`, { table: { name: "Suppliers" } }],
      [`${BASE}/tables/10/duplicate`, { with_rows: false }],
    ]);
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ table: { name: "Items", description: "What we sell" } });
  });

  it("clear data returns its batch, and the Undo restores THAT batch by its time, not by ids", async () => {
    mock.onPost(`${BASE}/tables/10/clear`).reply(200, { deleted: 25, trashed_at: "2026-11-20T23:40:00.123456Z" });
    mock.onPost(`${BASE}/tables/10/records/restore`).reply(200, { restored: 25 });
    const cleared = await tablesApi.clearTable(10);
    expect(cleared).toEqual({ deleted: 25, trashedAt: "2026-11-20T23:40:00.123456Z" });
    expect(await tablesApi.restoreCleared(10, cleared.trashedAt)).toBe(25);
    expect(JSON.parse(mock.history.post[1].data)).toEqual({ trashed_at: "2026-11-20T23:40:00.123456Z" });
  });

  it("the tabs reorder in one call with the base's table ids", async () => {
    mock.onPost(`${BASE}/bases/3/tables/reorder`).reply(200, { ids: [11, 10] });
    expect(await tablesApi.reorderTables(3, [11, 10])).toEqual([11, 10]);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ ids: [11, 10] });
  });
});

describe("columns (increment 6b): the web's column menu", () => {
  const def = (id: number, name: string) => ({ field: field(id, name, "text") });
  it("reads what a delete takes: filled rows, a link's other side, where titles show", async () => {
    mock.onGet(`${BASE}/fields/3/usage`).reply(200, { usage: { filled_count: 7, row_count: 25, link: true, inverse: { name: "Items", table_name: "Offices" }, title_shown_in: [{ column: "Items", table: "Offices" }] } });
    expect(await tablesApi.fieldUsage(3)).toEqual({ filledCount: 7, rowCount: 25, link: true, inverse: { name: "Items", tableName: "Offices" }, titleShownIn: [{ column: "Items", table: "Offices" }] });
  });

  it("duplicate says with or without values; delete, title and restore hit their own endpoints", async () => {
    mock.onPost(`${BASE}/fields/2/duplicate`).reply(201, def(9, "Status (copie)"));
    mock.onDelete(`${BASE}/fields/2`).reply(204);
    mock.onPost(`${BASE}/fields/5/primary`).reply(200, def(5, "Phone"));
    expect((await tablesApi.duplicateField(2, false)).id).toBe(9);
    await tablesApi.deleteField(2);
    expect((await tablesApi.setPrimaryField(5)).id).toBe(5);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ with_values: false });
    expect(mock.history.delete.map((r) => r.url)).toEqual([`${BASE}/fields/2`]);
  });

  it("the column trash lists deleted columns with when and how many values", async () => {
    mock.onGet(`${BASE}/tables/10/fields/trashed`).reply(200, { fields: [{ id: 2, name: "Price", field_type: "decimal", deleted_at: "2026-11-20T10:00:00Z", purge_at: "2026-12-20T10:00:00Z", filled_count: 12 }] });
    expect(await tablesApi.trashedFields(10)).toEqual([{ id: 2, name: "Price", fieldType: "decimal", deletedAt: "2026-11-20T10:00:00Z", purgeAt: "2026-12-20T10:00:00Z", filledCount: 12 }]);
  });
});

describe("export (increment 7)", () => {
  it("posts the view as the person sees it, in the exporter's names (arrays, not the index's JSON strings)", async () => {
    mock.onPost(`${BASE}/tables/10/exports`).reply(201, { export: { id: 7, table_id: 10, status: "done", format: "xlsx", row_count: 3, filename: "Items.xlsx", error_message: null, ready: true } });
    const e = await tablesApi.startExport(10, "xlsx", { search: " scarf ", filters: [{ fieldId: 2, op: "any_of", value: ["in"] }], match: "and", sorts: [{ fieldId: 1, direction: "asc" }], fieldIds: [1, 2, 5] });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ format_type: "xlsx", query: { field_ids: [1, 2, 5], search: "scarf", filters: [{ field_id: 2, op: "any_of", value: ["in"] }], match: "and", sorts: [{ field_id: 1, direction: "asc" }] } });
    expect(e).toEqual({ id: 7, tableId: 10, status: "done", format: "xlsx", rowCount: 3, filename: "Items.xlsx", errorMessage: null, ready: true });
  });

  it("no search, filter or sort sends only the columns", async () => {
    mock.onPost(`${BASE}/tables/10/exports`).reply(201, { export: { id: 8, table_id: 10, status: "pending", format: "csv", ready: false } });
    await tablesApi.startExport(10, "csv", { search: " ", filters: [], sorts: [], fieldIds: [1] });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ format_type: "csv", query: { field_ids: [1] } });
  });
});
