/**
 * The Contacts app at the HTTP layer: every call, in the server's own shapes
 * (`ContactApp::ContactSerializer`, `contact_params`, `VcardActions`), read
 * 2026-11-12 from multi_magic `contacts-api`.
 */
import MockAdapter from "axios-mock-adapter";
import { contactsApi, displayName, documentRefusal, DOCUMENT_MAX_BYTES, ImportNotSupported, __parse } from "../contacts";
import { ApiShapeError } from "../parse";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

/** The full view, field for field. */
const jamil = {
  id: 7,
  firstname: "Jamil",
  lastname: "Safi",
  nickname: null,
  company: "Acme",
  job_title: "Driver",
  favorite: true,
  birth_date: "1990-04-05",
  user_id: 3,
  email: "jamil@home.test",
  phone: "+93 70 123 4567",
  address: "12 Main St, Kabul",
  tags: ["school", "chess club"],
  gender: "male",
  closeness: "close",
  is_self: false,
  maiden_name: null,
  deceased_on: null,
  age: 36,
  fullname: "Jamil SAFI",
  photo_url: "/rails/active_storage/blobs/proxy/abc/p.jpg",
  phones: [
    { label: "mobile", value: "+93 70 123 4567" },
    { label: "work", value: "020 123 456" },
  ],
  emails: [
    { label: "home", value: "jamil@home.test" },
    { label: "work", value: "jamil@work.test" },
  ],
  website: "https://jamil.test",
  notes: "Met in Kabul",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  relations: [
    { id: 4, kind: "sibling", qualifier: "half", status: "current", label: "half-sister",
      relative: { id: 8, name: "Anisa SAFI", gender: "female", age: 30, deceased_on: null, closeness: "close", is_self: true } },
  ],
  addresses: [{ label: "home", street: "12 Main St", city: "Kabul", state: "", postal: "1001", country: "Afghanistan" }],
  social_links: [{ label: "linkedin", value: "https://linkedin.test/in/jamil" }, { label: "github", value: " " }],
  documents: [
    { id: 11, filename: "id.pdf", byte_size: 52_000, content_type: "application/pdf",
      url: "/rails/active_storage/blobs/proxy/d11/id.pdf", thumbnail_url: "/rails/active_storage/representations/proxy/t11/id.png" },
  ],
};

function listPage(contacts: unknown[], pageNo: number, pages: number) {
  return { contacts, meta: { pagy: { page: pageNo, pages }, total_count: 0 } };
}

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});
afterEach(() => mock.restore());

