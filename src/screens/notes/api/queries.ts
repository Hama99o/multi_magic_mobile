/**
 * THE NOTES DATA LAYER — every read and write of a note or a label goes
 * through here (owner, 2026-11-13: "use the query style well so it doesn't
 * get hard"; SPEC "Data layer").
 *
 * - Keys come from `notesKeys` only. A screen never writes a key by hand.
 * - Reads are `useNotesList` / `useNote` / `useNoteTags`. A component never
 *   calls `notesApi` itself, and never copies server data into useState: the
 *   open note's pin, colour, lock, reminder and labels are read from the
 *   detail cache, which the mutations below keep current.
 * - A mutation that changes the screen at once is OPTIMISTIC: it patches the
 *   open note and every loaded list page (onMutate, with a snapshot), puts
 *   them back exactly when the server refuses (onError), writes the server's
 *   answer when it accepts (onSuccess), and invalidates only the keys it
 *   touched (onSettled). Leaving a list (archive, trash, restore…) removes the
 *   card from the loaded lists; the invalidation then puts it in the right one.
 *
 * The one exception is `reminderNotifications.ts`, which runs outside React
 * (on sign-in and after a change) and reads the reminders list itself.
 */
import { useMutation, useQuery, useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";

import { notesApi, type Note, type NoteList, type NoteStatus, type NoteTag } from "@/api/notes";
import { noteTagsApi } from "@/api/noteTags";
import type { NoteColorKey } from "@/screens/notes/editor/noteColors";
import type { NoteReminder } from "@/screens/notes/reminders";

export type NotesListView = "notes" | "reminders" | "archive" | "trash";
export interface NotesFilters {
  view: NotesListView;
  search: string;
  tagId: number | null;
}

export const notesKeys = {
  all: ["notes"] as const,
  lists: () => ["notes", "list"] as const,
  list: (f: NotesFilters) => ["notes", "list", f.view, f.search, f.tagId] as const,
  details: () => ["notes", "note"] as const,
  detail: (id: number) => ["notes", "note", id] as const,
  tags: () => ["notes", "tags"] as const,
};

// ── reads ──────────────────────────────────────────────────────────────────

export const useNotesList = (f: NotesFilters) =>
  useInfiniteQuery({
    queryKey: notesKeys.list(f),
    queryFn: ({ pageParam }) => notesApi.list(pageParam, f.search || undefined, f.view === "notes" ? (f.tagId ?? undefined) : undefined, f.view),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });

export const useNote = (id: number) => useQuery({ queryKey: notesKeys.detail(id), queryFn: () => notesApi.get(id), enabled: id > 0 });

/** The server's copy now (the saver's conflict check), kept in the detail cache. */
export const fetchFreshNote = (qc: QueryClient, id: number) => qc.fetchQuery({ queryKey: notesKeys.detail(id), queryFn: () => notesApi.get(id), staleTime: 0 });

export const useNoteTags = (enabled = true) => useQuery({ queryKey: notesKeys.tags(), queryFn: () => noteTagsApi.list(), enabled });

// ── the optimistic machinery ───────────────────────────────────────────────

type Lists = InfiniteData<NoteList>;
interface Snapshot {
  lists: [QueryKey, Lists | undefined][];
  details: [QueryKey, Note | undefined][];
  tags?: NoteTag[];
}

/** Apply `change` to every cached copy of the matching notes; null removes the card from the lists. */
function patchNotes(qc: QueryClient, match: (n: Note) => boolean, change: (n: Note) => Note | null) {
  qc.setQueriesData<Lists>({ queryKey: notesKeys.lists() }, (old) =>
    old && {
      ...old,
      pages: old.pages.map((p) => ({
        ...p,
        notes: p.notes.flatMap((n) => {
          if (!match(n)) return [n];
          const next = change(n);
          return next ? [next] : [];
        }),
      })),
    },
  );
  qc.setQueriesData<Note>({ queryKey: notesKeys.details() }, (old) => (old && match(old) ? (change(old) ?? old) : old));
}

async function snapshot(qc: QueryClient, withTags = false): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: notesKeys.lists() });
  await qc.cancelQueries({ queryKey: notesKeys.details() });
  if (withTags) await qc.cancelQueries({ queryKey: notesKeys.tags() });
  return {
    lists: qc.getQueriesData<Lists>({ queryKey: notesKeys.lists() }),
    details: qc.getQueriesData<Note>({ queryKey: notesKeys.details() }),
    tags: withTags ? qc.getQueriesData<NoteTag[]>({ queryKey: notesKeys.tags() })[0]?.[1] : undefined,
  };
}

