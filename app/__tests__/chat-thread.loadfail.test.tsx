/**
 * A thread whose load FAILS says so, even when it opened with the list's last
 * message already drawn.
 *
 * Found on a device, 2026-11-25 (readiness States, flow 82): with the
 * messages request answering 500, the thread showed the one message the chats
 * list knew (`lastKnownMessages`) and nothing else, with no sentence and no
 * way to retry, as if that one message were the whole conversation. The
 * failure line lived only in the list's EMPTY component, and a seeded list
 * is never empty.
 */
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: "70", name: "Sam Doe", isGroup: "0", unread: "0" }),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));
jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {}, performOnChannel: () => false }));
jest.mock("@/hooks/useMe", () => ({
  useMe: () => (jest.requireActual("@/stores/auth.store") as typeof import("@/stores/auth.store")).useAuthStore((s) => s.user),
}));

/* eslint-disable import/first */
import Thread from "../chat/[id]";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { messagesApi } from "@/api/ai";
import { conversationKeys } from "@/api/keys";
import { testQueryClient } from "@/__tests__/queryClient";
import { useAuthStore } from "@/stores/auth.store";
/* eslint-enable import/first */

const sam = { id: 8, fullname: "Sam Doe", email: "sam@example.test", avatar: null, is_online: false };
const message = (over: Record<string, unknown> = {}) => ({
  id: 500, conversation_id: 70, body: "See you at noon", created_at: "2026-11-16T09:00:00.000Z",
  deleted: false, edited_at: null, links: [], sources: [], rating: null, read_at: null, role: null,
  sent_by_me: false, undoable: false, undone_at: null, user: sam, user_id: 8, reactions: [], ...over,
});
const last = message({ id: 501, body: "the last one, from the list" });

let mock: MockAdapter;
beforeEach(async () => {
  await AsyncStorage.clear();
  useAuthStore.setState({ user: { id: 7, email: null, firstName: null, lastName: null, fullName: null, avatar: null } as never });
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mock.onPost("/api/v1/conversations/70/mark_read").reply(200, { conversation: { id: 70 } });
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

function renderSeeded() {
  const client = testQueryClient();
  // What the chats list knew when the row was tapped: the thread's seed.
  client.setQueryData(conversationKeys.list(), {
    pages: [{ conversations: [{ id: 70, lastMessage: messagesApi.parseOne(last) }], unreadConversations: 0, hasMore: false }],
    pageParams: [1],
  });
  // The list's data must outlive gcTime 0 until the thread reads it.
  const view = render(
    <QueryClientProvider client={client}>
      <Thread />
    </QueryClientProvider>,
  );
  return view;
}

describe("a seeded thread whose load fails", () => {
  it("says the load failed and offers Try again, under the message it already had", async () => {
    mock.onGet("/api/v1/conversations/70/messages").replyOnce(500, { status: 500, error: "Internal Server Error" });
    const view = renderSeeded();
    expect(await screen.findByText("the last one, from the list")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("thread-load-failed")).toBeTruthy());

    // The way out works: the full page arrives and the sentence goes.
    mock.onGet("/api/v1/conversations/70/messages").reply(200, { messages: [message(), last], meta: { pagy: { pages: 1 } } });
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("See you at noon")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("thread-load-failed")).toBeNull());
    view.unmount();
  });
});
