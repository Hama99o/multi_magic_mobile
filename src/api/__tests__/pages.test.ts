/**
 * Pages at the boundary, against what the server SENT
 * (`qa/capture_fixtures.py pages_`, 2026-11-06, the QA account's "QA Pages"
 * space: one folder, a 3 MB binary, a 1-pixel PNG and a page).
 *
 * Re-capture, never edit — see `contract.test.ts`.
 */
import fs from "fs";
import path from "path";
import MockAdapter from "axios-mock-adapter";
import { http, __resetTokenCache } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { pagesApi, safeFileName } from "../pages";

type Fixture = { status: number; request: string; body: unknown };
const load = (name: string): Fixture =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", `${name}.json`), "utf8"));

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
});
afterEach(() => mock.restore());

describe("every captured row parses", () => {
  it("the spaces", async () => {
    mock.onGet("/api/v1/page_app/spaces").reply(200, load("pages_spaces").body);
    const page = await pagesApi.spaces(1);
    expect(page.unreadable).toBe(0);
    expect(page.rows.map((s) => s.title)).toContain("QA Pages");
    expect(page.hasMore).toBe(false);
  });

  it("one space, with the caller's permission", async () => {
    mock.onGet(/\/spaces\/\d+$/).reply(200, load("pages_space_show").body);
    const space = await pagesApi.space(1);
    expect(space.permission).toBe("owner");
  });

  it("a folder's files, with absolute URLs and the byte size", async () => {
    mock.onGet(/\/nodes$/).reply(200, load("pages_folder").body);
    const page = await pagesApi.children(1, 2, 1, { sortBy: "created_at", sortDir: "desc" });
    expect(page.unreadable).toBe(0);
    const png = page.rows.find((n) => n.title === "probe-pixel.png")!;
    expect(png.kind).toBe("file");
    expect(png.mimeType).toBe("image/png");
    expect(png.fileSize).toBe(70);
    // The server sends a PATH (`only_path: true`); an <Image> given a path
    // renders nothing, so it must leave here absolute.
    expect(png.attachmentUrl).toMatch(/^https?:\/\/.+\/rails\/active_storage\/blobs\/proxy\//);
    expect(png.thumbnailUrl).toMatch(/^https?:\/\//);
    const bin = page.rows.find((n) => n.title === "probe-3mb.bin")!;
    expect(bin.fileSize).toBe(3 * 1024 * 1024);
    expect(bin.thumbnailUrl).toBeNull();
  });

  it("a page, with its html and its breadcrumb", async () => {
    mock.onGet(/\/nodes\/\d+$/).reply(200, load("pages_node_page").body);
    const node = await pagesApi.node(1, 2);
    expect(node.kind).toBe("page");
    expect(node.html).toContain("QA page body");
    expect(node.ancestors.map((a) => a.title)).toEqual(["QA uploads"]);
  });

  it("Recent, where every row says which space it is in", async () => {
    mock.onGet("/api/v1/page_app/drive/nodes").reply(200, load("pages_drive_recent").body);
    const page = await pagesApi.drive("recent");
    expect(page.unreadable).toBe(0);
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((n) => n.space?.title === "QA Pages")).toBe(true);
    // The server leaves folders out of Recent (`drive_controller.rb`).
    expect(page.rows.some((n) => n.kind === "folder")).toBe(false);
  });

  it("the empty lists (Trash, Shared with me) as lists, not as failures", async () => {
    mock.onGet("/api/v1/page_app/drive/nodes").reply(200, load("pages_drive_trash").body);
    mock.onGet("/api/v1/page_app/spaces/shared_with_me").reply(200, load("pages_shared").body);
    await expect(pagesApi.drive("trash")).resolves.toMatchObject({ rows: [], unreadable: 0 });
    await expect(pagesApi.sharedWithMe()).resolves.toMatchObject({ rows: [], unreadable: 0 });
  });
});

describe("the requests the screens send", () => {
  it("sends parent_id EMPTY for a space's root — a missing key lists the whole space flattened", async () => {
    mock.onGet(/\/nodes$/).reply(200, load("pages_root").body);
    await pagesApi.children(7, null);
    expect(mock.history.get[0].params).toMatchObject({ parent_id: "", page: 1 });
  });

  it("names the folder, the sort, the type and the kind it asks for", async () => {
    mock.onGet(/\/nodes$/).reply(200, load("pages_root_folders").body);
    const page = await pagesApi.children(7, 42, 2, { sortBy: "size", sortDir: "desc", type: "video", kind: "folder" });
    expect(mock.history.get[0].url).toBe("/api/v1/page_app/spaces/7/nodes");
    expect(mock.history.get[0].params).toEqual({
      page: 2,
      parent_id: "42",
      sort_by: "size",
      sort_dir: "desc",
      content_type: "video",
      kind: "folder",
    });
    expect(page.rows.every((n) => n.kind === "folder")).toBe(true);
  });

  it("asks the drive for a view, and trims a search", async () => {
    mock.onGet("/api/v1/page_app/drive/nodes").reply(200, load("pages_drive_trash").body);
    await pagesApi.drive("search", 1, { search: "  clip  " });
    expect(mock.history.get[0].params).toMatchObject({ view: "search", search: "clip" });
  });

  it("creates a folder as the web does: kind folder, the parent, the title", async () => {
    mock.onPost("/api/v1/page_app/spaces/7/nodes").reply(201, { node: load("pages_root_folders").body && (load("pages_root_folders").body as { nodes: unknown[] }).nodes[0] });
    await pagesApi.createFolder(7, null, "2026-11-06");
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ node: { title: "2026-11-06", kind: "folder", parent_id: null } });
  });
});