describe("reading a contact", () => {
  it("keeps EVERY phone and email with its label (the owner's second-email bug)", async () => {
    mock.onGet("/api/v1/contact_app/contacts/7").reply(200, { contact: jamil });
    const c = await contactsApi.show(7);

    expect(c.emails).toEqual([
      { label: "home", value: "jamil@home.test" },
      { label: "work", value: "jamil@work.test" },
    ]);
    expect(c.phones.map((p) => p.value)).toEqual(["+93 70 123 4567", "020 123 456"]);
  });

  it("reads the details, the family ties and an absolute photo url", async () => {
    mock.onGet("/api/v1/contact_app/contacts/7").reply(200, { contact: jamil });
    const c = await contactsApi.show(7);

    expect(c).toMatchObject({
      firstname: "Jamil", lastname: "Safi", company: "Acme", jobTitle: "Driver", favorite: true,
      birthDate: "1990-04-05", age: 36, website: "https://jamil.test", notes: "Met in Kabul",
    });
    expect(c.documents).toHaveLength(1);
    expect(c.relations).toEqual([{
      id: 4, kind: "sibling", qualifier: "half", status: "current", label: "half-sister",
      relative: { id: 8, name: "Anisa SAFI", gender: "female", age: 30, deceased: false, isSelf: true },
    }]);
    expect(c.addresses[0]).toMatchObject({ city: "Kabul", country: "Afghanistan" });
    expect(c.photoUrl).toMatch(/^https?:\/\/.+\/rails\/active_storage\/blobs\/proxy\/abc\/p\.jpg$/);
  });

  // Audit #24: the four fields the web has and the phone did not.
  it("reads social links, tags, gender and closeness", async () => {
    mock.onGet("/api/v1/contact_app/contacts/7").reply(200, { contact: jamil });
    const c = await contactsApi.show(7);
    expect(c.socialLinks).toEqual([{ label: "linkedin", value: "https://linkedin.test/in/jamil" }]);
    expect(c.tags).toEqual(["school", "chess club"]);
    expect(c.gender).toBe("male");
    expect(c.closeness).toBe("close");
  });

  it("keeps a gender or closeness it does not know as unknown / unset, and a list row's missing lists as empty", () => {
    const { social_links: _s, tags: _t, ...row } = jamil;
    const c = __parse.parseContact({ ...row, gender: "robot", closeness: 9 });
    expect([c.gender, c.closeness, c.socialLinks, c.tags]).toEqual(["unknown", "unset", [], []]);
  });

  it("reads an old relation without qualifier, status or relative details as a plain, current tie", () => {
    const c = __parse.parseContact({ ...jamil, relations: [{ id: 5, kind: "parent", label: "parent", relative: { id: 9, name: "Wali" } }] });
    expect(c.relations[0]).toEqual({
      id: 5, kind: "parent", qualifier: "biological", status: "current", label: "parent",
      relative: { id: 9, name: "Wali", gender: "unknown", age: null, deceased: false, isSelf: false },
    });
  });

  it("falls back to the legacy first value when a list row has no lists (a server before a0222268)", () => {
    const { phones: _p, emails: _e, ...old } = jamil;
    const c = __parse.parseContact(old);
    expect(c.phones).toEqual([{ label: "mobile", value: "+93 70 123 4567" }]);
    expect(c.emails).toEqual([{ label: "home", value: "jamil@home.test" }]);
  });

  it("drops blank entries and treats empty strings as nothing", () => {
    const c = __parse.parseContact({ ...jamil, phones: [{ label: "mobile", value: "  " }, null], company: "", notes: "" });
    expect([c.phones, c.company, c.notes]).toEqual([[], null, null]);
  });

  it("refuses a row without an id, loudly", () => {
    expect(() => __parse.parseContact({ ...jamil, id: "7" })).toThrow(ApiShapeError);
  });

  it("names a contact the way a person reads it", () => {
    expect(displayName({ firstname: "", lastname: "", nickname: null, company: "Acme" })).toBe("Acme");
    expect(displayName({ firstname: "Ana", lastname: "", nickname: "A", company: null })).toBe("Ana");
  });
});

describe("the whole address book", () => {
  it("reads every page, 100 at a time, and keeps one row per id", async () => {
    const a = { ...jamil, id: 1, firstname: "A" };
    const b = { ...jamil, id: 2, firstname: "B" };
    const seen: unknown[] = [];
    mock.onGet("/api/v1/contact_app/contacts").reply((config) => {
      seen.push(config.params);
      return config.params.page === 1 ? [200, listPage([a, b], 1, 2)] : [200, listPage([b], 2, 2)];
    });

    const all = await contactsApi.list();
    expect(all.map((c) => c.firstname)).toEqual(["A", "B"]);
    expect(seen).toEqual([{ page: 1, per_page: 100 }, { page: 2, per_page: 100 }]);
  });

  it("searches on the server with the trimmed term", async () => {
    let params: unknown;
    mock.onGet("/api/v1/contact_app/contacts").reply((config) => {
      params = config.params;
      return [200, listPage([jamil], 1, 1)];
    });
    await contactsApi.search("  0612 ");
    expect(params).toEqual({ search: "0612", page: 1, per_page: 100 });
  });

  it("reads the trash from its own endpoint", async () => {
    mock.onGet("/api/v1/contact_app/contacts/trashes").reply(200, listPage([jamil], 1, 1));
    expect((await contactsApi.trash()).map((c) => c.id)).toEqual([7]);
  });
});

