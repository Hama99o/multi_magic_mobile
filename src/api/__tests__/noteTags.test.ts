/**
 * Note labels: the web's note tags (multi_magic NoteApp::Tag; Keep's labels,
 * owner 2026-11-13). The same store the web uses: /note_app/tags and the
 * notes' toggle_tag / create_and_assign_tag.
 */
import MockAdapter from "axios-mock-adapter";
import { noteTagsApi } from "../noteTags";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;
const tag = (id: number, name: string, color = "no_color") => ({ id, name, color, created_at: "2026-11-01T10:00:00Z", parent_id: null, position: id, description: null });
const note = (over: Record<string, unknown> = {}) => ({
  id: 7, title: "T", description: "", data: {}, status: "published", pinned: false, created_at: "2026-11-01T10:00:00Z",
  deleted_at: null, updated_at: "2026-11-12T09:00:00Z", is_shared: false, role: "owner", shared_users: [], shared_count: 0, tags: [], color: null, ...over,
});

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
});
afterEach(() => mock.restore());

it("lists every label, across pages, in the web's order", async () => {
  mock.onGet("/api/v1/note_app/tags").reply((cfg) => {
    const page = cfg.params.page;
    return [200, { tags: page === 1 ? [tag(1, "dev-stuff", "teal")] : [tag(2, "home")], meta: { pagy: { page, pages: 2 } } }];
  });
  expect(await noteTagsApi.list()).toEqual([
    { id: 1, name: "dev-stuff", color: "teal" },
    { id: 2, name: "home", color: null },
  ]);
});

it("creates, renames and deletes a label as the web does (tag: {name})", async () => {
  mock.onPost("/api/v1/note_app/tags").reply(200, { tag: tag(5, "ideas") });
  mock.onPut("/api/v1/note_app/tags/5").reply(200, { tag: tag(5, "big ideas") });
  mock.onDelete("/api/v1/note_app/tags/5").reply(200, { tag: tag(5, "big ideas") });
  expect(await noteTagsApi.create("ideas")).toEqual({ id: 5, name: "ideas", color: null });
  expect(JSON.parse(mock.history.post[0].data)).toEqual({ tag: { name: "ideas" } });
  expect(await noteTagsApi.rename(5, "big ideas")).toEqual({ id: 5, name: "big ideas", color: null });
  expect(JSON.parse(mock.history.put[0].data)).toEqual({ tag: { name: "big ideas" } });
  await noteTagsApi.remove(5);
  expect(mock.history.delete).toHaveLength(1);
});

it("puts a label on a note or takes it off (toggle_tag), and reads the note back", async () => {
  mock.onPut("/api/v1/note_app/notes/7/toggle_tag").reply(200, { note: note({ tags: [tag(1, "dev-stuff", "teal")] }) });
  const n = await noteTagsApi.toggleOnNote(7, 1);
  expect(JSON.parse(mock.history.put[0].data)).toEqual({ tag_id: 1 });
  expect(n.tags).toEqual([{ id: 1, name: "dev-stuff", color: "teal" }]);
});

it("creates a label straight on a note (create_and_assign_tag)", async () => {
  mock.onPost("/api/v1/note_app/notes/7/create_and_assign_tag").reply(200, { note: note({ tags: [tag(9, "new one")] }) });
  const n = await noteTagsApi.createOnNote(7, "new one");
  expect(JSON.parse(mock.history.post[0].data)).toEqual({ name: "new one" });
  expect(n.tags[0].name).toBe("new one");
});
