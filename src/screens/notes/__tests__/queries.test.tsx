/**
 * THE NOTES DATA LAYER (owner, 2026-11-13: "use the query style well so it
 * doesn't get hard"). Every mutation that changes the screen at once is
 * optimistic: the list and the open note change before the server answers,
 * go back exactly as they were when it refuses, and only the affected keys
 * are invalidated afterwards.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { testQueryClient } from "@/__tests__/queryClient";
import { notesApi, type Note, type NoteList } from "@/api/notes";
import { noteTagsApi } from "@/api/noteTags";
import {
  notesKeys,
  useArchiveNote,
  useCreateNote,
  useDestroyNoteForever,
  useDuplicateNote,
  useLockNote,
  usePinNote,
  useRemoveTag,
  useRenameTag,
  useRestoreNote,
  useSaveNote,
  useSetNoteColor,
  useSetNoteReminder,
  useToggleNoteTag,
  useTrashNote,
  useUnarchiveNote,
} from "../api/queries";

jest.mock("@/api/notes", () => ({ ...jest.requireActual("@/api/notes"), notesApi: {} }));
jest.mock("@/api/noteTags", () => ({ noteTagsApi: {} }));

const note = (id: number, over: Partial<Note> = {}): Note => ({
  id, status: "published", locked: false, reminder: null, color: null, title: `n${id}`, html: "<p>x</p>",
  pinned: false, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", role: "owner",
  isShared: false, sharedCount: 0, tags: [], ...over,
});
const LIST = notesKeys.list({ view: "notes", search: "", tagId: null });
const page = (notes: Note[]): InfiniteData<NoteList> => ({ pages: [{ notes, unreadable: 0, hasMore: false, total: notes.length }], pageParams: [1] });

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const listNote = (id: number) => client.getQueryData<InfiniteData<NoteList>>(LIST)?.pages[0].notes.find((n) => n.id === id);
const detail = (id: number) => client.getQueryData<Note>(notesKeys.detail(id));

beforeEach(() => {
  // Seeded with no screen watching: kept (gcTime 0 would drop it at once).
  client = testQueryClient({ queries: { gcTime: Infinity } });
  client.setQueryData<InfiniteData<NoteList>>(LIST, page([note(1), note(2, { tags: [{ id: 7, name: "home", color: null }] })]));
  client.setQueryData<Note>(notesKeys.detail(1), note(1));
  client.setQueryData<Note>(notesKeys.detail(2), note(2, { tags: [{ id: 7, name: "home", color: null }] }));
  client.setQueryData(notesKeys.tags(), [{ id: 7, name: "home", color: null }]);
});
afterEach(() => client.clear());

/** A server call we answer by hand, so the optimistic state can be looked at. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Case = {
  name: string;
  api: [Record<string, unknown>, string];
  hook: () => { mutateAsync(v: never): Promise<unknown> };
  vars: unknown;
  /** What the list and the open note show before the server answers. */
  optimistic(): void;
  /** And after a refusal: exactly what was there. */
  rolledBack(): void;
};

const unchanged = (id: number) => () => {
  expect(listNote(id)).toEqual(id === 2 ? note(2, { tags: [{ id: 7, name: "home", color: null }] }) : note(id));
  expect(detail(id)).toEqual(id === 2 ? note(2, { tags: [{ id: 7, name: "home", color: null }] }) : note(id));
};

