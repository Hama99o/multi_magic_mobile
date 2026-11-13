/**
 * Every optimistic Contacts write, both ways (`docs/DATA_LAYER.md` rule 3):
 * the cache changes BEFORE the server answers, a refusal puts it back, and
 * the keys the write touched are refetched.
 *
 * The server's answer is held with a gate so "before it answers" is a real
 * moment in the test, not a hope about timing.
 */
import MockAdapter from "axios-mock-adapter";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http } from "@/api/http";
import { contactsKeys } from "@/api/keys";
import type { Contact } from "@/api/contacts";
import { testQueryClient } from "@/__tests__/queryClient";
import { useContactsUndo } from "@/stores/contactsUndo.store";
import {
  useDestroyForever, useFavourite, useRestoreContact, useTrashContact, useUnlinkRelative,
} from "../useContactMutations";

const BASE = "/api/v1/contact_app/contacts";
let mock: MockAdapter;
let client: QueryClient;

function contact(id: number, over: Partial<Contact> = {}): Contact {
  return {
    id, firstname: `C${id}`, lastname: "Test", nickname: null, company: null, jobTitle: null, favorite: false,
    birthDate: null, age: null, photoUrl: null, phones: [], emails: [], addresses: [], relations: [], documents: [],
    website: null, notes: null, isSelf: false,
    ...over,
  } as unknown as Contact;
}

/** A server answer that waits until the test opens the gate. */
function gated(status: number, body: unknown = {}) {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, reply: async () => (await opened, [status, body] as [number, unknown]) };
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mock = new MockAdapter(http);
  // gcTime Infinity: these entries have no observer, and must survive the test.
  client = testQueryClient({ queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } });
  client.setQueryData(contactsKeys.list(), [contact(1), contact(2)]);
  client.setQueryData(contactsKeys.detail(1), contact(1, { relations: [{ id: 9, kind: "sibling", label: "brother", relative: { id: 2, name: "C2 Test" } } as never] }));
  client.setQueryData(contactsKeys.trash(), [contact(3)]);
  useContactsUndo.setState({ trashed: null });
});
afterEach(() => {
  mock.restore();
  client.clear();
});

const list = () => client.getQueryData<Contact[]>(contactsKeys.list()) ?? [];
const detail = (id: number) => client.getQueryData<Contact>(contactsKeys.detail(id));
const trash = () => client.getQueryData<Contact[]>(contactsKeys.trash()) ?? [];

describe("favourite", () => {
  it("the list and the card show it at once; refetched after", async () => {
    const g = gated(200, { contact: { ...contact(1), favorite: true } });
    mock.onPut(`${BASE}/1`).reply(g.reply);
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useFavourite(), { wrapper });
    act(() => result.current.mutate(contact(1)));
    await waitFor(() => expect(list()[0].favorite).toBe(true));
    expect(detail(1)?.favorite).toBe(true);
    g.open();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(contactsKeys.list()), JSON.stringify(contactsKeys.detail(1))]));
  });

  it("a refusal puts both back, and says so", async () => {
    const g = gated(500);
    mock.onPut(`${BASE}/1`).reply(g.reply);
    const onError = jest.fn();
    const { result } = renderHook(() => useFavourite({ onError }), { wrapper });
    act(() => result.current.mutate(contact(1)));
    await waitFor(() => expect(list()[0].favorite).toBe(true));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(list()[0].favorite).toBe(false);
    expect(detail(1)?.favorite).toBe(false);
    expect(onError).toHaveBeenCalled();
  });
});

describe("delete (to the trash)", () => {
  it("leaves the list at once; Undo offered after the server agrees", async () => {
    const g = gated(204);
    mock.onDelete(`${BASE}/1`).reply(g.reply);
    const { result } = renderHook(() => useTrashContact(), { wrapper });
    act(() => result.current.mutate(contact(1)));
    await waitFor(() => expect(list().map((c) => c.id)).toEqual([2]));
    expect(useContactsUndo.getState().trashed).toBeNull();
    g.open();
    await waitFor(() => expect(useContactsUndo.getState().trashed?.id).toBe(1));
  });

  it("a refusal brings the row back, and no Undo appears", async () => {
    const g = gated(500);
    mock.onDelete(`${BASE}/1`).reply(g.reply);
    const { result } = renderHook(() => useTrashContact(), { wrapper });
    act(() => result.current.mutate(contact(1)));
    await waitFor(() => expect(list()).toHaveLength(1));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(list().map((c) => c.id)).toEqual([1, 2]);
    expect(useContactsUndo.getState().trashed).toBeNull();
  });
});

describe("restore and delete for ever (the trash)", () => {
  it("restore: out of the trash at once; back on a refusal", async () => {
    const g = gated(500);
    mock.onPut(`${BASE}/3/restore`).reply(g.reply);
    const { result } = renderHook(() => useRestoreContact(), { wrapper });
    act(() => result.current.mutate(3));
    await waitFor(() => expect(trash()).toHaveLength(0));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(trash().map((c) => c.id)).toEqual([3]);
  });

  it("restore: the list is refetched after, so the row comes back", async () => {
    mock.onPut(`${BASE}/3/restore`).reply(200);
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRestoreContact(), { wrapper });
    act(() => result.current.mutate(3));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(contactsKeys.list()), JSON.stringify(contactsKeys.trash())]));
  });

  it("delete for ever: gone at once; back on a refusal", async () => {
    const g = gated(500);
    mock.onDelete(`${BASE}/3/destroy_permanently`).reply(g.reply);
    const { result } = renderHook(() => useDestroyForever(), { wrapper });
    act(() => result.current.mutate(3));
    await waitFor(() => expect(trash()).toHaveLength(0));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(trash()).toHaveLength(1);
  });
});

describe("family", () => {
  it("removing a tie: gone from the card at once; back on a refusal", async () => {
    const g = gated(500);
    mock.onDelete(`${BASE}/1/relations/9`).reply(g.reply);
    const { result } = renderHook(() => useUnlinkRelative(1), { wrapper });
    act(() => result.current.mutate(9));
    await waitFor(() => expect(detail(1)?.relations).toHaveLength(0));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(detail(1)?.relations.map((r) => r.id)).toEqual([9]);
  });
});
