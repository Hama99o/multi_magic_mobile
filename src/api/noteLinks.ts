/**
 * NOTES LINKED TO A PAGES ITEM (parity audit #26, #51; web `noteLinksApi`,
 * `LinkNotesDialog`, `NodeViewer` "Linked notes"). A link joins one note to
 * one node; the server embeds the note (`NoteApp::NoteSerializer`), so a
 * row can be drawn and opened without a second call.
 */
import { http } from "./http";
import { arr, id, num, obj, optStr, readableRows } from "./parse";

export interface NoteLink {
  id: number;
  position: number;
  noteId: number;
  noteTitle: string;
}

export function parseNoteLink(raw: unknown): NoteLink {
  const r = obj(raw, "note_link");
  const note = typeof r.note === "object" && r.note !== null ? (r.note as Record<string, unknown>) : {};
  return {
    id: id(r.id, "note_link.id"),
    position: typeof r.position === "number" ? r.position : 0,
    noteId: num(r.note_app_note_id ?? note.id, "note_app_note_id"),
    noteTitle: optStr(note.title) ?? "",
  };
}

const base = (spaceId: number, nodeId: number) => `/api/v1/page_app/spaces/${spaceId}/nodes/${nodeId}/note_links`;

export const noteLinksApi = {
  /** In the order they were linked (`position`). */
  list: async (spaceId: number, nodeId: number): Promise<{ rows: NoteLink[]; unreadable: number }> => {
    const res = await http.get(base(spaceId, nodeId));
    const out = readableRows(arr(obj(res.data, "note_links").note_links, "note_links"), parseNoteLink);
    return { rows: out.rows.sort((a, b) => a.position - b.position), unreadable: out.unreadable };
  },
  create: async (spaceId: number, nodeId: number, noteId: number, position: number): Promise<NoteLink> => {
    const res = await http.post(base(spaceId, nodeId), { note_id: noteId, position });
    return parseNoteLink(obj(res.data, "note_link").note_link);
  },
  remove: async (spaceId: number, nodeId: number, linkId: number): Promise<void> => {
    await http.delete(`${base(spaceId, nodeId)}/${linkId}`);
  },
};
