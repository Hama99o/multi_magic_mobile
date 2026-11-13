/**
 * Notes — `docs/design/notes/SPEC.md` §A.
 *
 * ── THE BODY IS HTML, NOT JSON ────────────────────────────────────────────
 * `note_app_notes.description` holds what the web editor (tiptop-editor 2.3.1)
 * writes with `getHTML()`. The phone never edits that string by hand: it reads
 * it with `fromHTMLWithSource` and writes it with `toHTML` from
 * `src/vendor/tiptop-schema`, the codec proven against the real web editor, so
 * a note saved here opens on the web exactly as it was, plus the edit.
 * This file only moves the string; it does not parse it.
 *
 * ── ORDER ─────────────────────────────────────────────────────────────────
 * The server already sorts: pinned first, then last edited
 * (`notes_controller.rb#note_index`: `order(pinned: :desc, updated_at: :desc)`),
 * 10 per page. That is the order the owner chose for the list (SPEC §G5).
 */
import { http } from "./http";
import { arr, id, num, obj, optStr, readableRows, str } from "./parse";
import { StaleNoteError } from "@/lib/staleNote";
import { isNoteColorKey, type NoteColorKey } from "@/screens/notes/editor/noteColors";
import type { NoteReminder } from "@/screens/notes/reminders";

/** `owner`, or a share role (`note_app/share.rb`: viewer, contributor, administrator). */
export type NoteRole = "owner" | "administrator" | "contributor" | "viewer";

export interface NoteTag {
  /** The label's colour key (tag.rb enum), null for none. */
  color: NoteColorKey | null;
  id: number;
  name: string;
}

export type NoteStatus = "published" | "archived" | "trashed";

export interface Note {
  id: number;
  status: NoteStatus;
  /** Locked: opens read-only on the web and the phone (data.locked, sent as is_locked). */
  locked: boolean;
  /** A reminder set on any device (data.launch_time + repeat_frequency), or null. */
  reminder: NoteReminder | null;
  /** The note's colour key (data.color, or a label's colour as the server falls back), null for none. */
  color: NoteColorKey | null;
  title: string;
  /** The stored HTML body, exactly as the server sent it ("" for an empty note). */
  html: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  role: NoteRole | null;
  isShared: boolean;
  sharedCount: number;
  tags: NoteTag[];
}

export interface NoteList {
  notes: Note[];
  /** Rows on this page the parser could not read (`readableRows`). */
  unreadable: number;
  hasMore: boolean;
  total: number;
}

function parseReminder(data: unknown): NoteReminder | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.launch_time !== "string" || !d.launch_time) return null;
  const at = new Date(d.launch_time);
  if (Number.isNaN(at.getTime())) return null;
  const repeat = d.repeat_frequency === "daily" || d.repeat_frequency === "weekly" || d.repeat_frequency === "monthly" ? d.repeat_frequency : null;
  return { at, repeat };
}

const colorKey = (v: unknown): NoteColorKey | null => (isNoteColorKey(v) && v !== "no_color" ? v : null);

const ROLES: readonly NoteRole[] = ["owner", "administrator", "contributor", "viewer"];

export function parseTag(value: unknown): NoteTag {
  const tag = obj(value, "note.tag");
  return { id: id(tag.id, "note.tag.id"), name: str(tag.name, "note.tag.name"), color: colorKey(tag.color) };
}

export function parseNote(value: unknown): Note {
  const note = obj(value, "note");
  const role = optStr(note.role);
  return {
    id: id(note.id, "note.id"),
    color: colorKey(note.color),
    status: note.status === "archived" || note.status === "trashed" ? note.status : "published",
    reminder: parseReminder(note.data),
    locked: note.is_locked === true,
    title: optStr(note.title) ?? "",
    html: optStr(note.description) ?? "",
    pinned: note.pinned === true,
    createdAt: str(note.created_at, "note.created_at"),
    updatedAt: str(note.updated_at, "note.updated_at"),
    role: role && (ROLES as readonly string[]).includes(role) ? (role as NoteRole) : null,
    isShared: note.is_shared === true,
    sharedCount: typeof note.shared_count === "number" ? note.shared_count : 0,
    tags: Array.isArray(note.tags) ? note.tags.map(parseTag) : [],
  };
}

