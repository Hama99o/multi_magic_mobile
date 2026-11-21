/**
 * Export, after the click (increment 7): ready at once, ready after a wait,
 * failed, or left to the bell. The waiting is injected, so no clock runs.
 */
import type { TableExport } from "@/api/tables";
import { POLL_TRIES, settleExport } from "../exportFlow";

const ex = (over: Partial<TableExport>): TableExport => ({ id: 7, tableId: 10, status: "pending", format: "xlsx", rowCount: null, filename: null, errorMessage: null, ready: false, ...over });
const noWait = jest.fn(async () => undefined);

beforeEach(() => noWait.mockClear());

it("a small view is ready at once: no polling at all", async () => {
  const status = jest.fn();
  expect(await settleExport(ex({ ready: true, status: "done" }), status, noWait)).toMatchObject({ kind: "ready" });
  expect(status).not.toHaveBeenCalled();
});

it("a bigger one is polled until it is ready", async () => {
  const status = jest.fn().mockResolvedValueOnce(ex({ status: "running" })).mockResolvedValueOnce(ex({ status: "done", ready: true, filename: "Items.xlsx" }));
  const out = await settleExport(ex({}), status, noWait);
  expect(out).toEqual({ kind: "ready", export: expect.objectContaining({ filename: "Items.xlsx" }) });
  expect(status).toHaveBeenCalledTimes(2);
});

it("a failure says the server's reason", async () => {
  const status = jest.fn().mockResolvedValueOnce(ex({ status: "failed", errorMessage: "Too many rows" }));
  expect(await settleExport(ex({}), status, noWait)).toEqual({ kind: "failed", message: "Too many rows" });
});

it("past the wait, the bell takes over instead of a spinner", async () => {
  const status = jest.fn(async () => ex({ status: "running" }));
  expect(await settleExport(ex({}), status, noWait)).toMatchObject({ kind: "background" });
  expect(status).toHaveBeenCalledTimes(POLL_TRIES);
});
