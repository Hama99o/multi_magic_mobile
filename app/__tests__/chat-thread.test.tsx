/**
 * A thread with a person: clearing it (audit P1 #31) and its reactions
 * (audit P2: the chips could not be tapped, and a failed reaction said
 * nothing).
 */
import MockAdapter from "axios-mock-adapter";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: "70", name: "Sam Doe", isGroup: "0", unread: "0" }),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));
jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {}, performOnChannel: () => false }));

/* eslint-disable import/first */
import Thread from "../chat/[id]";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";

const { router } = jest.requireMock("expo-router") as {
  router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };
};

const sam = { id: 8, fullname: "Sam Doe", email: "sam@example.test", avatar: null, is_online: false };

function message(over: Record<string, unknown> = {}) {
  return {
    id: 500, conversation_id: 70, body: "See you at noon", created_at: "2026-11-16T09:00:00.000Z",
    deleted: false, edited_at: null, links: [], sources: [], rating: null, read_at: null, role: null,
    sent_by_me: false, undoable: false, undone_at: null, user: sam, user_id: 8,
    reactions: [{ emoji: "👍", count: 1, mine: true }],
    ...over,
  };
}

function conversation(over: Record<string, unknown> = {}) {
  return {
    id: 70, created_at: "2026-11-01T09:00:00.000Z", updated_at: "2026-11-16T09:00:00.000Z", title: null,
    is_group: false, can_delete: true, is_admin: false, user: sam, participants: [], last_message: null,
    unread_messages_count: 0, ...over,
  };
}

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  router.back.mockClear();
  router.replace.mockClear();
  router.canGoBack.mockReturnValue(true);
  mock.onGet("/api/v1/conversations/70/messages").reply(200, { messages: [message()], meta: { pagy: { pages: 1 } } });
  mock.onPost("/api/v1/conversations/70/mark_read").reply(200, { conversation: conversation() });
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

function renderThread() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <Thread />
    </QueryClientProvider>,
  );
}

