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

/** `owner`, or a share role (`note_app/share.rb`: viewer, contributor, administrator). */
export type NoteRole = "owner" | "administrator" | "contributor" | "viewer";

export interface NoteTag {
  id: number;
  name: string;
}

export interface Note {
  id: number;
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

const ROLES: readonly NoteRole[] = ["owner", "administrator", "contributor", "viewer"];

function parseTag(value: unknown): NoteTag {
  const tag = obj(value, "note.tag");
  return { id: id(tag.id, "note.tag.id"), name: str(tag.name, "note.tag.name") };
}

export function parseNote(value: unknown): Note {
  const note = obj(value, "note");
  const role = optStr(note.role);
  return {
    id: id(note.id, "note.id"),
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
  list: async (page = 1, search?: string): Promise<NoteList> => {
    const res = await http.get("/api/v1/note_app/notes", { params: { page, ...(search ? { search } : {}) } });
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

  /** A new published note of the caller's (used by "Keep both" on a conflict, SPEC §G2). */
  create: async (body: { title: string; html: string }): Promise<Note> => {
    const res = await http.post("/api/v1/note_app/notes", { title: body.title, description: body.html });
    return parseNote(obj(res.data, "note").note);
  },
};

/** Whether the reader may edit (phase 3): the owner, an administrator or a contributor. */
export const canEdit = (note: Pick<Note, "role">): boolean =>
  note.role === "owner" || note.role === "administrator" || note.role === "contributor";
