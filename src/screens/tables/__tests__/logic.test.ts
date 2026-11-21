import type { RecordRow } from "@/api/tables";
import { newestProven } from "../logic";
import { moveTable } from "../AdminSheets";

const row = (id: number, createdAt: string): RecordRow => ({ id, position: id, createdAt, updatedAt: createdAt, values: {}, linkLabels: {}, linkCounts: {} });

describe("newestProven: the chip says Newest first only when the rows show it", () => {
  it("rows newest first: proven", () => {
    expect(newestProven([row(3, "2026-11-20T10:03:00Z"), row(2, "2026-11-20T10:02:00Z"), row(1, "2026-11-20T10:01:00Z")])).toBe(true);
  });
  it("an older server's table order (oldest on top): not proven", () => {
    expect(newestProven([row(1, "2026-11-20T10:01:00Z"), row(2, "2026-11-20T10:02:00Z")])).toBe(false);
  });
  it("one row, or rows all made in the same instant: nothing to prove, so nothing claimed", () => {
    expect(newestProven([row(1, "2026-11-20T10:01:00Z")])).toBe(false);
    expect(newestProven([row(1, "2026-11-20T10:01:00Z"), row(2, "2026-11-20T10:01:00Z")])).toBe(false);
  });
});

describe("newestProven on a board or a grouped list: newest first WITHIN each group (qa_phone, 2026-11-21)", () => {
  // The server sorts by group first, then newest: [in 503, in 501, out 502]. Across groups 502 is
  // newer than 501, so a check over the whole page hid the chip on every board, and with it the
  // only way to Table order, which "Move up" needs.
  const rows = [row(503, "2026-11-20T10:03:00Z"), row(501, "2026-11-20T10:01:00Z"), row(502, "2026-11-20T10:02:00Z")];
  const keyOf = (r: RecordRow) => (r.id === 502 ? "out" : "in");
  it("proven within each group, though not across them", () => {
    expect(newestProven(rows)).toBe(false);
    expect(newestProven(rows, keyOf)).toBe(true);
  });
  it("one group out of order: not proven", () => {
    expect(newestProven([row(501, "2026-11-20T10:01:00Z"), row(503, "2026-11-20T10:03:00Z")], () => "in")).toBe(false);
  });
  it("only single-row groups: nothing to prove", () => {
    expect(newestProven([row(1, "2026-11-20T10:01:00Z"), row(2, "2026-11-20T10:02:00Z")], (r) => String(r.id))).toBe(false);
  });
});

describe("the typed name must be the name EXACTLY (the owner, 2026-11-20)", () => {
  // Imported here so the test fails red while `nameMatches` does not exist.
  const { nameMatches } = jest.requireActual<typeof import("../logic")>("../logic");
  it("only the exact text unlocks: case, spaces and accents count; nothing is trimmed or folded", () => {
    expect(nameMatches("QA table", "QA table")).toBe(true);
    expect(nameMatches("qa table", "QA table")).toBe(false);
    expect(nameMatches("QA table ", "QA table")).toBe(false);
    expect(nameMatches(" QA table", "QA table")).toBe(false);
    expect(nameMatches("Clients reguliers", "Clients réguliers")).toBe(false);
    expect(nameMatches("QA  table", "QA table")).toBe(false);
    expect(nameMatches("", "")).toBe(false);
    // multi-magic-83's demo bases on :3020, which its server refuses the same way (422).
    expect(nameMatches("Budget 2027", "Budget  2027")).toBe(false);
    expect(nameMatches("Budget  2027", "Budget  2027")).toBe(true);
    expect(nameMatches("Ete", "Été")).toBe(false);
    expect(nameMatches("été", "Été")).toBe(false);
    expect(nameMatches("Été", "Été")).toBe(true);
  });
});

describe("moveTable (6a: the tables in order)", () => {
  it("moves one place either way and keeps the rest in order; an edge or an unknown id changes nothing", () => {
    expect(moveTable([10, 11, 12], 10, 1)).toEqual([11, 10, 12]);
    expect(moveTable([10, 11, 12], 12, -1)).toEqual([10, 12, 11]);
    expect(moveTable([10, 11, 12], 10, -1)).toEqual([10, 11, 12]);
    expect(moveTable([10, 11, 12], 12, 1)).toEqual([10, 11, 12]);
    expect(moveTable([10, 11, 12], 99, 1)).toEqual([10, 11, 12]);
  });
});
