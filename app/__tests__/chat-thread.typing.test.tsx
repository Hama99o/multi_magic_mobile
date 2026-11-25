/**
 * "typing…" in a thread's header means THE OTHER PERSON is typing.
 *
 * Found on a device, 2026-11-25 (readiness Kill, flow 78, shot
 * 78-thread-after-kill): after a relaunch with a kept draft, the header said
 * "typing…" though Sam was typing nothing. Two causes, both measured here:
 *
 * 1. `Messaging::Broadcast.typing` sends to the whole conversation stream,
 *    the sender included (`ConversationChannel.broadcast_to`). The web drops
 *    its own frame (`useChat.ts`: "being told that *you* are typing is
 *    nonsense"); the phone showed it.
 * 2. The composer announced typing from an EFFECT on its value, so a draft
 *    restored at mount announced "typing" with no key pressed, and the other
 *    person was told so too.
 */
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: "70", name: "Sam Doe", isGroup: "0", unread: "0" }),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));
const cable = { onData: null as null | ((e: unknown) => void), performed: [] as string[] };
jest.mock("@/lib/cable", () => ({
  subscribeToChannel: (_c: string, h: { onData: (e: unknown) => void }) => {
    cable.onData = h.onData;
    return () => {};
  },
  performOnChannel: (_c: string, action: string) => {
    cable.performed.push(action);
    return true;
  },
}));
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

const sam = { id: 8, fullname: "Sam Doe", email: "sam@example.test", avatar: null, is_online: false };
const message = {
  id: 500, conversation_id: 70, body: "See you at noon", created_at: "2026-11-16T09:00:00.000Z",
  deleted: false, edited_at: null, links: [], sources: [], rating: null, read_at: null, role: null,
  sent_by_me: false, undoable: false, undone_at: null, user: sam, user_id: 8, reactions: [],
};

let mock: MockAdapter;
beforeEach(async () => {
  await AsyncStorage.clear();
  cable.onData = null;
  cable.performed = [];
  useAuthStore.setState({ user: { id: 7, email: null, firstName: null, lastName: null, fullName: null, avatar: null } as never });
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mock.onGet("/api/v1/conversations/70/messages").reply(200, { messages: [message], meta: { pagy: { pages: 1 } } });
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

describe("the thread's typing indicator", () => {
  it("never says I am typing when the frame is my own echo", async () => {
    const view = renderThread();
    await screen.findByText("See you at noon");
    act(() => cable.onData?.({ typing: true, user: { id: 7, fullname: "Me Myself" } }));
    expect(screen.queryByTestId("thread-typing")).toBeNull();

    // The other person's frame still shows: the filter is by id, not a mute.
    act(() => cable.onData?.({ typing: true, user: { id: 8, fullname: "Sam Doe" } }));
    expect(screen.getByTestId("thread-typing")).toBeTruthy();
    view.unmount();
  });

  it("does not announce typing for a draft restored at launch, only for a key pressed", async () => {
    await AsyncStorage.setItem("mm-draft:7:70", "kept from before the kill");
    const view = renderThread();
    await waitFor(() => expect(screen.getByTestId("people-composer-input").props.value).toBe("kept from before the kill"));
    await screen.findByText("See you at noon");
    expect(cable.performed).not.toContain("typing");

    fireEvent.changeText(screen.getByTestId("people-composer-input"), "kept from before the kill, and more");
    expect(cable.performed).toContain("typing");
    view.unmount();
  });
});