export const notesApi = {
  /** Published notes the reader can see (their own and shared), pinned first, then last edited. */
  list: async (page = 1, search?: string, tagId?: number, view: "notes" | "archive" | "trash" | "reminders" = "notes"): Promise<NoteList> => {
    const path = view === "archive" ? "/api/v1/note_app/notes/archives" : view === "trash" ? "/api/v1/note_app/notes/trashes" : "/api/v1/note_app/notes";
    const res = await http.get(path, {
      params: { page, ...(search ? { search } : {}), ...(tagId ? { tag_id: tagId } : {}), ...(view === "reminders" ? { reminders: "true" } : {}) },
    });
    const record = obj(res.data, "notes");
    const meta = obj(record.meta, "notes.meta");
    const pagy = obj(meta.pagy, "notes.meta.pagy");
    const { rows, unreadable } = readableRows(arr(record.notes, "notes.notes"), parseNote);
    return {
      notes: rows,
      unreadable,
      hasMore: num(pagy.pages, "notes.meta.pagy.pages") > page,
      total: typeof meta.total_count === "number" ? meta.total_count : rows.length,
    };
  },

  /** One note, with its full body. */
  get: async (noteId: number): Promise<Note> => {
    const res = await http.get(`/api/v1/note_app/notes/${noteId}`);
    return parseNote(obj(res.data, "note").note);
  },

  /**
   * Save the title and body (`notes_controller#update` permits them at the top
   * level). With `expectedUpdatedAt`, a server that has the version check
   * refuses a stale write with 409 → StaleNoteError; one without it ignores it.
   */
  update: async (noteId: number, body: { title: string; html: string }, expectedUpdatedAt?: string): Promise<Note> => {
    try {
      const res = await http.put(`/api/v1/note_app/notes/${noteId}`, {
        title: body.title,
        description: body.html,
        ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
      });
      return parseNote(obj(res.data, "note").note);
    } catch (e) {
      // 409: the note moved since `expectedUpdatedAt` (multi_magic branch notes-update-version-check).
      const res = (e as { response?: { status?: number; data?: unknown } }).response;
      if (res?.status === 409) throw new StaleNoteError(parseNote(obj(res.data, "note").note));
      throw e;
    }
  },

  /** Lock or unlock (data.locked; multi_magic notes-lock branch). */
  setLocked: async (noteId: number, locked: boolean): Promise<Note> => {
    const res = await http.put(`/api/v1/note_app/notes/${noteId}`, { locked });
    return parseNote(obj(res.data, "note").note);
  },

  /** Pin or unpin (the web's update with `pinned`). */
  setPinned: async (noteId: number, pinned: boolean): Promise<Note> => {
    const res = await http.put(`/api/v1/note_app/notes/${noteId}`, { pinned });
    return parseNote(obj(res.data, "note").note);
  },

  /** The note's colour key (data.color); null clears it with the web's `no_color`. */
  setColor: async (noteId: number, color: NoteColorKey | null): Promise<Note> => {
    const res = await http.put(`/api/v1/note_app/notes/${noteId}`, { color: color ?? "no_color" });
    return parseNote(obj(res.data, "note").note);
  },

  /** Make a copy (the web's duplicate: the caller's own copy, "(copy)" title, colour kept, no shares or tags). */
  duplicate: async (noteId: number): Promise<Note> => {
    const res = await http.post(`/api/v1/note_app/notes/${noteId}/duplicate`);
    return parseNote(obj(res.data, "note").note);
  },

  /** Set (or with null, remove) the note's reminder; the phone schedules it (reminders.ts). */
  setReminder: async (noteId: number, reminder: NoteReminder | null): Promise<Note> => {
    const res = await http.put(`/api/v1/note_app/notes/${noteId}`, {
      launch_time: reminder ? reminder.at.toISOString() : "",
      repeat_frequency: reminder?.repeat ?? "",
    });
    return parseNote(obj(res.data, "note").note);
  },

  /** Archive (Keep's archive; multi_magic PR #21): out of the list, kept. */
  archive: async (noteId: number): Promise<Note> => {
    const res = await http.put(`/api/v1/note_app/notes/${noteId}/archive`);
    return parseNote(obj(res.data, "note").note);
  },

  unarchive: async (noteId: number): Promise<Note> => {
    const res = await http.put(`/api/v1/note_app/notes/${noteId}/unarchive`);
    return parseNote(obj(res.data, "note").note);
  },

  /** Out of the trash, back into the notes. */
  restore: async (noteId: number): Promise<void> => {
    await http.put(`/api/v1/note_app/notes/${noteId}/restore`);
  },

  /** Gone for good (only from the trash, as on the web). */
  destroyForever: async (noteId: number): Promise<void> => {
    await http.delete(`/api/v1/note_app/notes/${noteId}/destroy_permanently`);
  },

  /** To the trash: the server's destroy sets status trashed (restore and delete forever exist). */
  trash: async (noteId: number): Promise<void> => {
    await http.delete(`/api/v1/note_app/notes/${noteId}`);
  },

  /** A new published note of the caller's (used by "Keep both" on a conflict, SPEC §G2). */
  create: async (body: { title: string; html: string }): Promise<Note> => {
    const res = await http.post("/api/v1/note_app/notes", { title: body.title, description: body.html });
    return parseNote(obj(res.data, "note").note);
  },
};

/** Whether the reader may edit (phase 3): the owner, an administrator or a contributor. */
export const canEdit = (note: Pick<Note, "role">): boolean =>
  note.role === "owner" || note.role === "administrator" || note.role === "contributor";
