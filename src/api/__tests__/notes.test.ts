/**
 * Notes at the boundary. The body is the web editor's HTML and must reach the
 * codec exactly as stored: this file moves it, never edits it.
 */
import MockAdapter from "axios-mock-adapter";
import { canEdit, notesApi, parseNote } from "../notes";
import { ApiShapeError } from "../parse";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

const BODY = '<p>Book the <strong>Thursday</strong> flight</p>\r\n<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>passport</p></div></li></ul>';

const note = (over: Record<string, unknown> = {}) => ({
  id: 7,
  title: "Trip",
  description: BODY,
  data: {},
  status: "published",
  pinned: true,
  created_at: "2026-11-01T10:00:00Z",
  deleted_at: null,
  updated_at: "2026-11-12T09:00:00Z",
  is_shared: false,
  role: "owner",
  shared_users: [],
  shared_count: 0,
  tags: [{ id: 3, name: "travel" }],
  ...over,
});

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});

afterEach(() => mock.restore());

describe("notesApi.list", () => {
  it("reads a page of notes, keeps the body byte for byte, and knows there is more", async () => {
    mock.onGet("/api/v1/note_app/notes").reply(200, {
      notes: [note(), note({ id: 8, pinned: false, title: null, description: null })],
      meta: { pagy: { page: 1, pages: 3 }, total_count: 25 },
    });
    const list = await notesApi.list(1);
    expect(mock.history.get[0].params).toEqual({ page: 1 });
    expect(list.notes.map((n) => n.id)).toEqual([7, 8]);
    expect(list.notes[0].html).toBe(BODY);
    expect(list.notes[1]).toMatchObject({ title: "", html: "", pinned: false });
    expect(list).toMatchObject({ hasMore: true, total: 25, unreadable: 0 });
  });

  it("counts an unreadable row instead of failing the page", async () => {
    mock.onGet("/api/v1/note_app/notes").reply(200, {
      notes: [note(), { id: "x" }],
      meta: { pagy: { page: 1, pages: 1 }, total_count: 2 },
    });
    const list = await notesApi.list(1);
    expect(list.notes).toHaveLength(1);
    expect(list.unreadable).toBe(1);
    expect(list.hasMore).toBe(false);
  });

  it("passes a search", async () => {
    mock.onGet("/api/v1/note_app/notes").reply(200, { notes: [], meta: { pagy: { pages: 1 }, total_count: 0 } });
    await notesApi.list(2, "rome");
    expect(mock.history.get[0].params).toEqual({ page: 2, search: "rome" });
  });
});

describe("notesApi.get", () => {
  it("reads one note from its wrapper", async () => {
    mock.onGet("/api/v1/note_app/notes/7").reply(200, { note: note() });
    const got = await notesApi.get(7);
    expect(got).toMatchObject({ id: 7, title: "Trip", html: BODY, role: "owner", tags: [{ id: 3, name: "travel" }] });
  });
});

describe("roles", () => {
  it.each([
    ["owner", true],
    ["administrator", true],
    ["contributor", true],
    ["viewer", false],
    [null, false],
    ["superuser", false],
  ])("%s may edit: %s", (role, expected) => {
    expect(canEdit(parseNote(note({ role })))).toBe(expected);
  });

  it("rejects a note without an id", () => {
    expect(() => parseNote({ title: "x" })).toThrow(ApiShapeError);
  });
});
