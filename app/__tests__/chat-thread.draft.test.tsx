/**
 * A half-typed message to a PERSON survives the app being killed, like the
 * assistant's (src/hooks/useDraft.ts). Found on a device, 2026-11-25
 * (readiness Kill, flow 78): the assistant's draft came back after a
 * force-stop, the thread's did not: it lived in `useState` only.
 *
 * An EDIT's text is a different thing: it rewrites a message already sent, so
 * it is never stored as the draft of a new one (a relaunch would otherwise
 * offer the old message's words as a fresh message, one tap from a duplicate).
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
// As useDraft.test.ts: the signed-in user through the auth store.
jest.mock("@/hooks/useMe", () => ({
  useMe: () => (jest.requireActual("@/stores/auth.store") as typeof import("@/stores/auth.store")).useAuthStore((s) => s.user),
}));

/* eslint-disable import/first */
import Thread from "../chat/[id]";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useAuthStore } from "@/stores/auth.store";
/* eslint-enable import/first */

const KEY = "mm-draft:7:70";
const sam = { id: 8, fullname: "Sam Doe", email: "sam@example.test", avatar: null, is_online: false };
const message = (over: Record<string, unknown> = {}) => ({
  id: 500, conversation_id: 70, body: "See you at noon", created_at: "2026-11-16T09:00:00.000Z",
  deleted: false, edited_at: null, links: [], sources: [], rating: null, read_at: null, role: null,
  sent_by_me: false, undoable: false, undone_at: null, user: sam, user_id: 8, reactions: [], ...over,
});

let mock: MockAdapter;
beforeEach(async () => {
  await AsyncStorage.clear();
  useAuthStore.setState({ user: { id: 7, email: null, firstName: null, lastName: null, fullName: null, avatar: null } as never });
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mock.onGet("/api/v1/conversations/70/messages").reply(200, { messages: [message()], meta: { pagy: { pages: 1 } } });
  mock.onPost("/api/v1/conversations/70/mark_read").reply(200, { conversation: { id: 70 } });
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const renderThread = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <Thread />
    </QueryClientProvider>,
  );

describe("the thread's draft", () => {
  it("is stored as it is typed and comes back after the app is killed", async () => {
    const first = renderThread();
    fireEvent.changeText(await screen.findByTestId("people-composer-input"), "on my way, ten minutes");
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("on my way, ten minutes"));
    first.unmount(); // the process is gone; only the phone's storage is left

    renderThread();
    await waitFor(() => expect(screen.getByTestId("people-composer-input").props.value).toBe("on my way, ten minutes"));
  });

  it("never stores an edit's text as a new message's draft", async () => {
    mock.onGet("/api/v1/conversations/70/messages").reply(200, {
      messages: [message({ id: 502, body: "old words", sent_by_me: true, user_id: 7, user: { ...sam, id: 7 } })],
      meta: { pagy: { pages: 1 } },
    });
    const first = renderThread();
    fireEvent(await screen.findByTestId("msg-mine-502"), "longPress");
    fireEvent.press(await screen.findByTestId("message-action-edit"));
    await waitFor(() => expect(screen.getByTestId("people-composer-input").props.value).toBe("old words"));
    fireEvent.changeText(screen.getByTestId("people-composer-input"), "new words");
    await new Promise((r) => setTimeout(r, 50));
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    first.unmount();

    renderThread();
    await screen.findByTestId("msg-mine-502");
    expect(screen.getByTestId("people-composer-input").props.value).toBe("");
  });

  it("is cleared from storage once the message is sent", async () => {
    mock.onPost("/api/v1/conversations/70/messages").reply(201, message({ id: 501, body: "sent now", sent_by_me: true, user_id: 7 }));
    renderThread();
    fireEvent.changeText(await screen.findByTestId("people-composer-input"), "sent now");
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("sent now"));
    fireEvent.press(screen.getByTestId("people-composer-send"));
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBeNull());
  });
});