const CASES: Case[] = [
  {
    name: "pin", api: [notesApi, "setPinned"], hook: usePinNote, vars: { id: 1, pinned: true },
    optimistic: () => { expect(listNote(1)?.pinned).toBe(true); expect(detail(1)?.pinned).toBe(true); },
    rolledBack: unchanged(1),
  },
  {
    name: "colour", api: [notesApi, "setColor"], hook: useSetNoteColor, vars: { id: 1, color: "teal" },
    optimistic: () => { expect(listNote(1)?.color).toBe("teal"); expect(detail(1)?.color).toBe("teal"); },
    rolledBack: unchanged(1),
  },
  {
    name: "lock", api: [notesApi, "setLocked"], hook: useLockNote, vars: { id: 1, locked: true },
    optimistic: () => { expect(listNote(1)?.locked).toBe(true); expect(detail(1)?.locked).toBe(true); },
    rolledBack: unchanged(1),
  },
  {
    name: "reminder", api: [notesApi, "setReminder"], hook: useSetNoteReminder, vars: { id: 1, reminder: { at: new Date("2026-12-01T09:00:00Z"), repeat: null } },
    optimistic: () => { expect(listNote(1)?.reminder?.at.toISOString()).toBe("2026-12-01T09:00:00.000Z"); expect(detail(1)?.reminder).not.toBeNull(); },
    rolledBack: unchanged(1),
  },
  {
    name: "archive", api: [notesApi, "archive"], hook: useArchiveNote, vars: { id: 1 },
    optimistic: () => { expect(listNote(1)).toBeUndefined(); expect(detail(1)?.status).toBe("archived"); },
    rolledBack: unchanged(1),
  },
  {
    name: "unarchive", api: [notesApi, "unarchive"], hook: useUnarchiveNote, vars: { id: 1 },
    optimistic: () => { expect(listNote(1)).toBeUndefined(); expect(detail(1)?.status).toBe("published"); },
    rolledBack: unchanged(1),
  },
  {
    name: "trash", api: [notesApi, "trash"], hook: useTrashNote, vars: { id: 1 },
    optimistic: () => { expect(listNote(1)).toBeUndefined(); expect(detail(1)?.status).toBe("trashed"); },
    rolledBack: unchanged(1),
  },
  {
    name: "restore", api: [notesApi, "restore"], hook: useRestoreNote, vars: { id: 1 },
    optimistic: () => { expect(listNote(1)).toBeUndefined(); expect(detail(1)?.status).toBe("published"); },
    rolledBack: unchanged(1),
  },
  {
    name: "delete forever", api: [notesApi, "destroyForever"], hook: useDestroyNoteForever, vars: { id: 1 },
    optimistic: () => { expect(listNote(1)).toBeUndefined(); },
    rolledBack: unchanged(1),
  },
  {
    name: "label on a note", api: [noteTagsApi, "toggleOnNote"], hook: useToggleNoteTag, vars: { id: 2, tag: { id: 7, name: "home", color: null } },
    optimistic: () => { expect(listNote(2)?.tags).toEqual([]); expect(detail(2)?.tags).toEqual([]); },
    rolledBack: unchanged(2),
  },
  {
    name: "rename a label", api: [noteTagsApi, "rename"], hook: useRenameTag, vars: { id: 7, name: "house" },
    optimistic: () => {
      expect(client.getQueryData<{ name: string }[]>(notesKeys.tags())?.[0].name).toBe("house");
      expect(listNote(2)?.tags[0].name).toBe("house");
      expect(detail(2)?.tags[0].name).toBe("house");
    },
    rolledBack: () => { expect(client.getQueryData<{ name: string }[]>(notesKeys.tags())?.[0].name).toBe("home"); unchanged(2)(); },
  },
  {
    name: "remove a label", api: [noteTagsApi, "remove"], hook: useRemoveTag, vars: { id: 7 },
    optimistic: () => {
      expect(client.getQueryData(notesKeys.tags())).toEqual([]);
      expect(listNote(2)?.tags).toEqual([]);
      expect(detail(2)?.tags).toEqual([]);
    },
    rolledBack: () => { expect(client.getQueryData(notesKeys.tags())).toHaveLength(1); unchanged(2)(); },
  },
];

describe.each(CASES)("$name", (c) => {
  it("changes the list and the open note at once, and puts them back when the server refuses", async () => {
    const call = deferred<never>();
    c.api[0][c.api[1]] = jest.fn(() => call.promise);
    const { result } = renderHook(c.hook, { wrapper });
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.mutateAsync(c.vars as never).catch(() => "refused");
    });
    await waitFor(() => c.optimistic());
    await act(async () => {
      call.reject(new Error("500"));
      await done;
    });
    c.rolledBack();
  });
});

describe("what a mutation invalidates", () => {
  it("pin: the lists and that note, not the labels or other notes", async () => {
    (notesApi as Record<string, unknown>).setPinned = jest.fn(async () => note(1, { pinned: true }));
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(usePinNote, { wrapper });
    await act(() => result.current.mutateAsync({ id: 1, pinned: true }));
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys.sort()).toEqual([JSON.stringify(notesKeys.detail(1)), JSON.stringify(notesKeys.lists())].sort());
    expect(detail(1)?.pinned).toBe(true);
  });

  it("the save: writes the server's note into the open note and the cards, no stale card", async () => {
    (notesApi as Record<string, unknown>).update = jest.fn(async () => note(1, { title: "new", html: "<p>new</p>", updatedAt: "2026-11-02T00:00:00Z" }));
    const { result } = renderHook(useSaveNote, { wrapper });
    await act(() => result.current.mutateAsync({ id: 1, body: { title: "new", html: "<p>new</p>" }, expectedUpdatedAt: "2026-11-01T00:00:00Z" }));
    expect(notesApi.update).toHaveBeenCalledWith(1, { title: "new", html: "<p>new</p>" }, "2026-11-01T00:00:00Z");
    expect(listNote(1)?.title).toBe("new");
    expect(detail(1)?.updatedAt).toBe("2026-11-02T00:00:00Z");
  });

  it("copy and create: seed the new note and refresh the lists", async () => {
    (notesApi as Record<string, unknown>).duplicate = jest.fn(async () => note(9, { title: "n1 (copy)" }));
    (notesApi as Record<string, unknown>).create = jest.fn(async () => note(10));
    const spy = jest.spyOn(client, "invalidateQueries");
    const copy = renderHook(useDuplicateNote, { wrapper });
    await act(() => copy.result.current.mutateAsync({ id: 1 }));
    const made = renderHook(useCreateNote, { wrapper });
    await act(() => made.result.current.mutateAsync({ title: "", html: "" }));
    expect(detail(9)?.title).toBe("n1 (copy)");
    expect(detail(10)).toBeDefined();
    expect(spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))).toEqual([JSON.stringify(notesKeys.lists()), JSON.stringify(notesKeys.lists())]);
  });
});
