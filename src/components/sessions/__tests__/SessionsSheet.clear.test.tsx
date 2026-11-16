/**
 * "CLEAR MESSAGES" EMPTIES WHAT THE PHONE KEPT TOO (audit #33, 2026-11-16).
 *
 * `POST :clear` empties the transcript on the server, but the app keeps each
 * transcript in the React Query cache (`conversationKeys.transcript`), and
 * its read MERGES the server's page into what it holds (so a reply landing
 * mid-read is never dropped). An empty page merged into the old messages is
 * the old messages: the cleared chat came back, whole, on reopen.
 */
import type { ReactNode } from "react";
import { createElement } from "react";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/lib/cable", () => ({ subscribeToChannel: jest.fn(() => () => {}) }));

/* eslint-disable import/first */
import { testQueryClient } from "@/__tests__/queryClient";
import { SessionsSheet } from "../SessionsSheet";
import { messagesApi, sessionsApi, type AiSession, type ChatMessage } from "@/api/ai";
import { conversationKeys } from "@/api/keys";
import { useConversation } from "@/hooks/useConversation";

function session(over: Partial<AiSession> = {}): AiSession {
  return {
    id: 4, title: "Money", messageCount: 2, documentCount: 0,
    createdAt: "2026-09-01T09:00:00Z", updatedAt: new Date().toISOString(),
    instructions: null, apps: [], remember: true, ...over,
  };
}

function message(id: number, role: "user" | "assistant", body: string): ChatMessage {
  return {
    id, conversationId: 4, role, body,
    createdAt: "2026-09-18T10:00:00Z", deleted: false,
    userId: role === "user" ? 2 : null, sentByMe: role === "user",
    editedAt: null, readAt: null, reactions: [], links: [], sources: [],
    undoable: false, undoneAt: null,
  };
}

let client: QueryClient;

beforeEach(() => {
  // gcTime Infinity: a closed chat's transcript stays cached, as on a phone.
  client = testQueryClient({ queries: { gcTime: Infinity } });
  jest.spyOn(sessionsApi, "list").mockResolvedValue([session()]);
  jest.spyOn(sessionsApi, "clear").mockResolvedValue(session({ messageCount: 0 }));
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

it("after Clear messages, reopening the chat shows nothing old", async () => {
  // The chat was read before: its transcript is in the cache.
  client.setQueryData(conversationKeys.transcript(4), {
    messages: [message(1, "user", "Old question"), message(2, "assistant", "Old answer")],
    hasOlder: false, unreadableLatest: 0, unreadableOlder: 0,
  });

  render(
    <QueryClientProvider client={client}>
      <SessionsSheet visible activeId={4} onClose={jest.fn()} onOpenSession={jest.fn()} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("session-menu-4")).toBeTruthy());
  fireEvent.press(screen.getByTestId("session-menu-4"));
  await waitFor(() => expect(screen.getByTestId("session-menu-clear")).toBeTruthy());
  fireEvent.press(screen.getByTestId("session-menu-clear"));
  await waitFor(() => expect(sessionsApi.clear).toHaveBeenCalledWith(4));

  // Reopened: the server now has nothing for it.
  jest.spyOn(messagesApi, "latest").mockResolvedValue({ messages: [], hasMore: false });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => useConversation({ conversationId: 4, channel: "MessageChannel" }), { wrapper });

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.messages).toEqual([]);
});