describe("writing", () => {
  const payload = {
    firstname: "Sara", lastname: "K", nickname: "", company: "", job_title: "", website: "", notes: "",
    favorite: false, birth_date: null,
    phones: [{ label: "mobile", value: "0612345678" }, { label: "work", value: "0123" }],
    emails: [{ label: "home", value: "s@x.test" }],
    addresses: [],
    social_links: [{ label: "instagram", value: "https://instagram.test/sara" }],
    tags: ["neighbours"],
    gender: "female" as const,
    closeness: "regular" as const,
  };

  it("creates with the server's field names under `contact`", async () => {
    let body: unknown;
    mock.onPost("/api/v1/contact_app/contacts").reply((config) => {
      body = JSON.parse(config.data);
      return [201, { contact: { ...jamil, id: 9, firstname: "Sara" } }];
    });
    const made = await contactsApi.create(payload);
    expect(body).toEqual({ contact: payload });
    expect(made.id).toBe(9);
  });

  it("updates, favourites, trashes, restores and deletes forever on the right routes", async () => {
    const calls: string[] = [];
    mock.onAny().reply((config) => {
      calls.push(`${config.method?.toUpperCase()} ${config.url} ${config.data ?? ""}`.trim());
      return [200, { contact: jamil }];
    });
    await contactsApi.update(7, { notes: "x" });
    await contactsApi.setFavorite(7, false);
    await contactsApi.remove(7);
    await contactsApi.restore(7);
    await contactsApi.destroyForever(7);

    expect(calls).toEqual([
      'PUT /api/v1/contact_app/contacts/7 {"contact":{"notes":"x"}}',
      'PUT /api/v1/contact_app/contacts/7 {"contact":{"favorite":false}}',
      "DELETE /api/v1/contact_app/contacts/7",
      "PUT /api/v1/contact_app/contacts/7/restore",
      "DELETE /api/v1/contact_app/contacts/7/destroy_permanently",
    ]);
  });

  it("uploads a photo as multipart `photo`", async () => {
    let sent: FormData | null = null;
    mock.onPost("/api/v1/contact_app/contacts/7/upload_photo").reply((config) => {
      sent = config.data as FormData;
      return [200, { contact: jamil }];
    });
    await contactsApi.uploadPhoto(7, { uri: "file:///p.jpg", name: "p.jpg", mimeType: "image/jpeg" });
    expect(sent).toBeInstanceOf(FormData);
  });

  it("links a relative by id, kind and qualifier, and unlinks", async () => {
    let body: unknown;
    mock.onPost("/api/v1/contact_app/contacts/7/relations").reply((config) => {
      body = JSON.parse(config.data);
      return [201, { relations: jamil.relations }];
    });
    mock.onDelete("/api/v1/contact_app/contacts/7/relations/4").reply(204);
    const ties = await contactsApi.addRelation(7, { relativeId: 8, kind: "sibling", qualifier: "half" });
    await contactsApi.removeRelation(7, 4);
    expect(body).toEqual({ relative_id: 8, kind: "sibling", qualifier: "half" });
    expect(ties[0].label).toBe("half-sister");
  });

  // Web AddFamilyMemberModal "createNew": the person is made and linked in one call.
  it("creates a new relative and links them in one call", async () => {
    let body: unknown;
    mock.onPost("/api/v1/contact_app/contacts/7/relations").reply((config) => {
      body = JSON.parse(config.data);
      return [201, { relations: [] }];
    });
    await contactsApi.addRelation(7, { relative: { firstname: "Wali", lastname: "Safi", gender: "male" }, kind: "parent", qualifier: "biological" });
    expect(body).toEqual({ relative: { firstname: "Wali", lastname: "Safi", gender: "male" }, kind: "parent", qualifier: "biological" });
  });

  // Web FamilySection changeRole / changeQualifier → PATCH relations/:id.
  it("changes a tie's role (with the relative's gender) or its qualifier", async () => {
    const bodies: unknown[] = [];
    mock.onPatch("/api/v1/contact_app/contacts/7/relations/4").reply((config) => {
      bodies.push(JSON.parse(config.data));
      return [200, { relations: jamil.relations }];
    });
    const ties = await contactsApi.updateRelation(7, 4, { kind: "parent", relativeGender: "female" });
    await contactsApi.updateRelation(7, 4, { qualifier: "step" });
    expect(bodies).toEqual([{ kind: "parent", relative_gender: "female" }, { qualifier: "step" }]);
    expect(ties[0].id).toBe(4);
  });

  it("marks or unmarks the contact who is the user, and sets a gender", async () => {
    const sent: unknown[] = [];
    mock.onPut("/api/v1/contact_app/contacts/7").reply((config) => {
      sent.push(JSON.parse(config.data));
      return [200, { contact: jamil }];
    });
    await contactsApi.setSelf(7, true);
    await contactsApi.setSelf(7, false);
    await contactsApi.setGender(7, "female");
    expect(sent).toEqual([{ contact: { is_self: true } }, { contact: { is_self: false } }, { contact: { gender: "female" } }]);
  });
});

