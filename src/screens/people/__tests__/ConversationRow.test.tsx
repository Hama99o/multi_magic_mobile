/**
 * One row in the people-chats list, in the language the reader chose.
 *
 * Found by the claims audit, 2026-09-24: every string this row computes was
 * English — "No messages yet", "Message deleted", "You: …", and the screen
 * reader's "…, 3 unread". They were return values and a template, not JSX
 * text, so the `<Text>` lint rule could not see them, and the chats list's
 * French render checks only its title. And a row with no messages showed the
 * conversation's `updated_at`, which a rename moves: "today" for a chat where
 * nothing was said.
 */
import { render, screen } from "@testing-library/react-native";
import i18n from "i18next";
import { ConversationRow } from "../ConversationRow";
import type { Conversation } from "@/api/conversations";
import type { ChatMessage } from "@/api/ai";

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 1, conversationId: 7, role: "user", body: "À demain", createdAt: new Date().toISOString(),
    deleted: false, userId: 2, sentByMe: false, editedAt: null, readAt: null,
    reactions: [], links: [], sources: [], undoable: false, undoneAt: null,
    ...over,
  } as ChatMessage;
}

function conversation(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 7, displayName: "Anisa", isGroup: false, isOnline: false, avatar: null,
    participants: [], lastMessage: message(), unreadMessages: 0,
    canDelete: true, isAdmin: false, updatedAt: new Date().toISOString(),
    ...over,
  } as Conversation;
}

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});
afterAll(async () => {
  await i18n.changeLanguage("en");
});

it("says 'you' in French on the reader's own last message", () => {
  render(<ConversationRow conversation={conversation({ lastMessage: message({ sentByMe: true }) })} onPress={jest.fn()} />);
  expect(screen.getByText("Vous : À demain")).toBeTruthy();
});

it("says a deleted message was deleted, in French", () => {
  render(<ConversationRow conversation={conversation({ lastMessage: message({ deleted: true, body: null }) })} onPress={jest.fn()} />);
  expect(screen.getByText("Message supprimé")).toBeTruthy();
});

it("tells a screen reader the unread count in French", () => {
  render(<ConversationRow conversation={conversation({ unreadMessages: 3 })} onPress={jest.fn()} />);
  expect(screen.getByLabelText("Anisa, 3 non lus")).toBeTruthy();
});

it("an empty chat says so, and claims no time", () => {
  render(<ConversationRow conversation={conversation({ lastMessage: null })} onPress={jest.fn()} />);
  expect(screen.getByText("Pas encore de message")).toBeTruthy();
  expect(screen.queryByTestId("chat-time-7")).toBeNull();
});

it("a chat with a message shows that message's time", () => {
  render(<ConversationRow conversation={conversation()} onPress={jest.fn()} />);
  expect(screen.getByTestId("chat-time-7")).toBeTruthy();
});