describe("deleting the conversation (for me)", () => {
  it("is offered when the reader may, confirmed, then the thread closes", async () => {
    mock.onGet("/api/v1/conversations/70").reply(200, { conversation: conversation() });
    mock.onDelete("/api/v1/conversations/70").reply(200, { message: "Conversation deleted for you." });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    renderThread();
    fireEvent.press(await screen.findByLabelText("Delete this conversation"));
    // The confirm says what it does: it goes for you, not for the others.
    expect(alert.mock.calls[0][1]).toBe("It goes from your chats. The others keep their copy.");
    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it("is not offered in a group the reader does not administer", async () => {
    mock.onGet("/api/v1/conversations/70").reply(200, { conversation: conversation({ is_group: true, can_delete: false }) });
    renderThread();
    await screen.findByText("See you at noon");
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByLabelText("Delete this conversation")).toBeNull();
  });

  it("a refusal is said, and the thread stays", async () => {
    mock.onGet("/api/v1/conversations/70").reply(200, { conversation: conversation() });
    mock.onDelete("/api/v1/conversations/70").reply(403, { error: "Only an admin can do that" });
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    renderThread();
    fireEvent.press(await screen.findByLabelText("Delete this conversation"));
    expect(await screen.findByTestId("thread-error")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe("reactions", () => {
  beforeEach(() => {
    mock.onGet("/api/v1/conversations/70").reply(200, { conversation: conversation() });
  });

  it("a chip is a button: pressing mine takes it back (the endpoint is a toggle)", async () => {
    mock.onPost("/api/v1/conversations/70/messages/500/reactions").reply(200, message({ reactions: [] }));
    renderThread();
    fireEvent.press(await screen.findByLabelText("Remove 👍"));
    await waitFor(() => expect(mock.history.post.filter((r) => r.url?.endsWith("/reactions"))).toHaveLength(1));
    expect(JSON.parse(mock.history.post.find((r) => r.url?.endsWith("/reactions"))!.data)).toEqual({ emoji: "👍" });
    await waitFor(() => expect(screen.queryByLabelText("Remove 👍")).toBeNull());
  });

  it("a failed reaction says so", async () => {
    mock.onPost("/api/v1/conversations/70/messages/500/reactions").networkError();
    renderThread();
    fireEvent.press(await screen.findByLabelText("Remove 👍"));
    expect(await screen.findByTestId("thread-error")).toBeTruthy();
  });
});

// ── SEARCH IN THIS THREAD (audit #29) ─────────────────────────────────────
// The web's ThreadSearch: a field under the header, the messages route with
// `search`, and a result that loads history back to the message and shows it.
describe("searching this thread", () => {
  const url = "/api/v1/conversations/70/messages";
  type Reply = [number, unknown];
  let onSearch: (term: string) => Reply;
  let onBefore: (beforeId: number) => Reply;
  let latestPages = 1;

  beforeEach(() => {
    mock.reset();
    latestPages = 1;
    onSearch = () => [200, { messages: [], meta: { pagy: { pages: 1 } } }];
    onBefore = () => [200, { messages: [], meta: { has_more: false } }];
    mock.onPost("/api/v1/conversations/70/mark_read").reply(200, { conversation: conversation() });
    mock.onGet("/api/v1/conversations/70").reply(200, { conversation: conversation() });
    mock.onGet(url).reply((config) => {
      if (config.params?.search) return onSearch(config.params.search);
      if (config.params?.before_id) return onBefore(config.params.before_id);
      return [200, { messages: [message()], meta: { pagy: { pages: latestPages } } }];
    });
  });

  async function openSearch(term: string) {
    renderThread();
    await screen.findByText("See you at noon");
    fireEvent.press(screen.getByLabelText("Search in this chat"));
    fireEvent.changeText(await screen.findByTestId("thread-search-input"), term);
  }

  it("asks the server with the term and lists what it found", async () => {
    onSearch = () => [200, { messages: [message({ id: 500 })], meta: { pagy: { pages: 1 } } }];
    await openSearch("noon");
    expect(await screen.findByTestId("thread-search-result-500")).toBeTruthy();
    expect(mock.history.get.find((r) => r.params?.search)?.params).toEqual({ search: "noon" });
  });

  it("one letter does not search, as on the web", async () => {
    await openSearch("n");
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    expect(mock.history.get.filter((r) => r.params?.search)).toHaveLength(0);
  });

  it("no match says so", async () => {
    await openSearch("zebra");
    expect(await screen.findByText("Nothing matches that.")).toBeTruthy();
  });

  it("a failed search says so", async () => {
    onSearch = () => [500, {}];
    await openSearch("noon");
    expect(await screen.findByTestId("thread-search-failed")).toBeTruthy();
  });

  it("a result already on screen closes the search and is marked", async () => {
    onSearch = () => [200, { messages: [message({ id: 500 })], meta: { pagy: { pages: 1 } } }];
    await openSearch("noon");
    fireEvent.press(await screen.findByTestId("thread-search-result-500"));
    expect(await screen.findByTestId("thread-found-500")).toBeTruthy();
    expect(screen.queryByTestId("thread-search-input")).toBeNull();
  });

  it("an older result loads history back to it first", async () => {
    latestPages = 2;
    const old = message({ id: 120, body: "the address is 4 rue X", reactions: [] });
    onSearch = () => [200, { messages: [old], meta: { pagy: { pages: 1 } } }];
    onBefore = () => [200, { messages: [old], meta: { has_more: false } }];
    await openSearch("address");
    fireEvent.press(await screen.findByTestId("thread-search-result-120"));
    expect(await screen.findByTestId("thread-found-120")).toBeTruthy();
    expect(mock.history.get.find((r) => r.params?.before_id)?.params).toEqual({ before_id: 500 });
  });
});
