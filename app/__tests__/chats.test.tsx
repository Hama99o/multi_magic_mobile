/**
 * The people-chats list, past its first page. Found by the volume audit,
 * 2026-09-24: the screen asked for page 1 (15 conversations,
 * `conversations_controller.rb`) and never another, so a sixteenth
 * conversation could not be reached from the phone at all.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {} }));

/* eslint-disable import/first */
import Chats from "../chats";
import { conversationsApi, type Conversation } from "@/api/conversations";
import { testQueryClient } from "@/__tests__/queryClient";

const conversation = (id: number): Conversation =>
  ({
    id, displayName: `Person ${id}`, isGroup: false, isOnline: false, avatar: null, participants: [],
    lastMessage: null, unreadMessages: 0, canDelete: true, isAdmin: false, updatedAt: new Date().toISOString(),
  }) as Conversation;

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <Chats />
    </QueryClientProvider>,
  );
}

afterEach(() => jest.restoreAllMocks());

it("loads the next page at the end of the list, once per conversation", async () => {
  const list = jest.spyOn(conversationsApi, "list").mockImplementation(async (page = 1) =>
    page === 1
      ? { conversations: [conversation(1), conversation(2)], unreadConversations: 0, hasMore: true }
      : { conversations: [conversation(2), conversation(3)], unreadConversations: 0, hasMore: false },
  );
  renderScreen();
  await screen.findByText("Person 1");
  await act(async () => {
    fireEvent(screen.getByTestId("chats-list"), "endReached");
  });
  expect(await screen.findByText("Person 3")).toBeTruthy();
  expect(list).toHaveBeenCalledWith(2);
  // A conversation that moved between pages is drawn once.
  expect(screen.getAllByText("Person 2")).toHaveLength(1);
});

it("does not ask past the last page", async () => {
  const list = jest
    .spyOn(conversationsApi, "list")
    .mockResolvedValue({ conversations: [conversation(1)], unreadConversations: 0, hasMore: false });
  renderScreen();
  await screen.findByText("Person 1");
  await act(async () => {
    fireEvent(screen.getByTestId("chats-list"), "endReached");
  });
  expect(list).toHaveBeenCalledTimes(1);
});