describe("the family tree", () => {
  // `ContactApp::FamilyTree`: nodes with a generation, the root at 0.
  it("reads the nodes with their generation and what they are to the root", async () => {
    mock.onGet("/api/v1/contact_app/contacts/7/family").reply(200, {
      root_id: 7,
      nodes: [
        { id: 9, name: "Wali Safi", generation: -1, gender: "male", relation: "father", is_self: false, deceased_on: "2020-01-01", age: 70 },
        { id: 7, name: "Jamil Safi", generation: 0, gender: "male", relation: null, is_self: true, deceased_on: null, age: 36 },
      ],
      edges: [{ from: 7, to: 9, kind: "parent", label: "father" }],
    });
    const tree = await contactsApi.family(7);
    expect(tree.rootId).toBe(7);
    expect(tree.nodes).toEqual([
      { id: 9, name: "Wali Safi", generation: -1, gender: "male", relation: "father", isSelf: false, deceased: true, age: 70 },
      { id: 7, name: "Jamil Safi", generation: 0, gender: "male", relation: null, isSelf: true, deceased: false, age: 36 },
    ]);
  });
});

describe("birthdays and duplicates", () => {
  it("reads upcoming birthdays with days to go and the age they turn", async () => {
    mock.onGet("/api/v1/contact_app/contacts/upcoming_birthdays").reply(200, {
      birthdays: [{ contact: jamil, in_days: 3, next_date: "2026-11-15", turning: 37 }],
    });
    const [b] = await contactsApi.birthdays();
    expect(b).toMatchObject({ inDays: 3, nextDate: "2026-11-15", turning: 37 });
    expect(b.contact.firstname).toBe("Jamil");
  });

  it("reads both duplicate reports", async () => {
    mock.onGet("/api/v1/contact_app/contacts/duplicates").reply(200, {
      by_email: [{ count: 2, contacts: [{ id: 1, fullname: "Ali", email: "a@x" }, { id: 2, fullname: "Ali K", email: "a@x" }] }],
      by_name: [],
    });
    const groups = await contactsApi.duplicates();
    expect(groups).toEqual([
      { reason: "email", contacts: [{ id: 1, name: "Ali", email: "a@x" }, { id: 2, name: "Ali K", email: "a@x" }] },
    ]);
  });
});

