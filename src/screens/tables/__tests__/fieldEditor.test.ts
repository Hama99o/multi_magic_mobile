/**
 * The column editor's rules (6c), checked against the web's FieldEditor.tsx
 * and defaultValue.ts, rule for rule.
 */
import type { FieldDefinition } from "@/api/fields";
import { blockedBy, cycleColor, defaultPayload, draftFrom, fieldBody, moveOption, newOption, targetsFor, typesFor, type FieldDraft, type OptionDraft } from "../fieldEditor";
import { OPTION_PALETTE } from "../palette";

const def = (id: number, fieldType: string, raw: Record<string, unknown> = {}, options: { value: string; label: string; color: string | null }[] = []) =>
  ({ id, name: `F${id}`, fieldType, config: { options, min: null, max: null, allowCreate: false, scope: null, raw } }) as unknown as FieldDefinition;
const opts: OptionDraft[] = [
  { key: "in", value: "in", label: "In stock", color: OPTION_PALETTE[3] },
  { key: "new-1", label: "Back soon", color: OPTION_PALETTE[4] },
];
const draft = (over: Partial<FieldDraft>): FieldDraft => ({ ...draftFrom(null, null), ...over });

describe("which types are offered", () => {
  it("the title column cannot be a link, a time stamp, files or a computed column", () => {
    expect(typesFor({ isPrimary: true, hasLinkColumn: true, current: "text" })).toEqual(["text", "long_text", "decimal", "phone", "email", "url", "single_select", "multi_select", "date", "boolean"]);
  });
  it("a lookup or rollup needs a link column to read through, unless it already is one", () => {
    expect(typesFor({ isPrimary: false, hasLinkColumn: false, current: null })).not.toContain("lookup");
    expect(typesFor({ isPrimary: false, hasLinkColumn: false, current: "rollup" })).toContain("rollup");
    expect(typesFor({ isPrimary: false, hasLinkColumn: true, current: null })).toEqual(expect.arrayContaining(["lookup", "rollup", "multi_record"]));
  });
  it("a rollup adds up number columns; a lookup shows any plain column", () => {
    const linked = [def(1, "text"), def(2, "decimal"), def(3, "multi_record"), def(4, "attachments"), def(5, "date")];
    expect(targetsFor("rollup", linked).map((f) => f.id)).toEqual([2]);
    expect(targetsFor("lookup", linked).map((f) => f.id)).toEqual([1, 2, 5]);
  });
});

describe("a column read as a draft", () => {
  it("keeps its options, description, default (as option keys) and link settings", () => {
    const status = def(2, "single_select", { description: "Where it is", default: "in" }, [{ value: "in", label: "In stock", color: OPTION_PALETTE[3] }]);
    expect(draftFrom(status, null)).toMatchObject({ name: "F2", type: "single_select", description: "Where it is", defaultValue: "in", options: [{ key: "in", value: "in", label: "In stock" }] });
    expect(draftFrom(def(3, "multi_record", { table_id: 12 }), "many_to_one")).toMatchObject({ linkTableId: 12, relation: "many_to_one" });
    expect(draftFrom(def(7, "rollup", { link_field_id: 3, target_field_id: 9, function: "sum" }), null)).toMatchObject({ linkFieldId: 3, targetFieldId: 9, rollup: "sum" });
  });
  it("a colour the palette does not know becomes the first one (the web's own palette only)", () => {
    expect(draftFrom(def(2, "single_select", {}, [{ value: "x", label: "X", color: "green" }]), null).options[0].color).toBe(OPTION_PALETTE[0]);
  });
});

describe("the default, as the server takes it", () => {
  it("labels for options (a new option has no value yet), true for ticked, trimmed text, null for none", () => {
    expect(defaultPayload("single_select", "new-1", opts)).toBe("Back soon");
    expect(defaultPayload("multi_select", ["in", "new-1"], opts)).toEqual(["In stock", "Back soon"]);
    expect(defaultPayload("multi_select", [], opts)).toBeNull();
    expect(defaultPayload("boolean", true, [])).toBe(true);
    expect(defaultPayload("boolean", false, [])).toBeNull();
    expect(defaultPayload("text", "  hi ", [])).toBe("hi");
    expect(defaultPayload("date", "today", [])).toBe("today");
  });
  it("a type that keeps no default sends nothing at all", () => {
    expect(defaultPayload("attachments", "", [])).toBeUndefined();
    expect(defaultPayload("lookup", "", [])).toBeUndefined();
  });
});

describe("when Save is off", () => {
  it("a name, one named option, a link's table, a computed column's link and target", () => {
    expect(blockedBy(draft({ name: " " }), [])).toBe("name");
    expect(blockedBy(draft({ name: "S", type: "single_select", options: [{ key: "a", label: " ", color: OPTION_PALETTE[0] }] }), [])).toBe("options");
    expect(blockedBy(draft({ name: "L", type: "multi_record" }), [])).toBe("linkTable");
    expect(blockedBy(draft({ name: "R", type: "rollup" }), [])).toBe("linkColumn");
    expect(blockedBy(draft({ name: "R", type: "rollup", linkFieldId: 3, rollup: "sum", targetFieldId: 9 }), [])).toBe("target");
    expect(blockedBy(draft({ name: "R", type: "rollup", linkFieldId: 3, rollup: "count" }), [])).toBeNull(); // a count needs no target
    expect(blockedBy(draft({ name: "Name" }), [])).toBeNull();
  });
});

describe("the body sent", () => {
  it("a new select: its type, named options in order (no value on a new one), its default as a label", () => {
    expect(fieldBody(draft({ name: " Status ", type: "single_select", options: [...opts, { key: "e", label: " ", color: OPTION_PALETTE[0] }], defaultValue: "in" }), null)).toEqual({
      field: { name: "Status", description: "", field_type: "single_select", options: [{ value: "in", label: "In stock", color: OPTION_PALETTE[3] }, { label: "Back soon", color: OPTION_PALETTE[4] }], default_value: "In stock" },
    });
  });
  it("an edit that keeps the type does not send it; a link sends its relation only when it changes", () => {
    const link = draft({ name: "Office", type: "multi_record", linkTableId: 12, relation: "many_to_one" });
    expect(fieldBody(link, { type: "multi_record", relation: "many_to_one" })).toEqual({ field: { name: "Office", description: "", link_table_id: 12 } });
    expect(fieldBody({ ...link, relation: "one_to_one" }, { type: "multi_record", relation: "many_to_one" }).field.relation).toBe("one_to_one");
  });
  it("a rollup sends its link, its function, and a target only when it needs one", () => {
    expect(fieldBody(draft({ name: "Total", type: "rollup", linkFieldId: 3, rollup: "count", targetFieldId: 9 }), null).field).toMatchObject({ link_field_id: 3, target_field_id: null, function: "count" });
    expect(fieldBody(draft({ name: "Total", type: "rollup", linkFieldId: 3, rollup: "sum", targetFieldId: 9 }), null).field).toMatchObject({ target_field_id: 9, function: "sum" });
  });
});

describe("options", () => {
  it("a new option takes an unused colour; a tap cycles the palette; options move one place", () => {
    expect(newOption(opts).color).toBe(OPTION_PALETTE[0]);
    expect(cycleColor(OPTION_PALETTE[8])).toBe(OPTION_PALETTE[0]);
    expect(moveOption(opts, 1, -1).map((o) => o.key)).toEqual(["new-1", "in"]);
    expect(moveOption(opts, 0, -1)).toBe(opts);
  });
});
