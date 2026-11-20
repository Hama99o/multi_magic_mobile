/**
 * The personal layer (SPEC C1, the owner's rule of 2026-11-20): what a person
 * changes on the phone (filter, sort, search, group, hidden fields, card
 * lines) is theirs alone. It shapes the query and is never written to the
 * shared view. And newest first by default where the view has no sort (C3).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FieldDefinition } from "@/api/fields";
import type { View } from "@/api/tables";
import { cardFields, differsFromShared, effectiveQuery, layerKey, moveField, orderedFields, readLayer, visibleFields, writeLayer } from "../personalView";

const view = (config: Partial<View["config"]> = {}): View => ({
  id: 70,
  name: "Grid",
  viewType: "grid",
  position: 0,
  config: {
    search: "",
    match: "and",
    filters: [],
    sorts: [],
    groupByFieldId: null,
    hiddenFieldIds: [],
    fieldOrder: [],
    rowHeight: "short",
    rowColorFieldId: null,
    coverFieldId: null,
    kanbanFieldId: null,
    calendarFieldId: null,
    ...config,
  },
});

const f = (id: number, name: string, position = id): FieldDefinition =>
  ({ id, name, key: `f${id}`, fieldType: "text", recordClass: null, tagCategoryId: null, position, required: false, config: { options: [], min: null, max: null, allowCreate: false, scope: null, raw: {} }, ownerType: "TableApp::Table", ownerId: 10 }) as FieldDefinition;

describe("effectiveQuery", () => {
  it("newest first when the view has no sort and the person chose nothing", () => {
    expect(effectiveQuery(view(), {})).toEqual({ search: "", filters: [], match: "and", sorts: [], groupBy: null, newestFirst: true });
  });

  it("a view with its own sort keeps it: newest first is only the default for an unsorted view", () => {
    const sorted = view({ sorts: [{ fieldId: 1, direction: "asc" }] });
    expect(effectiveQuery(sorted, {})).toMatchObject({ sorts: [{ fieldId: 1, direction: "asc" }], newestFirst: false });
  });

  it("'Table order' turns the default off", () => {
    expect(effectiveQuery(view(), { newestFirst: false }).newestFirst).toBe(false);
  });

  it("the personal layer wins over the shared view, key by key", () => {
    const shared = view({ filters: [{ fieldId: 2, op: "any_of", value: ["in"] }], search: "old", groupByFieldId: 2 });
    const q = effectiveQuery(shared, { search: "scarf", groupBy: null });
    expect(q).toMatchObject({ search: "scarf", filters: [{ fieldId: 2, op: "any_of", value: ["in"] }], groupBy: null });
  });

  it("a personal sort replaces the view's, and switches newest first off", () => {
    expect(effectiveQuery(view(), { sorts: [{ fieldId: 3, direction: "desc" }] })).toMatchObject({ sorts: [{ fieldId: 3, direction: "desc" }], newestFirst: false });
  });
});

it("a condition still being filled in stays out of the query", () => {
  const q = effectiveQuery(view(), { filters: [{ fieldId: 2, op: "any_of", value: [] }, { fieldId: 3, op: "empty", value: null }] });
  expect(q.filters).toEqual([{ fieldId: 3, op: "empty", value: null }]);
});

describe("differsFromShared: the tint on the toolbar", () => {
  it("nothing chosen, or newest first by default, is the shared view", () => {
    expect(differsFromShared(view(), {})).toBe(false);
  });

  it("a filter, a search or 'Table order' is personal", () => {
    expect(differsFromShared(view(), { filters: [{ fieldId: 2, op: "empty", value: null }] })).toBe(true);
    expect(differsFromShared(view(), { search: "x" })).toBe(true);
    expect(differsFromShared(view(), { newestFirst: false })).toBe(true);
  });

  it("choosing what the view already says is not a difference", () => {
    expect(differsFromShared(view({ groupByFieldId: 2 }), { groupBy: 2 })).toBe(false);
    expect(differsFromShared(view(), { search: "  " })).toBe(false);
  });
});

describe("which fields show", () => {
  const fields = [f(1, "Name"), f(2, "Status"), f(3, "Supplier"), f(4, "Photos"), f(5, "Notes"), f(6, "Price")];

  it("the view's order, without its hidden fields", () => {
    const v = view({ fieldOrder: [3, 1, 2], hiddenFieldIds: [4] });
    expect(visibleFields(fields, v, {}).map((x) => x.id)).toEqual([3, 1, 2, 5, 6]);
  });

  it("a card shows the title, then at most three others", () => {
    expect(cardFields(fields, 1, view(), {}).map((x) => x.id)).toEqual([2, 3, 4]);
  });

  it("the person's order wins over the view's (the owner's call), and a new field keeps its place at the end", () => {
    const v = view({ fieldOrder: [3, 1, 2] });
    expect(orderedFields(fields, v, { fieldOrder: [2, 1] }).map((x) => x.id)).toEqual([2, 1, 3, 4, 5, 6]);
    expect(differsFromShared(v, { fieldOrder: [2, 1] })).toBe(true);
    expect(differsFromShared(v, { fieldOrder: [3, 1, 2] })).toBe(false);
  });

  it("moves one field up or down, never past an end", () => {
    expect(moveField([1, 2, 3], 3, -1)).toEqual([1, 3, 2]);
    expect(moveField([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveField([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });

  it("the person's hidden fields and card fields win", () => {
    expect(cardFields(fields, 1, view(), { hiddenFieldIds: [2, 3] }).map((x) => x.id)).toEqual([4, 5, 6]);
    expect(cardFields(fields, 1, view(), { cardFieldIds: [6, 1, 99] }).map((x) => x.id)).toEqual([6]);
  });
});

describe("storage: on this device, per person and per view", () => {
  beforeEach(() => AsyncStorage.clear());

  it("keys by user and view", () => {
    expect(layerKey(7, 70)).toBe("tables.view.7.70");
  });

  it("round-trips, and a damaged entry reads as nothing chosen", async () => {
    await writeLayer(7, 70, { search: "scarf", newestFirst: false });
    expect(await readLayer(7, 70)).toEqual({ search: "scarf", newestFirst: false });
    await AsyncStorage.setItem(layerKey(7, 71), "{not json");
    expect(await readLayer(7, 71)).toEqual({});
  });

  it("writing an empty layer removes it ('Back to the shared view')", async () => {
    await writeLayer(7, 70, { search: "x" });
    await writeLayer(7, 70, {});
    expect(await AsyncStorage.getItem(layerKey(7, 70))).toBeNull();
  });
});
