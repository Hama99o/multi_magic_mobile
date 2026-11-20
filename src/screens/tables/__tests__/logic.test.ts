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
