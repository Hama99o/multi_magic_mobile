/**
 * The filter and sort rules (increment 3), against the web's
 * (`pages/table_app/filters.ts` at multi_magic e9adf512), which is the
 * server's `RecordQuery::OPERATORS`.
 */
import type { FieldDefinition } from "@/api/fields";
import { addSort, defaultCondition, directionSet, groupable, isComplete, kindOf, OPERATORS, parseNumber, retarget, sortable, withOperator } from "../filters";

const f = (id: number, fieldType: string) => ({ id, name: `F${id}`, key: `f${id}`, fieldType, recordClass: null, tagCategoryId: null, position: id, required: false, config: { options: [], min: null, max: null, allowCreate: false, scope: null, raw: {} }, ownerType: "TableApp::Table", ownerId: 1 }) as FieldDefinition;

it("each column type has the web's kind and operators", () => {
  expect(kindOf(f(1, "phone"))).toBe("text");
  expect(kindOf(f(1, "rollup"))).toBe("number");
  expect(kindOf(f(1, "created_time"))).toBe("datetime");
  expect(kindOf(f(1, "multi_record"))).toBe("link");
  expect(OPERATORS[kindOf(f(1, "multi_select"))]).toEqual(["any_of", "all_of", "none_of", "empty", "not_empty"]);
  expect(OPERATORS.link).toEqual(["not_empty", "empty"]);
});

it("a new condition has its column's first operator and an empty value of the right shape", () => {
  expect(defaultCondition(f(2, "single_select"))).toEqual({ fieldId: 2, op: "any_of", value: [] });
  expect(defaultCondition(f(3, "boolean"))).toEqual({ fieldId: 3, op: "is", value: true });
  expect(defaultCondition(f(4, "text"))).toEqual({ fieldId: 4, op: "contains", value: null });
});

it("an unfinished condition stays out of the query; empty / not empty need no value", () => {
  expect(isComplete({ fieldId: 1, op: "contains", value: "" })).toBe(false);
  expect(isComplete({ fieldId: 1, op: "any_of", value: [] })).toBe(false);
  expect(isComplete({ fieldId: 1, op: "empty", value: null })).toBe(true);
  expect(isComplete({ fieldId: 1, op: "is", value: 0 })).toBe(true);
});

it("a new column resets the condition; a valueless operator drops the value", () => {
  const c = { fieldId: 4, op: "contains", value: "scarf" };
  expect(retarget(c, f(4, "text"))).toBe(c);
  expect(retarget(c, f(2, "single_select"))).toEqual({ fieldId: 2, op: "any_of", value: [] });
  expect(withOperator(c, "empty")).toEqual({ fieldId: 4, op: "empty", value: null });
  expect(withOperator(c, "is")).toEqual({ fieldId: 4, op: "is", value: "scarf" });
});

it("sorts skip links and files; groups are single selects; directions read by type", () => {
  expect(sortable([f(1, "text"), f(2, "multi_record"), f(3, "attachments")]).map((x) => x.id)).toEqual([1]);
  expect(groupable([f(1, "text"), f(2, "single_select"), f(3, "multi_select")]).map((x) => x.id)).toEqual([2]);
  expect(directionSet(f(1, "phone"))).toBe("number");
  expect(directionSet(f(1, "single_select"))).toBe("option");
  expect(directionSet(f(1, "created_time"))).toBe("date");
});

it("a French number reads with its comma; a column sorted twice is moved, not doubled", () => {
  expect(parseNumber("1,5")).toBe(1.5);
  expect(parseNumber(" 12 ")).toBe(12);
  expect(parseNumber("abc")).toBeNull();
  expect(addSort([{ fieldId: 1, direction: "desc" }, { fieldId: 2, direction: "asc" }], 1)).toEqual([{ fieldId: 2, direction: "asc" }, { fieldId: 1, direction: "asc" }]);
});
