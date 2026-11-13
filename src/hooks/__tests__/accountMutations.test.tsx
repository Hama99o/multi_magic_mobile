/**
 * The optimistic Account and Notifications writes, both ways
 * (`docs/DATA_LAYER.md` rule 3): the profile's name, an AI key activated or
 * removed, a notification marked read. The server's answer is held with a
 * gate, so "before it answers" is a real moment in the test.
 */
import MockAdapter from "axios-mock-adapter";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http } from "@/api/http";
import { notificationKeys, profileKeys } from "@/api/keys";
import type { Profile } from "@/api/profile";
import type { AiKeyPayload } from "@/api/aiKeys";
import type { NotificationPage } from "@/api/notifications";
import { testQueryClient } from "@/__tests__/queryClient";
import { useActivateAiKey, useRemoveAiKey, useSaveProfile } from "../useAccountMutations";
import { useMarkNotificationRead } from "../useMarkNotificationRead";

let mock: MockAdapter;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

function gated(status: number, body: unknown = {}) {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, reply: async () => (await opened, [status, body] as [number, unknown]) };
}

const ME = { id: 7, email: "q@example.test", lang: "en", firstName: "Qa", lastName: "Old", fullName: "Qa Old", username: null, about: null, phoneNumber: null, aiMorningBrief: null, avatar: null, createdAt: null } as Profile;
const KEYS = { keys: [{ id: 1, active: true }, { id: 2, active: false }], providers: [] } as unknown as AiKeyPayload;
const NOTES = { pages: [{ notifications: [{ id: 5, readAt: null }, { id: 6, readAt: "2026-11-12T10:00:00Z" }], unreadCount: 1, hasMore: false }], pageParams: [1] } as unknown as InfiniteData<NotificationPage>;

beforeEach(() => {
  mock = new MockAdapter(http);
  client = testQueryClient({ queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } });
  client.setQueryData(profileKeys.me(), ME);
  client.setQueryData(profileKeys.aiKeys(), KEYS);
  client.setQueryData(notificationKeys.list(), NOTES);
  client.setQueryData(notificationKeys.unreadCount(), 1);
});
afterEach(() => {
  mock.restore();
  client.clear();
});

const me = () => client.getQueryData<Profile>(profileKeys.me())!;
const keys = () => client.getQueryData<AiKeyPayload>(profileKeys.aiKeys())!.keys;
const notes = () => client.getQueryData<InfiniteData<NotificationPage>>(notificationKeys.list())!.pages[0];

describe("the profile's name", () => {
  it("shows at once (the header reads it through useMe); back on a refusal", async () => {
    const g = gated(500);
    mock.onPatch(/\/users\/7$/).reply(g.reply);
    mock.onPut(/\/users\/7$/).reply(g.reply);
    const { result } = renderHook(() => useSaveProfile(7), { wrapper });
    act(() => result.current.mutate({ lastname: "New" }));
    await waitFor(() => expect(me().fullName).toBe("Qa New"));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(me().fullName).toBe("Qa Old");
  });
});

describe("AI keys", () => {
  it("activating moves the tick at once; back on a refusal", async () => {
    const g = gated(500);
    mock.onPut("/api/v1/ai_keys/2/activate").reply(g.reply);
    const { result } = renderHook(() => useActivateAiKey(), { wrapper });
    act(() => result.current.mutate(2));
    await waitFor(() => expect(keys().map((k) => k.active)).toEqual([false, true]));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(keys().map((k) => k.active)).toEqual([true, false]);
  });

  it("removing: the row goes at once; back on a refusal", async () => {
    const g = gated(500);
    mock.onDelete("/api/v1/ai_keys/2").reply(g.reply);
    const { result } = renderHook(() => useRemoveAiKey(), { wrapper });
    act(() => result.current.mutate(2));
    await waitFor(() => expect(keys().map((k) => k.id)).toEqual([1]));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(keys().map((k) => k.id)).toEqual([1, 2]);
  });
});

describe("a notification opened", () => {
  it("is read at once, and every badge drops by one; all back on a refusal", async () => {
    const g = gated(500);
    mock.onAny(/notifications\/5/).reply(g.reply);
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    act(() => result.current.mutate(5));
    await waitFor(() => expect(notes().notifications[0].readAt).not.toBeNull());
    expect(notes().unreadCount).toBe(0);
    expect(client.getQueryData(notificationKeys.unreadCount())).toBe(0);
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notes().notifications[0].readAt).toBeNull();
    expect(client.getQueryData(notificationKeys.unreadCount())).toBe(1);
  });

  it("an already-read one changes no badge", async () => {
    mock.onAny(/notifications\/6/).reply(200, { id: 6 });
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    act(() => result.current.mutate(6));
    await waitFor(() => expect(client.getQueryData(notificationKeys.unreadCount())).toBe(1));
    expect(notes().unreadCount).toBe(1);
  });
});
