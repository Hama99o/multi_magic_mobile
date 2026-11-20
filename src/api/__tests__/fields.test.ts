/**
 * The shared `core/*` field calls (Flow now, Tables next). Bodies are the
 * server's own names, read from `core/*_controller.rb` at multi_magic 0041bc0b.
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "../http";
import { fieldsApi, optionKey, parseConfig, parseDefinition, type FieldDefinition } from "../fields";

const CORE = "/api/v1/core";
let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
});
afterEach(() => mock.restore());

const card = { type: "FlowApp::Card", id: 900 };
const labels: FieldDefinition = parseDefinition({
  id: 103, name: "Labels", key: "labels", field_type: "multi_record", record_class: "Core::Tag", core_tag_category_id: 50, position: 3, required: false, config: { allow_create: true }, owner_type: "FlowApp::Project", owner_id: 7,
});

it("writes scalars in one batch keyed by definition id", async () => {
  mock.onPatch(`${CORE}/field_values/batch_update`).reply((config) => {
    expect(JSON.parse(config.data)).toEqual({ record_type: "FlowApp::Card", record_id: 900, values: { 101: "high", 106: null } });
    return [200, { field_values: {} }];
  });
  await fieldsApi.setValues(card, { 101: "high", 106: null });
});

it("links a record with the field's own record class", async () => {
  mock.onPost(`${CORE}/field_record_selections`).reply((config) => {
    expect(JSON.parse(config.data)).toEqual({ core_field_definition_id: 103, record_type: "FlowApp::Card", record_id: 900, linked_record_type: "Core::Tag", linked_record_id: 503 });
    return [201, { field_record_selection: { id: 7009, core_field_definition_id: 103, linked_record_type: "Core::Tag", linked_record_id: 503 } }];
  });
  await expect(fieldsApi.addSelection(labels, card, 503)).resolves.toEqual({ selectionId: 7009, recordId: 503, recordType: "Core::Tag" });
});

it("pages a picker's choices and sends a search only when there is one", async () => {
  mock.onGet(`${CORE}/record_options`, { params: { field_definition_id: 103, page: 1, per_page: 20 } }).reply(200, {
    record_options: [{ id: 501, label: "Frontend", color: "#3b82f6" }],
    meta: { pagy: { page: 1, pages: 2 } },
  });
  await expect(fieldsApi.recordOptions(103, "  ", 1)).resolves.toEqual({ options: [{ id: 501, label: "Frontend", color: "#3b82f6" }], page: 1, pages: 2 });
});

it("uploads a file as multipart with the definition and the record", async () => {
  mock.onPost(`${CORE}/field_attachments`).reply((config) => {
    const form = config.data as FormData;
    expect(form.get("core_field_definition_id")).toBe("107");
    expect(form.get("record_type")).toBe("FlowApp::Card");
    expect(form.get("record_id")).toBe("900");
    return [201, { attachment: { id: 802, core_field_definition_id: 107, record_type: "FlowApp::Card", record_id: 900, file: { filename: "a.png", content_type: "image/png", byte_size: 10, url: "/rails/x/a.png" } } }];
  });
  const def = { ...labels, id: 107, fieldType: "attachments" as const };
  await expect(fieldsApi.upload(def, card, { uri: "file:///a.png", name: "a.png", mimeType: "image/png" })).resolves.toMatchObject({ id: 802, filename: "a.png", byteSize: 10 });
});

it("creates a definition under the owner, letting the server make the key", async () => {
  mock.onPost(`${CORE}/field_definitions`).reply((config) => {
    expect(JSON.parse(config.data)).toEqual({ field_definition: { owner_type: "FlowApp::Project", owner_id: 7, name: "Size", field_type: "single_select", required: false, config: { options: [{ value: "s", label: "S", color: "#3b82f6" }] } } });
    return [201, { field_definition: { id: 120, name: "Size", key: "size", field_type: "single_select", position: 9, required: false, config: { options: [{ value: "s", label: "S", color: "#3b82f6" }] }, owner_type: "FlowApp::Project", owner_id: 7 } }];
  });
  const made = await fieldsApi.createDefinition("FlowApp::Project", 7, { name: "Size", fieldType: "single_select", required: false, config: { options: [{ value: "s", label: "S", color: "#3b82f6" }] } });
  expect(made.config.options).toEqual([{ value: "s", label: "S", color: "#3b82f6" }]);
});

it("reads a config's numbers and options, keeping the raw config", () => {
  const c = parseConfig({ min: "0", max: 999, options: [{ value: "a" }, { nope: true }], scope: "project_members", extra: 1 });
  expect(c).toMatchObject({ min: 0, max: 999, scope: "project_members", options: [{ value: "a", label: "a", color: null }] });
  expect(c.raw.extra).toBe(1);
});

it("makes an option key from its label", () => {
  expect(optionKey("  Très Urgent! ")).toBe("tres_urgent");
  expect(optionKey("!!!")).toBe("");
});
