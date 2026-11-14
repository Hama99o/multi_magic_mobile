/**
 * The Calendar writes, through React Query (`docs/DATA_LAYER.md`), shared by
 * the month/agenda (`app/calendar/index.tsx`), the event (`event.tsx`), the
 * form (`edit.tsx`) and the guests (`GuestsSection.tsx`).
 *
 * OPTIMISTIC where the person sees the change at once: deleting an event
 * (gone from the month and the agenda), restoring it (the Undo bar goes),
 * answering an invitation, changing a guest's access, removing a guest.
 * Each has `onMutate` (cancel, snapshot, write), `onError` (put back) and
 * `onSettled` (refetch exactly what the write touched).
 *
 * NOT optimistic, on purpose:
 *  - inviting a guest: the server turns the address into a person, or
 *    refuses it (`event_shares#find_recipient`), so a guess would show a
 *    guest who may not exist;
 *  - leaving an event, and the form's save: the screen closes on the answer.
 */
import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { calendarApi, sharesApi, type CalendarEvent, type EventPayload, type GuestPermission, type OccurrencePage, type Share } from "@/api/calendar";
import { calendarKeys } from "@/api/keys";

type Snapshot = [QueryKey, unknown][];

async function snapshot(client: QueryClient, prefixes: QueryKey[]): Promise<Snapshot> {
  await Promise.all(prefixes.map((queryKey) => client.cancelQueries({ queryKey })));
  return prefixes.flatMap((queryKey) => client.getQueriesData({ queryKey }));
}

/** A write-back of what the key held: it cannot change a shape (see `queryKeys.test.ts`). */
function restore(client: QueryClient, saved: Snapshot | undefined) {
  for (const [queryKey, data] of saved ?? []) client.setQueriesData({ queryKey, exact: true }, data);
}

const settle = (client: QueryClient, keys: QueryKey[]) => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));

/** The windows an event can appear in: every month window, every agenda page. */
const VIEWS = [calendarKeys.allOccurrences(), calendarKeys.allUpcoming()];

function withoutEvent(page: OccurrencePage | undefined, eventId: number): OccurrencePage | undefined {
  return page ? { ...page, occurrences: page.occurrences.filter((o) => o.event.id !== eventId) } : page;
}

export function useRemoveEvent(eventId: number, opts: { onDone?: () => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => calendarApi.remove(eventId),
    onMutate: async () => {
      const saved = await snapshot(client, VIEWS);
      for (const queryKey of VIEWS) client.setQueriesData<OccurrencePage>({ queryKey }, (page) => withoutEvent(page, eventId));
      return { saved };
    },
    onSuccess: () => opts.onDone?.(),
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, [...VIEWS, calendarKeys.event(eventId)]),
  });
}

/** Undo a delete: the bar goes at once; the event comes back with the refetch. */
export function useRestoreEvent(opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => calendarApi.restore(eventId),
    onError: (e) => opts.onError?.(e),
    onSettled: (_r, _e, eventId) => settle(client, [...VIEWS, calendarKeys.event(eventId)]),
  });
}

/** Accept or decline an invitation: the answer shows at once on the event. */
export function useRespond(eventId: number, opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (answer: "accepted" | "declined") => sharesApi.respond(eventId, answer),
    onMutate: async (answer) => {
      const saved = await snapshot(client, [calendarKeys.event(eventId)]);
      client.setQueryData<CalendarEvent>(calendarKeys.event(eventId), (e) => (e ? { ...e, response: answer } : e));
      return { saved };
    },
    onError: (e, _a, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, [calendarKeys.event(eventId), ...VIEWS]),
  });
}

/** Leave an event someone shared: the screen closes on the answer. */
export function useLeaveEvent(eventId: number, opts: { onDone?: () => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (shareId: number) => sharesApi.remove(eventId, shareId),
    onSuccess: () => opts.onDone?.(),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settle(client, [...VIEWS, calendarKeys.event(eventId)]),
  });
}

function patchShares(client: QueryClient, eventId: number, edit: (rows: Share[]) => Share[]) {
  client.setQueryData<Share[]>(calendarKeys.shares(eventId), (rows) => (rows ? edit(rows) : rows));
  client.setQueryData<CalendarEvent>(calendarKeys.event(eventId), (e) => (e ? { ...e, shares: edit(e.shares) } : e));
}

export function useInviteGuest(eventId: number, opts: { onDone?: () => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, access }: { email: string; access: GuestPermission }) => sharesApi.invite(eventId, email, access),
    onSuccess: () => opts.onDone?.(),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settle(client, [calendarKeys.shares(eventId), calendarKeys.event(eventId)]),
  });
}

export function useSetGuestAccess(eventId: number, opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ share, permission }: { share: Share; permission: GuestPermission }) => sharesApi.setPermission(eventId, share.id, permission),
    onMutate: async ({ share, permission }) => {
      const saved = await snapshot(client, [calendarKeys.shares(eventId), calendarKeys.event(eventId)]);
      patchShares(client, eventId, (rows) => rows.map((r) => (r.id === share.id ? { ...r, permission } : r)));
      return { saved };
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, [calendarKeys.shares(eventId), calendarKeys.event(eventId)]),
  });
}

export function useRemoveGuest(eventId: number, opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (share: Share) => sharesApi.remove(eventId, share.id),
    onMutate: async (share) => {
      const saved = await snapshot(client, [calendarKeys.shares(eventId), calendarKeys.event(eventId)]);
      patchShares(client, eventId, (rows) => rows.filter((r) => r.id !== share.id));
      return { saved };
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, [calendarKeys.shares(eventId), calendarKeys.event(eventId)]),
  });
}

/** The form's save. The event is set from the answer; every view refetched. */
export function useSaveEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, payload, reminders }: { eventId: number | null; payload: EventPayload; reminders: number[] }) =>
      eventId == null ? calendarApi.create(payload, reminders) : calendarApi.update(eventId, payload, reminders),
    onSuccess: (saved) => {
      client.setQueryData(calendarKeys.event(saved.id), saved);
      return settle(client, VIEWS);
    },
  });
}
