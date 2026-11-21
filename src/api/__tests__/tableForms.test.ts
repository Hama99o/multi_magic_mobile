/**
 * Table forms (increment 8), at the HTTP layer: the owner view read, a change
 * sent in the server's names, invites, and the public link.
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "@/api/http";
import { API_URL } from "@/config/env";
import { formBody, publicFormUrl, tableFormsApi } from "../tableForms";

const B = "/api/v1/table_app";
let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
});
afterEach(() => mock.restore());

export const ownerView = (over: Record<string, unknown> = {}) => ({
  id: 7, table_id: 10, base_id: 3, name: "Orders", slug: "abc123", access_mode: "public",
  fields: [{ field_id: 1, label: "Your name", help: null, placeholder: null, required: true, hidden: false }],
  settings: { title: "Order a scarf", language: "ps" }, accepting: true, allow_multiple: false, closes_at: null, max_submissions: null,
  submissions_count: 3, closed: false, cover_url: "/rails/active_storage/x/cover.jpg",
  available_fields: [{ id: 1, name: "Name", field_type: "text", required: true, supported: true }, { id: 4, name: "Office", field_type: "multi_record", required: false, supported: false }],
  invites: [], ...over,
});

it("reads the owner view: questions, settings, the cover through the app, which columns a form can ask", async () => {
  mock.onGet(`${B}/forms/7`).reply(200, { form: ownerView() });
  const f = await tableFormsApi.show(7);
  expect(f.questions).toEqual([{ fieldId: 1, label: "Your name", help: null, placeholder: null, required: true, hidden: false }]);
  expect(f.settings.language).toBe("ps");
  expect(f.coverUrl).toBe(`${API_URL}/rails/active_storage/x/cover.jpg`);
  expect(f.availableFields.map((a) => [a.id, a.supported])).toEqual([[1, true], [4, false]]);
});

it("a change goes in the server's names, questions as `fields`, only what changed", () => {
  expect(formBody({ accessMode: "invited", allowMultiple: true, maxSubmissions: null })).toEqual({ form: { access_mode: "invited", allow_multiple: true, max_submissions: null } });
  expect(formBody({ questions: [{ fieldId: 1, label: null, help: "Full name", placeholder: null, required: true, hidden: false }] })).toEqual({ form: { fields: [{ field_id: 1, label: "", help: "Full name", placeholder: "", required: true, hidden: false }] } });
  expect(formBody({ settings: { submit_label: "Order" } })).toEqual({ form: { settings: { submit_label: "Order" } } });
});

it("invites send the addresses and read back the form", async () => {
  mock.onPost(`${B}/forms/7/invites`).reply(201, { invited: ["a@x.test"], skipped: [], form: ownerView({ access_mode: "invited", invites: [{ id: 2, email: "a@x.test", joined: false, used_at: null }] }) });
  const out = await tableFormsApi.invite(7, ["a@x.test"]);
  expect(JSON.parse(mock.history.post[0].data)).toEqual({ emails: ["a@x.test"] });
  expect(out.form.invites).toEqual([{ id: 2, email: "a@x.test", joined: false, usedAt: null }]);
});

it("the page people fill is the web's /f/:slug", () => {
  expect(publicFormUrl("abc123")).toBe(`${API_URL}/f/abc123`);
});