describe("import and export", () => {
  const summary = {
    summary: { created: 48, skipped: 2, failed: 0, total: 50 },
    created_ids: [1],
    skipped: [{ name: "Ali K", existing_id: 3 }, { name: "Twin", existing_id: 4 }],
    failed: [],
  };

  it("sends a chunk as `vcf` text and reads the summary", async () => {
    let body: unknown;
    mock.onPost("/api/v1/contact_app/contacts/import_vcard").reply((config) => {
      body = JSON.parse(config.data);
      return [201, summary];
    });
    const r = await contactsApi.importVcf("BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\n");
    expect(body).toEqual({ vcf: "BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\n" });
    expect(r).toEqual({ created: 48, skipped: 2, failed: 0, total: 50, skippedNames: ["Ali K", "Twin"], failedNames: [] });
  });

  it("reads 200 (all already there) and 422-with-summary (none saved) as results, not errors", async () => {
    mock.onPost("/api/v1/contact_app/contacts/import_vcard")
      .replyOnce(200, { ...summary, summary: { created: 0, skipped: 5, failed: 0, total: 5 } })
      .onPost("/api/v1/contact_app/contacts/import_vcard")
      .replyOnce(422, { summary: { created: 0, skipped: 0, failed: 2, total: 2 }, failed: [{ name: "X" }, { name: "Y" }] });
    expect((await contactsApi.importVcf("v")).skipped).toBe(5);
    expect((await contactsApi.importVcf("v")).failedNames).toEqual(["X", "Y"]);
  });

  it("refuses to pretend on a one-card server: no summary → ImportNotSupported", async () => {
    mock.onPost("/api/v1/contact_app/contacts/import_vcard").reply(201, { contact: jamil });
    await expect(contactsApi.importVcf("v")).rejects.toBeInstanceOf(ImportNotSupported);
  });

  it("surfaces the server's sentence when a file holds no card", async () => {
    mock.onPost("/api/v1/contact_app/contacts/import_vcard").reply(422, { message: "No contact found in this file." });
    await expect(contactsApi.importVcf("hello")).rejects.toThrow("No contact found in this file.");
  });

  it("exports one, several and all as vCard text", async () => {
    const urls: string[] = [];
    mock.onGet().reply((config) => {
      urls.push(`${config.url} ${JSON.stringify(config.params ?? {})}`);
      return [200, "BEGIN:VCARD\nEND:VCARD\n"];
    });
    expect(await contactsApi.exportVcf(7)).toBe("BEGIN:VCARD\nEND:VCARD\n");
    await contactsApi.exportVcf([1, 2]);
    await contactsApi.exportVcf("all");
    expect(urls).toEqual([
      "/api/v1/contact_app/contacts/7/export_vcard {}",
      '/api/v1/contact_app/contacts/export_multiple_contacts {"ids":[1,2]}',
      '/api/v1/contact_app/contacts/export_multiple_contacts {"all":true}',
    ]);
  });
});

