import type { FieldDefinition } from "@/api/fields";
import type { RecordRow } from "@/api/tables";
import { columnValue, dayOf, EMPTY_COLUMN, kanbanColumns, monthFilters, monthRange, rowsByDay } from "../boardViews";

const status = { id: 2, fieldType: "single_select", config: { options: [{ value: "todo", label: "To do", color: "#3b82f6" }, { value: "done", label: "Done", color: null }], min: null, max: null, allowCreate: false, scope: null, raw: {} } } as unknown as FieldDefinition;
const due = { id: 6, fieldType: "date" } as unknown as FieldDefinition;
const row = (id: number, values: Record<number, unknown>): RecordRow => ({
  id, position: id, createdAt: "", updatedAt: "",
  values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { kind: "scalar", value: v }])),
  linkLabels: {}, linkCounts: {},
});

describe("kanban", () => {
  it("one column per option in order, then Empty; each with its rows and the server's count", () => {
    const cols = kanbanColumns(status, [row(1, { 2: "done" }), row(2, { 2: "todo" }), row(3, {}), row(4, { 2: "gone" })], { todo: 4, done: 1, "": 2 });
    expect(cols.map((c) => [c.label, c.rows.map((r) => r.id), c.count])).toEqual([
      ["To do", [2], 4],
      ["Done", [1], 1],
      // A value no option has any more falls into Empty, never out of sight.
      [null, [3, 4], 2],
    ]);
  });

  it("moving to Empty clears the value", () => {
    expect(columnValue(EMPTY_COLUMN)).toBeNull();
    expect(columnValue("done")).toBe("done");
  });
});

describe("calendar", () => {
  it("asks for the month on screen, first to last day, leap years included", () => {
    expect(monthRange("2026-11-20")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthFilters(6, "2026-12-05")).toEqual([
      { fieldId: 6, op: "on_or_after", value: "2026-12-01" },
      { fieldId: 6, op: "on_or_before", value: "2026-12-31" },
    ]);
  });

  it("puts each row on its day; a datetime counts on its day; no date stays off the grid", () => {
    const rows = [row(1, { 6: "2026-11-20" }), row(2, { 6: "2026-11-20T09:00:00Z" }), row(3, {}), row(4, { 6: "2026-11-21" })];
    const days = rowsByDay(rows, due);
    expect(days.get("2026-11-20")?.map((r) => r.id)).toEqual([1, 2]);
    expect(days.get("2026-11-21")?.map((r) => r.id)).toEqual([4]);
    expect(dayOf(rows[2], due)).toBeNull();
  });
});
