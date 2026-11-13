/**
 * NOTE LABELS — the web's note tags (multi_magic NoteApp::Tag), Keep's
 * labels (owner, 2026-11-13). One store for web and phone:
 *   /note_app/tags (index paginated by position, create, update, destroy)
 *   /note_app/notes/:id/toggle_tag, /create_and_assign_tag (return the note)
 * Labels are the caller's own; a sharee tags with their own labels.
 */
import { http } from "./http";
import { arr, num, obj } from "./parse";
import { parseNote, parseTag, type Note, type NoteTag } from "./notes";

export const noteTagsApi = {
  /** Every label, in the web's order (position), all pages. */
  list: async (): Promise<NoteTag[]> => {
    const out: NoteTag[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await http.get("/api/v1/note_app/tags", { params: { page } });
      const record = obj(res.data, "tags");
      out.push(...arr(record.tags, "tags.tags").map(parseTag));
      const pages = num(obj(obj(record.meta, "tags.meta").pagy, "tags.meta.pagy").pages, "tags.meta.pagy.pages");
      if (page >= pages) break;
    }
    return out;
  },

  create: async (name: string): Promise<NoteTag> => {
    const res = await http.post("/api/v1/note_app/tags", { tag: { name } });
    return parseTag(obj(res.data, "tag").tag);
  },

  rename: async (tagId: number, name: string): Promise<NoteTag> => {
    const res = await http.put(`/api/v1/note_app/tags/${tagId}`, { tag: { name } });
    return parseTag(obj(res.data, "tag").tag);
  },

  remove: async (tagId: number): Promise<void> => {
    await http.delete(`/api/v1/note_app/tags/${tagId}`);
  },

  /** Put the label on the note, or take it off; the note comes back. */
  toggleOnNote: async (noteId: number, tagId: number): Promise<Note> => {
    const res = await http.put(`/api/v1/note_app/notes/${noteId}/toggle_tag`, { tag_id: tagId });
    return parseNote(obj(res.data, "note").note);
  },

  /** A new label, put straight on the note; the note comes back. */
  createOnNote: async (noteId: number, name: string): Promise<Note> => {
    const res = await http.post(`/api/v1/note_app/notes/${noteId}/create_and_assign_tag`, { name });
    return parseNote(obj(res.data, "note").note);
  },
};
