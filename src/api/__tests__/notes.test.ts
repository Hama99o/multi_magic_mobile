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

describe("notesApi writes (phase 3)", () => {
  it("update sends the title and the body as the web does, and reads the saved note back", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply(200, { note: note({ title: "Trip 2", description: "<p>x</p>", updated_at: "2026-11-13T10:00:00Z" }) });
    const saved = await notesApi.update(7, { title: "Trip 2", html: "<p>x</p>" });
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ title: "Trip 2", description: "<p>x</p>" });
    expect(saved).toMatchObject({ id: 7, title: "Trip 2", html: "<p>x</p>", updatedAt: "2026-11-13T10:00:00Z" });
  });

  it("create makes a published note of the caller's and returns it", async () => {
    mock.onPost("/api/v1/note_app/notes").reply(200, { note: note({ id: 99, title: "Trip (conflict 12 Nov 15:40)", description: "<p>mine</p>" }) });
    const made = await notesApi.create({ title: "Trip (conflict 12 Nov 15:40)", html: "<p>mine</p>" });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ title: "Trip (conflict 12 Nov 15:40)", description: "<p>mine</p>" });
    expect(made).toMatchObject({ id: 99, html: "<p>mine</p>" });
  });

  it("the body goes out byte for byte (CRLF and all)", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply(200, { note: note() });
    await notesApi.update(7, { title: "Trip", html: BODY });
    expect(JSON.parse(mock.history.put[0].data).description).toBe(BODY);
  });
});

describe("notesApi.update and the server's version check", () => {
  it("sends the version the phone edited from", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply(200, { note: note() });
    await notesApi.update(7, { title: "Trip", html: "<p>x</p>" }, "2026-11-12T09:00:00.000Z");
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ title: "Trip", description: "<p>x</p>", expected_updated_at: "2026-11-12T09:00:00.000Z" });
  });

  it("a 409 becomes a StaleNoteError carrying the server's current note", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply(409, { error: "stale", note: note({ description: "<p>web</p>", updated_at: "2026-11-13T08:00:00Z" }) });
    await expect(notesApi.update(7, { title: "Trip", html: "<p>x</p>" }, "2026-11-12T09:00:00Z")).rejects.toMatchObject({
      name: "StaleNoteError",
      current: { html: "<p>web</p>", updatedAt: "2026-11-13T08:00:00Z" },
    });
  });
});

describe("Keep grid fields (colour, label colours)", () => {
  it("reads the note's colour key and each label's colour", async () => {
    mock.onGet("/api/v1/note_app/notes/7").reply(200, { note: note({ color: "orange", tags: [{ id: 3, name: "dev-stuff", color: "teal" }] }) });
    const n = await notesApi.get(7);
    expect(n.color).toBe("orange");
    expect(n.tags).toEqual([{ id: 3, name: "dev-stuff", color: "teal" }]);
  });

  it("a missing or unknown colour is no colour", async () => {
    mock.onGet("/api/v1/note_app/notes/7").reply(200, { note: note({ color: "chartreuse", tags: [{ id: 3, name: "x" }] }) });
    const n = await notesApi.get(7);
    expect(n.color).toBeNull();
    expect(n.tags[0].color).toBeNull();
  });
});

describe("grid actions (pin, colour, trash)", () => {
  it("pins and unpins with the web's update", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply(200, { note: note({ pinned: false }) });
    await notesApi.setPinned(7, false);
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ pinned: false });
  });

  it("sets a colour key, and clears it with the web's no_color", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply(200, { note: note({ color: "teal" }) });
    const n = await notesApi.setColor(7, "teal");
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ color: "teal" });
    expect(n.color).toBe("teal");
    await notesApi.setColor(7, null);
    expect(JSON.parse(mock.history.put[1].data)).toEqual({ color: "no_color" });
  });

  it("delete moves the note to the trash (the server's destroy trashes)", async () => {
    mock.onDelete("/api/v1/note_app/notes/7").reply(200, { id: 7, status: "trashed" });
    await notesApi.trash(7);
    expect(mock.history.delete).toHaveLength(1);
  });
});

