/**
 * Transfers (parity #12, #25, #28, #33, #34): exports, imports and big copies
 * run in the background on the server; the phone starts one, follows it, and
 * fetches the ZIP when it is done. Invented values only.
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "../http";
import { isFinished, parseTransfer, transfersApi } from "../transfers";
import { pagesApi } from "../pages";

let mock: MockAdapter;
beforeEach(() => (mock = new MockAdapter(http)));
afterEach(() => mock.restore());

const raw = (over: Record<string, unknown> = {}) => ({
  id: 41, kind: "export", state: "processing", progress: 40, message: "Zipping 12 files", error: null,
  target_type: "PageApp::Space", target_id: 3, result_space_id: null, result_node_id: null,
  artifact_url: null, artifact_filename: null, created_at: "2026-11-20T21:00:00Z", updated_at: "2026-11-20T21:00:05Z", ...over,
});

it("reads a transfer, its loopback artifact made absolute for the phone", () => {
  const base = (http.defaults.baseURL ?? "").replace(/\/$/, "");
  const t = parseTransfer(raw({ state: "done", progress: 100, artifact_url: "http://localhost:3020/rails/active_storage/blobs/redirect/x/Family.zip", artifact_filename: "Family.zip" }));
  expect(t).toMatchObject({ id: 41, kind: "export", state: "done", progress: 100, artifactFilename: "Family.zip" });
  expect(t.artifactUrl).toBe(`${base}/rails/active_storage/blobs/redirect/x/Family.zip`);
  expect(isFinished(t)).toBe(true);
  expect(isFinished(parseTransfer(raw()))).toBe(false);
  expect(isFinished(parseTransfer(raw({ state: "failed", error: "Too big" })))).toBe(true);
});

it("an unknown state is never taken for finished, so the phone keeps asking", () => {
  expect(isFinished(parseTransfer(raw({ state: "paused" })))).toBe(false);
});

it("exports a space, or one folder of it", async () => {
  mock.onPost("/api/v1/page_app/transfers/export").reply(201, { transfer: raw() });
  await transfersApi.exportSpace(3);
  await transfersApi.exportNode(3, 12);
  expect(JSON.parse(mock.history.post[0].data)).toEqual({ space_id: 3 });
  expect(JSON.parse(mock.history.post[1].data)).toEqual({ space_id: 3, node_id: 12 });
});

it("imports a ZIP as a new space, or into a folder", async () => {
  mock.onPost("/api/v1/page_app/transfers/import").reply(201, { transfer: raw({ kind: "import", state: "enqueued" }) });
  const zip = { uri: "file:///cache/Archive.zip", name: "Archive.zip", mimeType: "application/zip" };
  await transfersApi.importZip(zip, {});
  await transfersApi.importZip(zip, { spaceId: 3, parentNodeId: 12 });
  expect([...(mock.history.post[0].data as FormData).keys()]).toEqual(["file"]);
  expect([...(mock.history.post[1].data as FormData).keys()]).toEqual(["file", "space_id", "parent_node_id"]);
});

it("follows and cancels a transfer", async () => {
  mock.onGet("/api/v1/page_app/transfers/41").reply(200, { transfer: raw({ progress: 80 }) });
  mock.onDelete("/api/v1/page_app/transfers/41").reply(204);
  expect((await transfersApi.show(41)).progress).toBe(80);
  await transfersApi.cancel(41);
  expect(mock.history.delete).toHaveLength(1);
});

it("a copy answers a node when small, a transfer when big; the target is sent only when given", async () => {
  mock.onPost("/api/v1/page_app/spaces/3/nodes/9/duplicate").replyOnce(201, { node: { id: 99, page_app_space_id: 3, title: "Notes (copy)", kind: "file", updated_at: "2026-11-20T21:00:00Z" } }).onPost("/api/v1/page_app/spaces/3/nodes/9/duplicate").replyOnce(202, { transfer: raw({ kind: "copy", state: "enqueued" }) });
  const small = await pagesApi.duplicate(3, 9);
  expect(small).toMatchObject({ node: { id: 99 } });
  expect(JSON.parse(mock.history.post[0].data)).toEqual({});
  const big = await pagesApi.duplicate(3, 9, { targetSpaceId: 5, parentId: null });
  expect(big).toMatchObject({ transfer: { kind: "copy", state: "enqueued" } });
  expect(JSON.parse(mock.history.post[1].data)).toEqual({ target_space_id: 5, parent_id: null });
});
