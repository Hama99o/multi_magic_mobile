/**
 * Replace a file, its versions, and a Markdown edit (parity #37, #39, #49).
 * Invented values only.
 */
import MockAdapter from "axios-mock-adapter";

import { http } from "../http";
import { pagesApi } from "../pages";

const written: { uri: string; text: string }[] = [];
jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    create() {}
  }
  class File {
    uri: string;
    name: string;
    constructor(dir: { uri: string } | string, name?: string) {
      this.uri = typeof dir === "string" ? dir : `${dir.uri}/${name}`;
      this.name = name ?? "";
    }
    create() {}
    write(text: string) {
      written.push({ uri: this.uri, text });
    }
  }
  return { Directory, File, Paths: { cache: "file:///cache" } };
});

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  written.length = 0;
});
afterEach(() => mock.restore());

const node = { id: 9, page_app_space_id: 3, title: "Budget.xlsx", kind: "file", updated_at: "2026-11-20T21:00:00Z" };

it("replace sends only the new file, as node[attachment], with no timeout", async () => {
  mock.onPatch("/api/v1/page_app/spaces/3/nodes/9").reply(200, { node });
  await pagesApi.replaceFile(3, 9, { uri: "file:///cache/Budget-v2.xlsx", name: "Budget-v2.xlsx", mimeType: "application/vnd.ms-excel" });
  const req = mock.history.patch[0];
  expect([...(req.data as FormData).keys()]).toEqual(["node[attachment]"]);
  expect(req.timeout).toBe(0);
});

it("versions: newest first, sizes and who made each, the url made absolute", async () => {
  const base = (http.defaults.baseURL ?? "").replace(/\/$/, "");
  mock.onGet("/api/v1/page_app/spaces/3/nodes/9/versions").reply(200, {
    versions: [
      { id: 1, created_at: "2026-11-01T10:00:00Z", byte_size: 100, content_type: "text/plain", filename: "a.txt", url: "/rails/active_storage/blobs/proxy/1/a.txt", created_by: { id: 2, fullname: "Ada" } },
      { id: 2, created_at: "2026-11-10T10:00:00Z", byte_size: 200, content_type: "text/plain", filename: "a.txt", url: null, created_by: null },
    ],
  });
  const versions = await pagesApi.versions(3, 9);
  expect(versions.map((v) => v.id)).toEqual([2, 1]);
  expect(versions[1]).toMatchObject({ byteSize: 100, createdBy: "Ada", url: `${base}/rails/active_storage/blobs/proxy/1/a.txt` });
  expect(versions[0]).toMatchObject({ url: null, createdBy: null });
});

it("restores and deletes a version", async () => {
  mock.onPost("/api/v1/page_app/spaces/3/nodes/9/versions/2/restore").reply(200, { node });
  mock.onDelete("/api/v1/page_app/spaces/3/nodes/9/versions/1").reply(204);
  expect((await pagesApi.restoreVersion(3, 9, 2)).id).toBe(9);
  await pagesApi.deleteVersion(3, 9, 1);
  expect(mock.history.delete).toHaveLength(1);
});

it("a Markdown edit is the new text as the file's new version, under the file's own name", async () => {
  mock.onPatch("/api/v1/page_app/spaces/3/nodes/9").reply(200, { node: { ...node, title: "Notes.md" } });
  await pagesApi.updateText(3, 9, "# Hello\n", "Notes.md");
  expect(written[0].text).toBe("# Hello\n");
  expect(written[0].uri).toMatch(/Notes\.md$/);
  expect([...(mock.history.patch[0].data as FormData).keys()]).toEqual(["node[attachment]"]);
});