function rollback(qc: QueryClient, snap: Snapshot | undefined) {
  if (!snap) return;
  for (const [key, data] of [...snap.lists, ...snap.details]) qc.setQueriesData({ queryKey: key, exact: true }, data);
  if (snap.tags) qc.setQueriesData({ queryKey: notesKeys.tags(), exact: true }, snap.tags);
}

/** The server's copy of a note, written everywhere it is cached. */
const writeNote = (qc: QueryClient, saved: Note) => patchNotes(qc, (n) => n.id === saved.id, () => saved);

/**
 * One note changes. `patch` is what the screen shows at once; `leaves` removes
 * it from the loaded lists (it moved to another view).
 */
function useNoteChange<V extends { id: number }>(opts: {
  call: (v: V) => Promise<Note | void>;
  patch?: (n: Note, v: V) => Note;
  leaves?: boolean;
  gone?: boolean;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.call,
    onMutate: async (v: V) => {
      const snap = await snapshot(qc);
      const one = (n: Note) => n.id === v.id;
      if (opts.leaves || opts.gone) {
        qc.setQueriesData<Lists>({ queryKey: notesKeys.lists() }, (old) =>
          old && { ...old, pages: old.pages.map((p) => ({ ...p, notes: p.notes.filter((n) => !one(n)) })) },
        );
      }
      if (opts.patch) {
        const patch = opts.patch;
        patchNotes(qc, one, (n) => patch(n, v));
      }
      return snap;
    },
    onError: (_e, _v, snap) => rollback(qc, snap),
    onSuccess: (saved, v) => {
      if (opts.gone) qc.removeQueries({ queryKey: notesKeys.detail(v.id), exact: true });
      else if (saved && !opts.leaves) writeNote(qc, saved);
      else if (saved) qc.setQueriesData<Note>({ queryKey: notesKeys.detail(v.id), exact: true }, saved);
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: notesKeys.lists() });
      if (!opts.gone) void qc.invalidateQueries({ queryKey: notesKeys.detail(v.id), exact: true });
    },
  });
}

const status = (s: NoteStatus) => (n: Note): Note => ({ ...n, status: s });

// ── note mutations ─────────────────────────────────────────────────────────

export const usePinNote = () =>
  useNoteChange<{ id: number; pinned: boolean }>({ call: (v) => notesApi.setPinned(v.id, v.pinned), patch: (n, v) => ({ ...n, pinned: v.pinned }) });

export const useSetNoteColor = () =>
  useNoteChange<{ id: number; color: NoteColorKey | null }>({ call: (v) => notesApi.setColor(v.id, v.color), patch: (n, v) => ({ ...n, color: v.color }) });

export const useLockNote = () =>
  useNoteChange<{ id: number; locked: boolean }>({ call: (v) => notesApi.setLocked(v.id, v.locked), patch: (n, v) => ({ ...n, locked: v.locked }) });

export const useSetNoteReminder = () =>
  useNoteChange<{ id: number; reminder: NoteReminder | null }>({ call: (v) => notesApi.setReminder(v.id, v.reminder), patch: (n, v) => ({ ...n, reminder: v.reminder }) });

export const useArchiveNote = () => useNoteChange<{ id: number }>({ call: (v) => notesApi.archive(v.id), patch: status("archived"), leaves: true });
export const useUnarchiveNote = () => useNoteChange<{ id: number }>({ call: (v) => notesApi.unarchive(v.id), patch: status("published"), leaves: true });
export const useTrashNote = () => useNoteChange<{ id: number }>({ call: (v) => notesApi.trash(v.id), patch: status("trashed"), leaves: true });
export const useRestoreNote = () => useNoteChange<{ id: number }>({ call: (v) => notesApi.restore(v.id), patch: status("published"), leaves: true });
export const useDestroyNoteForever = () => useNoteChange<{ id: number }>({ call: (v) => notesApi.destroyForever(v.id), gone: true });

