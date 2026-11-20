import type { RecordRow } from "@/api/tables";
import { newestProven } from "../logic";

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
  });
});
