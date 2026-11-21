/**
 * Storage (parity #6): the server's numbers, read as the web reads them.
 * Invented values only.
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "../http";
import { parseStorage, storageApi } from "../storage";

let mock: MockAdapter;
beforeEach(() => (mock = new MockAdapter(http)));
afterEach(() => mock.restore());

it("reads usage, the apps holding something (biggest first) and the largest files", async () => {
  mock.onGet("/api/v1/storage").reply(200, {
    storage: {
      total_bytes: 3_000_000,
      limit_bytes: 10_000_000,
      available_bytes: 7_000_000,
      percent_used: 30,
      trashed_bytes: 500_000,
      by_app: { page_app: 2_000_000, notes: 0, contacts: 400_000, doc: 600_000 },
      largest_files: [{ id: 9, title: "Holiday.mov", space_id: 3, trashed: true, byte_size: 1_500_000, content_type: "video/quicktime" }],
    },
  });
  const usage = await storageApi.show();
  expect(usage).toMatchObject({ totalBytes: 3_000_000, limitBytes: 10_000_000, percentUsed: 30, trashedBytes: 500_000 });
  expect(usage.byApp).toEqual([
    { app: "page_app", bytes: 2_000_000 },
    // Biggest first, not the server's key order (contacts comes before doc there).
    { app: "doc", bytes: 600_000 },
    { app: "contacts", bytes: 400_000 },
  ]);
  expect(usage.largestFiles).toEqual([{ id: 9, title: "Holiday.mov", spaceId: 3, trashed: true, byteSize: 1_500_000, contentType: "video/quicktime" }]);
});

it("keeps the percentage between 0 and 100, and drops a file it cannot read rather than the whole view", () => {
  const usage = parseStorage({ storage: { total_bytes: 12, limit_bytes: 10, percent_used: 120, largest_files: [{ title: "no id" }, { id: 1, space_id: 2, byte_size: 5 }] } });
  expect(usage.percentUsed).toBe(100);
  expect(usage.largestFiles.map((f) => f.id)).toEqual([1]);
});