/** Not optimistic: the new note's id comes from the server. */
function useNewNote<V>(call: (v: V) => Promise<Note>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (made) => {
      // Seeds the editor it opens next (setQueriesData would skip a key not cached yet).
      qc.setQueryData<Note>(notesKeys.detail(made.id), made);
      void qc.invalidateQueries({ queryKey: notesKeys.lists() });
    },
  });
}
export const useDuplicateNote = () => useNewNote<{ id: number }>((v) => notesApi.duplicate(v.id));
export const useCreateNote = () => useNewNote<{ title: string; html: string }>((v) => notesApi.create(v));

/**
 * The editor's save (drafts, debounce and the 409 stay in noteSaver.ts; this
 * is its network call). The server's answer goes into the open note and the
 * cards, so going back shows the edit without waiting for a refetch.
 */
export function useSaveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; body: { title: string; html: string }; expectedUpdatedAt?: string }) => notesApi.update(v.id, v.body, v.expectedUpdatedAt),
    onSuccess: (saved) => writeNote(qc, saved),
  });
}

// ── labels ─────────────────────────────────────────────────────────────────

/** A label on or off one note (optimistic); the server returns the note. */
export function useToggleNoteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; tag: NoteTag }) => noteTagsApi.toggleOnNote(v.id, v.tag.id),
    onMutate: async (v) => {
      const snap = await snapshot(qc);
      patchNotes(qc, (n) => n.id === v.id, (n) => ({
        ...n,
        tags: n.tags.some((t) => t.id === v.tag.id) ? n.tags.filter((t) => t.id !== v.tag.id) : [...n.tags, v.tag],
      }));
      return snap;
    },
    onError: (_e, _v, snap) => rollback(qc, snap),
    onSuccess: (saved) => writeNote(qc, saved),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: notesKeys.lists() });
      void qc.invalidateQueries({ queryKey: notesKeys.detail(v.id), exact: true });
    },
  });
}

/** A new label put on a note at once (not optimistic: the label's id comes from the server). */
export function useCreateTagOnNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; name: string }) => noteTagsApi.createOnNote(v.id, v.name),
    onSuccess: (saved) => writeNote(qc, saved),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: notesKeys.tags() });
      void qc.invalidateQueries({ queryKey: notesKeys.lists() });
      void qc.invalidateQueries({ queryKey: notesKeys.detail(v.id), exact: true });
    },
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string }) => noteTagsApi.create(v.name),
    onSettled: () => void qc.invalidateQueries({ queryKey: notesKeys.tags() }),
  });
}

/** Rename or remove a label: the drawer, every card and the open note carry its name. */
function useTagChange<V extends { id: number }>(call: (v: V) => Promise<unknown>, change: (t: NoteTag, v: V) => NoteTag | null) {
  const qc = useQueryClient();
  const apply = (tags: NoteTag[], v: V) => tags.flatMap((t) => (t.id === v.id ? (change(t, v) ?? []) : [t]));
  return useMutation({
    mutationFn: call,
    onMutate: async (v: V) => {
      const snap = await snapshot(qc, true);
      qc.setQueriesData<NoteTag[]>({ queryKey: notesKeys.tags(), exact: true }, (old) => old && apply(old, v));
      patchNotes(qc, (n) => n.tags.some((t) => t.id === v.id), (n) => ({ ...n, tags: apply(n.tags, v) }));
      return snap;
    },
    onError: (_e, _v, snap) => rollback(qc, snap),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notesKeys.tags() });
      void qc.invalidateQueries({ queryKey: notesKeys.lists() });
      void qc.invalidateQueries({ queryKey: notesKeys.details() });
    },
  });
}
export const useRenameTag = () => useTagChange<{ id: number; name: string }>((v) => noteTagsApi.rename(v.id, v.name), (t, v) => ({ ...t, name: v.name }));
export const useRemoveTag = () => useTagChange<{ id: number }>((v) => noteTagsApi.remove(v.id), () => null);
