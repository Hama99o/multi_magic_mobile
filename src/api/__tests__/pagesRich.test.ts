/**
 * New page and saving a page's body (parity #22, #50): the web's payloads
 * (`NodeViewer` autosave: `{ node: { content: { html } } }`). Invented values.
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "../http";
import { pagesApi } from "../pages";

let mock: MockAdapter;
beforeEach(() => (mock = new MockAdapter(http)));
afterEach(() => mock.restore());

const page = { id: 50, page_app_space_id: 3, parent_id: 12, title: "Trip plan", kind: "page", updated_at: "2026-11-20T21:00:00Z", content: { html: "<p>Day 1</p>" } };

it("a new page is a node of kind page, in its folder, with an empty body", async () => {
  mock.onPost("/api/v1/page_app/spaces/3/nodes").reply(201, { node: page });
  const made = await pagesApi.createPage(3, 12, "Trip plan");
  expect(JSON.parse(mock.history.post[0].data)).toEqual({ node: { kind: "page", title: "Trip plan", parent_id: 12, content: { html: "" } } });
  expect(made).toMatchObject({ id: 50, kind: "page", html: "<p>Day 1</p>" });
});

it("a page at the space's root sends no parent", async () => {
  mock.onPost("/api/v1/page_app/spaces/3/nodes").reply(201, { node: { ...page, parent_id: null } });
  await pagesApi.createPage(3, null, "Root page");
  expect(JSON.parse(mock.history.post[0].data).node).not.toHaveProperty("parent_id");
});

it("saving a page sends its html as content, as the web's autosave does", async () => {
  mock.onPatch("/api/v1/page_app/spaces/3/nodes/50").reply(200, { node: page });
  await pagesApi.savePage(3, 50, "<p>Day 1</p><p>Day 2</p>");
  expect(JSON.parse(mock.history.patch[0].data)).toEqual({ node: { content: { html: "<p>Day 1</p><p>Day 2</p>" } } });
});
