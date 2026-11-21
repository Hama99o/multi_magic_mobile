/**
 * Note links (parity #26, #51). Invented values only.
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "../http";
import { noteLinksApi } from "../noteLinks";

let mock: MockAdapter;
beforeEach(() => (mock = new MockAdapter(http)));
afterEach(() => mock.restore());

it("lists a node's linked notes in their order, the note's title embedded", async () => {
  mock.onGet("/api/v1/page_app/spaces/3/nodes/9/note_links").reply(200, {
    note_links: [
      { id: 2, position: 1, page_app_node_id: 9, note_app_note_id: 20, note: { id: 20, title: "Second" } },
      { id: 1, position: 0, page_app_node_id: 9, note_app_note_id: 10, note: { id: 10, title: "First" } },
      { position: 2 },
    ],
  });
  const { rows, unreadable } = await noteLinksApi.list(3, 9);
  expect(rows).toEqual([
    { id: 1, position: 0, noteId: 10, noteTitle: "First" },
    { id: 2, position: 1, noteId: 20, noteTitle: "Second" },
  ]);
  expect(unreadable).toBe(1);
});

it("links a note at a position, and unlinks", async () => {
  mock.onPost("/api/v1/page_app/spaces/3/nodes/9/note_links").reply(201, { note_link: { id: 5, position: 2, note_app_note_id: 30, note: { id: 30, title: "Trip" } } });
  mock.onDelete("/api/v1/page_app/spaces/3/nodes/9/note_links/5").reply(200, { message: "Note unlinked" });
  expect(await noteLinksApi.create(3, 9, 30, 2)).toEqual({ id: 5, position: 2, noteId: 30, noteTitle: "Trip" });
  expect(JSON.parse(mock.history.post[0].data)).toEqual({ note_id: 30, position: 2 });
  await noteLinksApi.remove(3, 9, 5);
  expect(mock.history.delete).toHaveLength(1);
});