// ── DOCUMENTS (web contacts.api.ts uploadDocuments / renameDocument / removeDocument,
// server AttachmentActions + ContactSerializer `documents`, read at 6de97a32) ──
describe("documents", () => {
  const doc = (id: number, filename: string, over: Record<string, unknown> = {}) => ({
    id, filename, byte_size: 1000 * id, content_type: "image/jpeg",
    url: `/rails/active_storage/blobs/proxy/d${id}/${filename}`, thumbnail_url: null, ...over,
  });

  it("reads them from the full view, newest first, with absolute urls", async () => {
    mock.onGet("/api/v1/contact_app/contacts/7").reply(200, {
      contact: { ...jamil, documents: [doc(3, "old.jpg"), doc(9, "new.pdf", { content_type: "application/pdf", thumbnail_url: "/rails/t9.png" })] },
    });
    const c = await contactsApi.show(7);
    expect(c.documents?.map((d) => d.filename)).toEqual(["new.pdf", "old.jpg"]);
    expect(c.documents?.[0]).toMatchObject({ id: 9, byteSize: 9000, contentType: "application/pdf" });
    expect(c.documents?.[0].url).toMatch(/^https?:\/\/.+\/rails\/active_storage\/blobs\/proxy\/d9\/new\.pdf$/);
    expect(c.documents?.[0].thumbnailUrl).toMatch(/^https?:\/\/.+\/rails\/t9\.png$/);
    expect(c.documents?.[1].thumbnailUrl).toBeNull();
  });

  it("a list row (no `documents` key) says it does not know, not that there are none", () => {
    const { documents: _d, ...row } = jamil;
    expect(__parse.parseContact(row).documents).toBeNull();
    expect(__parse.parseContact({ ...jamil, documents: [] }).documents).toEqual([]);
  });

  it("uploads every file as multipart `documents[]`, with a long timeout, and returns the contact", async () => {
    let sent: FormData | null = null;
    let headers: Record<string, unknown> = {};
    let timeout = 0;
    const appended: [string, { name?: string; type?: string; uri?: string }][] = [];
    const original = FormData.prototype.append;
    jest.spyOn(FormData.prototype, "append").mockImplementation(function (this: FormData, field: string, part: unknown) {
      appended.push([field, part as { name?: string }]);
      return original.call(this, field, String(part) as unknown as Blob);
    });
    mock.onPost("/api/v1/contact_app/contacts/7/upload_documents").reply((config) => {
      sent = config.data as FormData;
      headers = config.headers as Record<string, unknown>;
      timeout = config.timeout ?? 0;
      return [200, { contact: { ...jamil, documents: [doc(1, "a.jpg"), doc(2, "b.pdf")] } }];
    });
    const c = await contactsApi.uploadDocuments(7, [
      { uri: "file:///a.jpg", name: "a.jpg", mimeType: "image/jpeg" },
      { uri: "file:///b.pdf", name: "b.pdf", mimeType: "application/pdf" },
    ]);
    expect(sent).toBeInstanceOf(FormData);
    // Jest's FormData is Node's, which stringifies React Native's {uri,name,type}
    // parts: read what was appended instead.
    expect(appended.map(([field, part]) => [field, part.name, part.type, part.uri])).toEqual([
      ["documents[]", "a.jpg", "image/jpeg", "file:///a.jpg"],
      ["documents[]", "b.pdf", "application/pdf", "file:///b.pdf"],
    ]);
    expect(String(headers["Content-Type"])).toMatch(/multipart\/form-data/);
    expect(timeout).toBeGreaterThanOrEqual(60_000);
    expect(c.documents?.map((d) => d.id)).toEqual([2, 1]);
    jest.restoreAllMocks();
  });

  it("renames with PATCH {filename} and deletes with DELETE, each returning the contact", async () => {
    let body: unknown;
    mock.onPatch("/api/v1/contact_app/contacts/7/documents/11").reply((config) => {
      body = JSON.parse(config.data);
      return [200, { contact: { ...jamil, documents: [doc(11, "passport.pdf")] } }];
    });
    mock.onDelete("/api/v1/contact_app/contacts/7/documents/11").reply(200, { contact: { ...jamil, documents: [] } });
    expect((await contactsApi.renameDocument(7, 11, "passport.pdf")).documents?.[0].filename).toBe("passport.pdf");
    expect(body).toEqual({ filename: "passport.pdf" });
    expect((await contactsApi.removeDocument(7, 11)).documents).toEqual([]);
  });

  it("knows the server's limits before sending: images or PDF, under 20 MB", () => {
    expect(DOCUMENT_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(documentRefusal({ name: "id.jpg", mimeType: "image/jpeg", size: 1000 })).toBeNull();
    expect(documentRefusal({ name: "id.PDF", mimeType: null, size: 1000 })).toBeNull();
    expect(documentRefusal({ name: "scan.webp", mimeType: "image/webp", size: null })).toBeNull();
    expect(documentRefusal({ name: "big.pdf", mimeType: "application/pdf", size: DOCUMENT_MAX_BYTES })).toBe("size");
    expect(documentRefusal({ name: "cv.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 })).toBe("type");
    expect(documentRefusal({ name: "photo.heic", mimeType: "image/heic", size: 10 })).toBe("type");
    expect(documentRefusal({ name: "clip.mov", mimeType: "video/quicktime", size: 10 })).toBe("type");
  });
});
