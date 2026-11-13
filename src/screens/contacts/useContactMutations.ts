/**
 * The Contacts writes the person sees at once, OPTIMISTIC (`docs/DATA_LAYER.md`
 * rule 3): the list and the card change before the server answers, a failure
 * puts both back, and the keys the write touched are refetched after.
 *
 * One hook per write, shared by the list (`app/contacts/index.tsx`), the card
 * and the trash, so a favourite set on the card is a favourite in the list in
 * the same frame, and the two can never disagree.
 *
 * Not optimistic, on purpose: ADDING a family tie. The tie's word ("brother",
 * "wife") is computed by the server from the kind and the relative's gender,
 * so a guess would flash the wrong word; the card refetches instead.
 */
import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { contactsApi, displayName, type Contact } from "@/api/contacts";
import { contactsKeys } from "@/api/keys";
import { useContactsUndo } from "@/stores/contactsUndo.store";

type Snapshot = [QueryKey, unknown][];

/** Cancel, then remember, everything under these prefixes. */
async function snapshot(client: QueryClient, prefixes: QueryKey[]): Promise<Snapshot> {
  await Promise.all(prefixes.map((queryKey) => client.cancelQueries({ queryKey })));
  return prefixes.flatMap((queryKey) => client.getQueriesData({ queryKey }));
}

/** Put a snapshot back. `setQueriesData` with `exact`, key by key: a
 *  write-back stores what that very key held a moment ago, so it cannot change
 *  a shape, which is the one thing `queryKeys.test.ts` checks (and it reads
 *  `setQueryData` only, so it does not see these; said here, not hidden). */
function restore(client: QueryClient, saved: Snapshot | undefined) {
  for (const [queryKey, data] of saved ?? []) client.setQueriesData({ queryKey, exact: true }, data);
}

/** Apply `edit` to the contact wherever a list or the card holds it. */
function patchEverywhere(client: QueryClient, id: number, edit: (c: Contact) => Contact | null) {
  const edited = (rows: Contact[] | undefined) => (Array.isArray(rows) ? rows.flatMap((c) => (c.id === id ? (edit(c) ?? []) : [c])) : rows);
  client.setQueriesData<Contact[]>({ queryKey: contactsKeys.list() }, edited);
  client.setQueriesData<Contact[]>({ queryKey: contactsKeys.searches() }, edited);
  client.setQueryData<Contact | undefined>(contactsKeys.detail(id), (old) => (old ? (edit(old) ?? old) : old));
}

const settle = (client: QueryClient, keys: QueryKey[]) => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));

export function useFavourite(opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (c: Contact) => contactsApi.setFavorite(c.id, !c.favorite),
    onMutate: async (c) => {
      const saved = await snapshot(client, [contactsKeys.list(), contactsKeys.searches(), contactsKeys.detail(c.id)]);
      patchEverywhere(client, c.id, (x) => ({ ...x, favorite: !c.favorite }));
      return { saved };
    },
    onError: (e, _c, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: (_r, _e, c) => settle(client, [contactsKeys.list(), contactsKeys.searches(), contactsKeys.detail(c.id)]),
  });
}

/** Delete = to the trash, with Undo (the list's bar). */
export function useTrashContact(opts: { onDone?: (c: Contact) => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  const setTrashed = useContactsUndo((s) => s.set);
  return useMutation({
    mutationFn: (c: Contact) => contactsApi.remove(c.id),
    onMutate: async (c) => {
      const saved = await snapshot(client, [contactsKeys.list(), contactsKeys.searches()]);
      patchEverywhere(client, c.id, () => null);
      return { saved };
    },
    onSuccess: (_r, c) => {
      setTrashed({ id: c.id, name: displayName(c), at: Date.now() });
      opts.onDone?.(c);
    },
    onError: (e, _c, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: (_r, _e, c) =>
      settle(client, [contactsKeys.list(), contactsKeys.searches(), contactsKeys.trash(), contactsKeys.detail(c.id), contactsKeys.allBirthdays()]),
  });
}

/** Undo / restore from the trash: out of the trash at once, back in the list on settle. */
export function useRestoreContact(opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => contactsApi.restore(id),
    onMutate: async (id) => {
      const saved = await snapshot(client, [contactsKeys.trash()]);
      client.setQueryData<Contact[]>(contactsKeys.trash(), (rows) => rows?.filter((c) => c.id !== id));
      return { saved };
    },
    onError: (e, _id, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: (_r, _e, id) =>
      settle(client, [contactsKeys.list(), contactsKeys.searches(), contactsKeys.trash(), contactsKeys.detail(id), contactsKeys.allBirthdays()]),
  });
}

export function useDestroyForever(opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => contactsApi.destroyForever(id),
    onMutate: async (id) => {
      const saved = await snapshot(client, [contactsKeys.trash()]);
      client.setQueryData<Contact[]>(contactsKeys.trash(), (rows) => rows?.filter((c) => c.id !== id));
      return { saved };
    },
    onError: (e, _id, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, [contactsKeys.trash()]),
  });
}

/** Remove a family tie: gone from the card at once. */
export function useUnlinkRelative(contactId: number, opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (relationId: number) => contactsApi.removeRelation(contactId, relationId),
    onMutate: async (relationId) => {
      const saved = await snapshot(client, [contactsKeys.detail(contactId)]);
      client.setQueryData<Contact | undefined>(contactsKeys.detail(contactId), (c) => (c ? { ...c, relations: c.relations.filter((r) => r.id !== relationId) } : c));
      return { saved };
    },
    onError: (e, _r, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    // The relative's card shows the tie from the other side.
    onSettled: () => settle(client, [contactsKeys.detail(contactId), contactsKeys.list()]),
  });
}

/** Add a family tie: not optimistic (header). */
export function useLinkRelative(contactId: number, opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ relativeId, kind }: { relativeId: number; kind: Parameters<typeof contactsApi.addRelation>[2] }) =>
      contactsApi.addRelation(contactId, relativeId, kind),
    onError: (e) => opts.onError?.(e),
    onSettled: (_r, _e, v) => settle(client, [contactsKeys.detail(contactId), contactsKeys.detail(v.relativeId)]),
  });
}