describe("a row the parser cannot read", () => {
  // A kind the app does not know yet: the server growing a fourth one must
  // cost that row, not every row beside it.
  it("is counted, not allowed to fail the folder", async () => {
    const body = load("pages_folder").body as { nodes: Record<string, unknown>[] };
    const broken = { ...body, nodes: [...body.nodes, { ...body.nodes[0], id: 9999, kind: "shortcut" }] };
    mock.onGet(/\/nodes$/).reply(200, broken);
    const page = await pagesApi.children(1, 2);
    expect(page.rows).toHaveLength(body.nodes.length);
    expect(page.unreadable).toBe(1);
  });
});

describe("safeFileName", () => {
  it("keeps a normal name", () => expect(safeFileName("IMG_0042.MOV")).toBe("IMG_0042.MOV"));
  it("never lets a title become a path", () => expect(safeFileName("a/b\\c:d")).toBe("a_b_c_d"));
  it("names an empty title", () => expect(safeFileName("  ")).toBe("file"));
});

/**
 * EMPTY TRASH when a folder and its own child are both at the top of the trash
 * (the web's bug of 2026-11-09, in the same shape here). The server lists a
 * child trashed BEFORE its folder as its own trash root
 * (`DriveController#trash_roots`), and destroying the folder takes the child
 * with it (`dependent: :destroy`), so the child's own delete then answers 404.
 * That 404 used to throw and stop the whole empty half-way, saying it failed.
 * A 404 here means "already gone", which is exactly what was asked.
 */
describe("emptyTrash", () => {
  const template = load("pages_drive_recent").body as { meta: unknown; nodes: Record<string, unknown>[] };
  const row = (id: number, parentId: number | null, kind = "file") =>
    ({ ...template.nodes[0], id, parent_id: parentId, kind, deleted_at: "2026-11-09T10:00:00.000Z" });
  const trashPage = (nodes: Record<string, unknown>[]) => ({ ...template, nodes });

  it("does not ask for a child its folder already took, and finishes", async () => {
    const deletes: string[] = [];
    mock
      .onGet("/api/v1/page_app/drive/nodes").replyOnce(200, trashPage([row(10, null, "folder"), row(12, 10)]))
      .onGet("/api/v1/page_app/drive/nodes").reply(200, trashPage([]));
    mock.onDelete(/destroy_permanently$/).reply((config) => {
      deletes.push(config.url!);
      return config.url!.includes("/nodes/12/") ? [404, { error: "not_found" }] : [200, {}];
    });

    await expect(pagesApi.emptyTrash()).resolves.toBe(2);
    expect(deletes).toEqual(["/api/v1/page_app/spaces/315/nodes/10/destroy_permanently"]);
  });

  it("an item somebody else already deleted (404) counts as done, not as a failure", async () => {
    mock
      .onGet("/api/v1/page_app/drive/nodes").replyOnce(200, trashPage([row(20, null), row(21, null)]))
      .onGet("/api/v1/page_app/drive/nodes").reply(200, trashPage([]));
    mock.onDelete(/\/nodes\/20\/destroy_permanently$/).reply(404, { error: "not_found" });
    mock.onDelete(/\/nodes\/21\/destroy_permanently$/).reply(200, {});

    await expect(pagesApi.emptyTrash()).resolves.toBe(2);
  });

  it("a real refusal still stops it and says so", async () => {
    mock.onGet("/api/v1/page_app/drive/nodes").reply(200, trashPage([row(30, null)]));
    mock.onDelete(/destroy_permanently$/).reply(403, { error: "forbidden" });

    await expect(pagesApi.emptyTrash()).rejects.toBeTruthy();
  });
});
