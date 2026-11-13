/**
 * Every optimistic Calendar write, both ways (`docs/DATA_LAYER.md` rule 3),
 * and the ones that are deliberately NOT optimistic, shown to be so.
 * The server's answer is held with a gate, so "before it answers" is a real
 * moment in the test.
 */
import MockAdapter from "axios-mock-adapter";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http } from "@/api/http";
import { calendarKeys } from "@/api/keys";
import type { CalendarEvent, OccurrencePage, Share } from "@/api/calendar";
import { testQueryClient } from "@/__tests__/queryClient";
import { useInviteGuest, useRemoveEvent, useRemoveGuest, useRespond, useRestoreEvent, useSetGuestAccess } from "../useCalendarMutations";

const BASE = "/api/v1/calendar_app/events";
let mock: MockAdapter;
let client: QueryClient;

const share = (id: number, over: Partial<Share> = {}): Share =>
  ({ id, permission: "viewer", response: "pending", sharedWithId: 100 + id, sharedWithName: `Guest ${id}`, sharedWithEmail: null, ...over }) as Share;
const event = (id: number, over: Partial<CalendarEvent> = {}) => ({ id, title: `E${id}`, response: null, shares: [share(1), share(2)], ...over }) as unknown as CalendarEvent;
const page = (...ids: number[]): OccurrencePage =>
  ({ occurrences: ids.map((id) => ({ key: `${id}:2026-11-20`, on: "2026-11-20", startsAt: null, endsAt: null, allDay: true, event: event(id) })), unreadable: 0 }) as unknown as OccurrencePage;

function gated(status: number, body: unknown = {}) {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, reply: async () => (await opened, [status, body] as [number, unknown]) };
}
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  mock = new MockAdapter(http);
  client = testQueryClient({ queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } });
  client.setQueryData(calendarKeys.occurrences("2026-11-01", "2026-12-01"), page(7, 8));
  client.setQueryData(calendarKeys.upcoming(7), page(7));
  client.setQueryData(calendarKeys.event(7), event(7));
  client.setQueryData(calendarKeys.shares(7), [share(1), share(2)]);
});
afterEach(() => {
  mock.restore();
  client.clear();
});

const month = () => client.getQueryData<OccurrencePage>(calendarKeys.occurrences("2026-11-01", "2026-12-01"))!.occurrences.map((o) => o.event.id);
const agenda = () => client.getQueryData<OccurrencePage>(calendarKeys.upcoming(7))!.occurrences.map((o) => o.event.id);
const shares = () => client.getQueryData<Share[]>(calendarKeys.shares(7))!;
const shown = () => client.getQueryData<CalendarEvent>(calendarKeys.event(7))!;

describe("delete an event", () => {
  it("gone from the month and the agenda at once", async () => {
    const g = gated(204);
    mock.onDelete(`${BASE}/7`).reply(g.reply);
    const onDone = jest.fn();
    const { result } = renderHook(() => useRemoveEvent(7, { onDone }), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(month()).toEqual([8]));
    expect(agenda()).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
    g.open();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("a refusal puts it back in both", async () => {
    const g = gated(500);
    mock.onDelete(`${BASE}/7`).reply(g.reply);
    const { result } = renderHook(() => useRemoveEvent(7), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(month()).toEqual([8]));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(month()).toEqual([7, 8]);
    expect(agenda()).toEqual([7]);
  });
});

describe("answer an invitation", () => {
  it("shows the answer at once; a refusal puts the old one back", async () => {
    const g = gated(500);
    mock.onPut(`${BASE}/7/event_shares/respond`).reply(g.reply);
    const { result } = renderHook(() => useRespond(7), { wrapper });
    act(() => result.current.mutate("accepted"));
    await waitFor(() => expect(shown().response).toBe("accepted"));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(shown().response).toBeNull();
  });
});

describe("guests", () => {
  it("changing access shows at once, in the list and on the event; rolled back on a refusal", async () => {
    const g = gated(500);
    mock.onPut(`${BASE}/7/event_shares/1`).reply(g.reply);
    const { result } = renderHook(() => useSetGuestAccess(7), { wrapper });
    act(() => result.current.mutate({ share: share(1), permission: "editor" }));
    await waitFor(() => expect(shares()[0].permission).toBe("editor"));
    expect(shown().shares[0].permission).toBe("editor");
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(shares()[0].permission).toBe("viewer");
    expect(shown().shares[0].permission).toBe("viewer");
  });

  it("removing a guest: gone at once; back on a refusal", async () => {
    const g = gated(500);
    mock.onDelete(`${BASE}/7/event_shares/2`).reply(g.reply);
    const { result } = renderHook(() => useRemoveGuest(7), { wrapper });
    act(() => result.current.mutate(share(2)));
    await waitFor(() => expect(shares().map((s) => s.id)).toEqual([1]));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(shares().map((s) => s.id)).toEqual([1, 2]);
  });

  it("inviting is NOT optimistic: nobody appears until the server names them", async () => {
    const g = gated(201, { id: 3, permission: "viewer", response: "pending", shared_with_id: 103, shared_with_name: "Guest 3" });
    mock.onPost(`${BASE}/7/event_shares`).reply(g.reply);
    const { result } = renderHook(() => useInviteGuest(7), { wrapper });
    act(() => result.current.mutate({ email: "g3@example.test", access: "viewer" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(shares()).toHaveLength(2);
    g.open();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("restore (Undo)", () => {
  it("refetches every view and the event, nothing outside the calendar", async () => {
    mock.onPut(`${BASE}/7/restore`).reply(200, { id: 7 });
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRestoreEvent(), { wrapper });
    act(() => result.current.mutate(7));
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(calendarKeys.allOccurrences()), JSON.stringify(calendarKeys.allUpcoming()), JSON.stringify(calendarKeys.event(7))]));
    expect(keys).not.toContain(JSON.stringify(calendarKeys.all));
  });
});
