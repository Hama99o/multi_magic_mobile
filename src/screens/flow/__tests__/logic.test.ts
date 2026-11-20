/**
 * Flow's rules, each against the source it was read from: the server's
 * policies for who may do what, the web's board for what a tile shows, and
 * `reorder_action.rb` for how positions are numbered.
 */
import type { Card } from "@/api/flow";
import { parseDefinition, type FieldDefinition } from "@/api/fields";
import {
  canDeleteCard,
  canDeleteComment,
  colorHex,
  columnCards,
  dueOf,
  initials,
  isOverdue,
  labelsOf,
  matches,
  NO_FILTER,
  orderOf,
  placeCard,
  powersOf,
  priorityOf,
  roleIn,
} from "../logic";

const def = (raw: Record<string, unknown>): FieldDefinition =>
  parseDefinition({ owner_type: "FlowApp::Project", owner_id: 7, position: 0, required: false, config: {}, record_class: null, core_tag_category_id: null, ...raw });

const FIELDS = [
  def({ id: 101, name: "Priority", key: "priority", field_type: "single_select", config: { options: ["none", "low", "medium", "high", "critical"].map((value) => ({ value, label: value })) } }),
  def({ id: 103, name: "Labels", key: "labels", field_type: "multi_record", record_class: "Core::Tag", core_tag_category_id: 50 }),
  def({ id: 104, name: "Assignees", key: "assignees", field_type: "multi_record", record_class: "User" }),
  def({ id: 106, name: "Due Date", key: "due_date", field_type: "date" }),
];

const card = (cardId: number, over: Partial<Card> = {}): Card => ({
  id: cardId, projectId: 7, columnId: 1, sprintId: null, title: `Card ${cardId}`, description: null, position: cardId, dueDate: null,
  creator: { id: 1, name: "A" }, commentsCount: 0, fieldValues: {}, createdAt: "", updatedAt: "", ...over,
});
const withPriority = (value: string) => ({ 101: { kind: "scalar" as const, value } });

describe("who may do what (app/policies/flow_app)", () => {
  it("gives each role exactly its powers", () => {
    expect(powersOf("owner")).toEqual({ manage: true, deleteProject: true, editCards: true, comment: true });
    expect(powersOf("admin")).toEqual({ manage: true, deleteProject: false, editCards: true, comment: true });
    expect(powersOf("member")).toEqual({ manage: false, deleteProject: false, editCards: true, comment: true });
    expect(powersOf("viewer")).toEqual({ manage: false, deleteProject: false, editCards: false, comment: true });
  });

  it("takes the server's role, else recognises the owner by id", () => {
    expect(roleIn({ myRole: "viewer", owner: { id: 1, name: "" } }, 1)).toBe("viewer");
    expect(roleIn({ myRole: null, owner: { id: 1, name: "" } }, 1)).toBe("owner");
    expect(roleIn({ myRole: null, owner: { id: 1, name: "" } }, 2)).toBe("member");
  });

  it("lets a card's creator delete it even as a member", () => {
    expect(canDeleteCard("member", 1, card(1))).toBe(true);
    expect(canDeleteCard("member", 2, card(1))).toBe(false);
    expect(canDeleteCard("admin", 2, card(1))).toBe(true);
  });

  it("lets the author or an admin delete a comment", () => {
    const comment = { user: { id: 3, name: "" } };
    expect(canDeleteComment("viewer", 3, comment)).toBe(true);
    expect(canDeleteComment("member", 2, comment)).toBe(false);
    expect(canDeleteComment("admin", 2, comment)).toBe(true);
  });
});

