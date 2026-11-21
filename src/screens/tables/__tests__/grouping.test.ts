import type { FieldDefinition } from "@/api/fields";
import type { RecordRow } from "@/api/tables";
import { GROUP_HEADER, layoutOf, listItems } from "../grouping";

const status = { id: 2, name: "Status", fieldType: "single_select", config: { options: [{ value: "in", label: "In stock", color: "#10b981" }, { value: "out", label: "Sold out", color: null }], min: null, max: null, allowCreate: false, scope: null, raw: {} } } as unknown as FieldDefinition;
const row = (id: number, s: string | null): RecordRow => ({ id, position: id, createdAt: "", updatedAt: "", values: s ? { 2: { kind: "scalar", value: s } } : {}, linkLabels: {}, linkCounts: {} });

it("puts a header before each group, with the server's count for the whole view", () => {
  const items = listItems([row(1, "in"), row(2, "in"), row(3, "out"), row(4, null)], status, { in: 7, out: 1, "": 2 }, new Set());
  expect(items.map((i) => (i.kind === "header" ? `[${i.label ?? "none"} ${i.count}]` : i.row.id))).toEqual(["[In stock 7]", 1, 2, "[Sold out 1]", 3, "[none 2]", 4]);
});

it("a folded group keeps its header and hides its rows", () => {
  const items = listItems([row(1, "in"), row(2, "out")], status, null, new Set(["in"]));
  expect(items.map((i) => (i.kind === "header" ? `[${i.key}${i.folded ? " folded" : ""}]` : i.row.id))).toEqual(["[in folded]", "[out]", 2]);
});

it("ungrouped is just the rows; offsets add the two fixed heights", () => {
  expect(listItems([row(1, "in")], null, null, new Set())).toEqual([{ kind: "row", row: row(1, "in"), index: 0 }]);
  const items = listItems([row(1, "in"), row(2, "in")], status, null, new Set());
  expect(layoutOf(items, 100)).toEqual([{ length: GROUP_HEADER, offset: 0 }, { length: 100, offset: GROUP_HEADER }, { length: 100, offset: GROUP_HEADER + 100 }]);
});