describe("make a copy (the web's duplicate)", () => {
  it("asks the server to duplicate and returns the copy", async () => {
    mock.onPost("/api/v1/note_app/notes/7/duplicate").reply(201, { note: note({ id: 70, title: "Trip (copy)" }) });
    const copy = await notesApi.duplicate(7);
    expect(copy).toMatchObject({ id: 70, title: "Trip (copy)" });
  });
});

describe("archive and trash (Keep, owner 2026-11-13)", () => {
  const page = (notes: unknown[]) => ({ notes, meta: { pagy: { page: 1, pages: 1 }, total_count: notes.length } });

  it("archives and unarchives (multi_magic PR #21 routes)", async () => {
    mock.onPut("/api/v1/note_app/notes/7/archive").reply(200, { note: note({ status: "archived" }) });
    mock.onPut("/api/v1/note_app/notes/7/unarchive").reply(200, { note: note() });
    expect((await notesApi.archive(7)).status).toBe("archived");
    expect((await notesApi.unarchive(7)).status).toBe("published");
  });

  it("lists the archive and the trash like the main list", async () => {
    mock.onGet("/api/v1/note_app/notes/archives").reply(200, page([note({ status: "archived" })]));
    mock.onGet("/api/v1/note_app/notes/trashes").reply(200, page([note({ status: "trashed" })]));
    expect((await notesApi.list(1, undefined, undefined, "archive")).notes[0].status).toBe("archived");
    expect((await notesApi.list(1, "x", undefined, "trash")).notes[0].status).toBe("trashed");
    expect(mock.history.get[1].params).toEqual({ page: 1, search: "x" });
  });

  it("restores from the trash and deletes forever", async () => {
    mock.onPut("/api/v1/note_app/notes/7/restore").reply(200, note());
    mock.onDelete("/api/v1/note_app/notes/7/destroy_permanently").reply(200, { note: note() });
    await notesApi.restore(7);
    await notesApi.destroyForever(7);
    expect(mock.history.put[0].url).toBe("/api/v1/note_app/notes/7/restore");
    expect(mock.history.delete[0].url).toBe("/api/v1/note_app/notes/7/destroy_permanently");
  });
});

describe("reminders (data.launch_time, data.repeat_frequency; multi_magic PR #22)", () => {
  it("reads a note's reminder from its data", async () => {
    mock.onGet("/api/v1/note_app/notes/7").reply(200, { note: note({ data: { launch_time: "2026-11-20T09:00:00Z", repeat_frequency: "weekly", color: "teal" } }) });
    const n = await notesApi.get(7);
    expect(n.reminder).toEqual({ at: new Date("2026-11-20T09:00:00Z"), repeat: "weekly" });
  });

  it("no reminder, or an unreadable one, is null", async () => {
    mock.onGet("/api/v1/note_app/notes/7").reply(200, { note: note({ data: { launch_time: "soon" } }) });
    expect((await notesApi.get(7)).reminder).toBeNull();
  });

  it("sets and removes a reminder", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply(200, { note: note() });
    await notesApi.setReminder(7, { at: new Date("2026-11-20T09:00:00Z"), repeat: "daily" });
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ launch_time: "2026-11-20T09:00:00.000Z", repeat_frequency: "daily" });
    await notesApi.setReminder(7, null);
    expect(JSON.parse(mock.history.put[1].data)).toEqual({ launch_time: "", repeat_frequency: "" });
  });

  it("lists the notes that have a reminder (?reminders=true)", async () => {
    mock.onGet("/api/v1/note_app/notes").reply(200, { notes: [], meta: { pagy: { page: 1, pages: 1 }, total_count: 0 } });
    await notesApi.list(1, undefined, undefined, "reminders");
    expect(mock.history.get[0].params).toEqual({ page: 1, reminders: "true" });
  });
});