describe("what a tile shows", () => {
  it("shows no badge for priority none", () => {
    expect(priorityOf(card(1, { fieldValues: withPriority("none") }), FIELDS)).toBeNull();
    expect(priorityOf(card(1, { fieldValues: withPriority("high") }), FIELDS)?.value).toBe("high");
  });

  it("shows the Due Date FIELD, falling back to the card's own date", () => {
    expect(dueOf(card(1, { dueDate: "2026-01-01", fieldValues: { 106: { kind: "scalar", value: "2026-11-25" } } }), FIELDS)).toBe("2026-11-25");
    expect(dueOf(card(1, { dueDate: "2026-01-01" }), FIELDS)).toBe("2026-01-01");
  });

  it("is overdue strictly before today", () => {
    expect(isOverdue("2026-11-19", "2026-11-20")).toBe(true);
    expect(isOverdue("2026-11-20", "2026-11-20")).toBe(false);
    expect(isOverdue(null, "2026-11-20")).toBe(false);
  });

  it("finds labels in the labels field's own category, in the card's order", () => {
    const tags = { 50: [{ id: 501, label: "Frontend", color: null, position: 0, categoryId: 50 }, { id: 503, label: "Bug", color: null, position: 2, categoryId: 50 }] };
    const c = card(1, { fieldValues: { 103: { kind: "records", selections: [{ selectionId: 1, recordId: 503, recordType: "Core::Tag" }, { selectionId: 2, recordId: 999, recordType: "Core::Tag" }] } } });
    expect(labelsOf(c, FIELDS, tags).map((t) => t.label)).toEqual(["Bug"]);
  });

  it("makes two-letter initials", () => {
    expect(initials("Ada Lovelace King")).toBe("AK");
    expect(initials("ada")).toBe("AD");
    expect(initials("  ")).toBe("?");
  });
});

describe("filter and order", () => {
  it("filters by title, priority (none included), assignee and label", () => {
    const a = card(1, { title: "Fix login", fieldValues: { ...withPriority("high"), 104: { kind: "records", selections: [{ selectionId: 1, recordId: 9, recordType: "User" }] } } });
    const b = card(2, { title: "Write docs" });
    expect([a, b].filter((c) => matches(c, { ...NO_FILTER, q: "LOGIN" }, FIELDS))).toEqual([a]);
    expect([a, b].filter((c) => matches(c, { ...NO_FILTER, priorities: ["none"] }, FIELDS))).toEqual([b]);
    expect([a, b].filter((c) => matches(c, { ...NO_FILTER, assigneeIds: [9] }, FIELDS))).toEqual([a]);
    expect([a, b].filter((c) => matches(c, { ...NO_FILTER, labelIds: [1] }, FIELDS))).toEqual([]);
  });

  it("orders a column by position, or by priority most urgent first", () => {
    const cards = [card(1, { position: 2, fieldValues: withPriority("low") }), card(2, { position: 1 }), card(3, { position: 3, fieldValues: withPriority("critical") }), card(4, { columnId: 2 })];
    expect(columnCards(cards, 1, FIELDS).map((c) => c.id)).toEqual([2, 1, 3]);
    expect(columnCards(cards, 1, FIELDS, "priority").map((c) => c.id)).toEqual([3, 1, 2]);
  });

  it("places a moved card and renumbers both columns from 1", () => {
    const cards = [card(1, { position: 1 }), card(2, { position: 2 }), card(3, { position: 3 }), card(4, { columnId: 2, position: 1 })];
    const moved = placeCard(cards, 2, 2, 0);
    expect(orderOf(moved, 2)).toEqual([2, 4]);
    expect(orderOf(moved, 1)).toEqual([1, 3]);
    expect(moved.find((c) => c.id === 3)?.position).toBe(2);
    // Inside one column, to the end.
    expect(orderOf(placeCard(cards, 1, 1, 99), 1)).toEqual([2, 3, 1]);
  });
});

it("reads a project's colour name and a column's hex alike", () => {
  expect(colorHex("green")).toBe("#22c55e");
  expect(colorHex("#a855f7")).toBe("#a855f7");
  expect(colorHex("chartreuse")).toBeNull();
  expect(colorHex(null)).toBeNull();
});
