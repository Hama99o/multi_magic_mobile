/**
 * Threads with PEOPLE — `docs/design/people-chat/SPEC.md`.
 *
 * ── It shares almost everything with the assistant ────────────────────────
 * `Conversation` is one model separated by an `is_ai` boolean
 * (`conversation.rb:19`), so the transcript, the cursor and the parser all come
 * from `src/api/ai.ts` unchanged: `messagesApi.latest`, `.before` and
 * `.parseOne` take a bare `conversationId` and know nothing about the
 * assistant. This file adds only what a human thread needs and the assistant
 * does not — sending, editing, reacting, read state, and the list itself.
 *
 * ── FOUR THINGS THE SERVER ANSWERS DIFFERENTLY FROM HOW IT READS ──────────
 *
 * 1. **There is no `is_ai` to filter.** `conversations_controller.rb:14` goes
 *    through `Conversation.for_member`, and `conversation.rb:26-30` opens with
 *    `human` — `where(is_ai: false)`. Listing assistant sessions as chats with
 *    people "was defect 1 in docs/MESSAGING.md", says the controller's own
 *    header. A filter here would be a second implementation of a rule the
 *    server already enforces, and they would disagree the day one changed.
 *
 * 2. **A one-to-one conversation's `title` is NULL.** `create_one_to_one`
 *    (`conversation.rb:90`) never sets one. What the serializer emits instead
 *    is a `user` field that is the other person for a direct chat and
 *    `{ fullname: title || 'Group' }` for a group — "so a list row and a header
 *    can be drawn the same way whichever it is"
 *    (`conversation_serializer.rb:28-37`). So `displayName` below reads
 *    `user.fullname` in BOTH cases, with `email` behind it because `fullname`
 *    is `.presence` and can be null.
 *
 * 3. **`unread_messages_count` means two different things one endpoint apart.**
 *    On the collection it is how many THREADS have something new
 *    (`conversations_controller.rb:31`); on a row it is how many MESSAGES
 *    (`conversation_serializer.rb:66`). Same name, two meanings — so the
 *    ambiguity dies here, at the boundary, and never reaches a screen.
 *
 * 4. **`DELETE /conversations/:id` is CLEAR-FOR-ME, not delete.** It calls
 *    `soft_delete_for_user` and answers "Conversation deleted for you";
 *    the other side keeps its history and the row goes only when the last
 *    person clears it (`conversation.rb:57-67`). Named `clearForMe` so no
 *    caller can mistake it, and the confirm says so in words.
 */
import { http } from "./http";
import { messagesApi, type ChatMessage } from "./ai";
import { arr, id, num, obj, optStr, str } from "./parse";

/** One member of a thread, as the list and the header draw them. */
export interface Participant {
  id: number;
  name: string;
  avatar: string | null;
  isOnline: boolean;
  isAdmin: boolean;
  /** How far this person has read. Null if they never opened it. */
  lastReadAt: string | null;
}

export interface Conversation {
  id: number;
  /**
   * What to put on the row and in the header — see this file's header, point 2.
   * Never `title`, which is null for every direct chat.
   */
  displayName: string;
  isGroup: boolean;
  /** Presence, from `last_sign_in_at` within 3 minutes (`user_serializer.rb:235`). */
  isOnline: boolean;
  avatar: string | null;
  participants: Participant[];
  lastMessage: ChatMessage | null;
  /** MESSAGES unread in this thread — the badge on the row. */
  unreadMessages: number;
  /**
   * Whether the reader may clear it: always true for a direct chat, and for a
   * group only if they are an active admin (`conversation_serializer.rb:15-20`).
   */
  canDelete: boolean;
  /**
   * Whether the reader administers this group. Parsed and deliberately NOT
   * rendered: it is the flag an add/remove UI would hang off, and groups are
   * read-only in v1 — `docs/design/people-chat/SPEC.md` §2.3.
   */
  isAdmin: boolean;
  updatedAt: string;
}

export interface ConversationList {
  conversations: Conversation[];
  /** THREADS with something unread — the badge on the chats icon. */
  unreadConversations: number;
  hasMore: boolean;
}

/**
 * The six offered on a long press — `docs/design/people-chat/SPEC.md` §2.2.
 *
 * The intersection of WhatsApp's, X's and PlayStation's rows, minus 👎. The
 * server takes any string (`reactions_controller.rb:12`), so this is a client
 * choice that can widen later without a deploy on the other side.
 */
export const REACTION_EMOJI = [
  // `id` is the Maestro handle. An emoji cannot be one: a flow selector has to
  // survive being typed into a YAML file, grepped for, and read in a failure
  // message — `reaction-thumbs-up` does all three and `reaction-👍` does none.
  { emoji: "👍", id: "thumbs-up" },
  { emoji: "❤️", id: "heart" },
  { emoji: "😂", id: "laugh" },
  { emoji: "😮", id: "wow" },
  { emoji: "😢", id: "sad" },
  { emoji: "🙏", id: "thanks" },
] as const;

/**
 * An avatar arrives as a URL from `get_photo_url`, but a notification's actor
 * arrives as a RELATIVE path. Both go through here so a leading slash is never
 * handed to `<Image>`, which renders nothing for one and says why for neither.
 */
export function absoluteUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${http.defaults.baseURL ?? ""}${path.startsWith("/") ? "" : "/"}${path}`;
}

function parseParticipant(payload: unknown): Participant {
  const record = obj(payload, "participant");
  const user = obj(record.user, "participant.user");
  return {
    id: id(user.id, "participant.user.id"),
    name: optStr(user.fullname) ?? optStr(user.email) ?? "Someone",
    avatar: absoluteUrl(optStr(user.avatar)),
    isOnline: typeof user.is_online === "boolean" ? user.is_online : false,
    isAdmin: typeof record.is_admin === "boolean" ? record.is_admin : false,
    lastReadAt: optStr(record.last_read_at),
  };
}

function parseConversation(payload: unknown): Conversation {
  const record = obj(payload, "conversation");
  // Present for a group too, where the serializer substitutes the group's own
  // title — which is the whole point of the field.
  const user = obj(record.user, "conversation.user");

  return {
    id: id(record.id, "conversation.id"),
    displayName: optStr(user.fullname) ?? optStr(user.email) ?? "Conversation",
    isGroup: typeof record.is_group === "boolean" ? record.is_group : false,
    isOnline: typeof user.is_online === "boolean" ? user.is_online : false,
    avatar: absoluteUrl(optStr(user.avatar)),
    participants: (Array.isArray(record.participants) ? record.participants : []).map(
      parseParticipant,
    ),
    // `null` is the ordinary case for a thread nobody has written in yet.
    lastMessage: record.last_message ? messagesApi.parseOne(record.last_message) : null,
    unreadMessages: typeof record.unread_messages_count === "number"
      ? record.unread_messages_count
      : 0,
    canDelete: typeof record.can_delete === "boolean" ? record.can_delete : false,
    isAdmin: typeof record.is_admin === "boolean" ? record.is_admin : false,
    updatedAt: str(record.updated_at, "conversation.updated_at"),
  };
}

export const conversationsApi = {
  /**
   * The chat list, newest activity first, 15 per page
   * (`conversations_controller.rb:11`).
   *
   * `meta.unread_conversations` is on the first page already, so the badge does
   * not need its own request on a cold open — only on a refresh.
   */
  list: async (page = 1): Promise<ConversationList> => {
    const res = await http.get("/api/v1/conversations", { params: { page } });
    const record = obj(res.data, "conversations");
    const meta = obj(record.meta, "conversations.meta");
    const pagy = obj(meta.pagy, "conversations.meta.pagy");
    return {
      conversations: arr(record.conversations, "conversations.conversations").map(
        parseConversation,
      ),
      unreadConversations: typeof meta.unread_conversations === "number"
        ? meta.unread_conversations
        : 0,
      hasMore: num(pagy.pages, "conversations.meta.pagy.pages") > page,
    };
  },

  /** One thread, for the header. 404s if it was cleared for this reader. */
  show: async (conversationId: number): Promise<Conversation> => {
    const res = await http.get(`/api/v1/conversations/${conversationId}`);
    return parseConversation(obj(res.data, "conversation").conversation);
  },

  /**
   * "I have read this thread." Fired ON OPEN, not on scroll-past — the route's
   * own comment says it exists "for a client that has just opened one and
   * cannot wait for a subscription" (`routes.rb:287`).
   *
   * The socket can do this too (`ConversationChannel#mark_read`), but
   * `performOnChannel` returns false when the subscription is not up and a
   * thread that opens before the socket does is the normal case on a phone. So
   * the HTTP call is the one that runs.
   */
  markRead: async (conversationId: number): Promise<Conversation> => {
    const res = await http.post(`/api/v1/conversations/${conversationId}/mark_read`);
    return parseConversation(obj(res.data, "conversation").conversation);
  },

  /** The badge on the chats icon. See this file's header, point 3. */
  unreadCount: async (): Promise<{ unreadConversations: number; unreadMessagesTotal: number }> => {
    const res = await http.get("/api/v1/conversations/unread_messages_count");
    const record = obj(res.data, "unread");
    return {
      unreadConversations: num(record.unread_messages_count, "unread.unread_messages_count"),
      unreadMessagesTotal: num(record.unread_messages_total, "unread.unread_messages_total"),
    };
  },

  /** Clears it for this reader only — see this file's header, point 4. */
  clearForMe: async (conversationId: number): Promise<void> => {
    await http.delete(`/api/v1/conversations/${conversationId}`);
  },
};

export const threadApi = {
  /**
   * Send. **HTTP, never the socket** — `messages_controller.rb:5-8`: "`perform`
   * on a subscription that is not up is a silent no-op, and a send that
   * vanishes is the worst failure a chat can have."
   *
   * Returns the saved message, so the sender's own copy arrives from the
   * response rather than from the broadcast. The broadcast follows on
   * `MessageChannel` and `useConversation` merges the two by id.
   */
  send: async (conversationId: number, body: string): Promise<ChatMessage> => {
    const res = await http.post(`/api/v1/conversations/${conversationId}/messages`, {
      message: { body },
    });
    return messagesApi.parseOne(res.data);
  },

  /**
   * Edit your own. The thread says "edited" afterwards, "because a message that
   * silently changes after somebody replied to it is worse than no editing at
   * all" (`messages_controller.rb:50-52`).
   */
  edit: async (conversationId: number, messageId: number, body: string): Promise<ChatMessage> => {
    const res = await http.patch(
      `/api/v1/conversations/${conversationId}/messages/${messageId}`,
      { message: { body } },
    );
    return messagesApi.parseOne(res.data);
  },

  /**
   * Delete for everyone — and the ROW STAYS. `messages_controller.rb:64-65`:
   * "the other side has already read it, and a hole in the thread reads as a
   * bug." Comes back `deleted: true` with `body: null`, which is what the row
   * renders as "This message was deleted".
   */
  remove: async (conversationId: number, messageId: number): Promise<ChatMessage> => {
    const res = await http.delete(
      `/api/v1/conversations/${conversationId}/messages/${messageId}`,
    );
    return messagesApi.parseOne(res.data);
  },

  /**
   * React — and this ONE endpoint both adds and removes.
   *
   * `routes.rb:295`: "A reaction is a toggle: the same emoji twice takes it
   * back." So the UI is a press that takes it back, never a separate remove,
   * and a chip with `mine: true` is a button that undoes itself. Returns the
   * whole updated message, so the counts come back rather than being guessed.
   */
  react: async (
    conversationId: number,
    messageId: number,
    emoji: string,
  ): Promise<ChatMessage> => {
    const res = await http.post(
      `/api/v1/conversations/${conversationId}/messages/${messageId}/reactions`,
      { emoji },
    );
    return messagesApi.parseOne(res.data);
  },
};

/**
 * What arrives on `ConversationChannel`, which is NOT what arrives on
 * `MessageChannel` — `docs/design/people-chat/SPEC.md` §0.2.
 *
 * `messaging/broadcast.rb` puts four different shapes on this one stream, and
 * the copy of a new message it sends here is rendered with `user: nil`
 * (`broadcast.rb:28`), so `sent_by_me` is FALSE for everybody including the
 * sender and `reactions[].mine` is false for everybody too.
 *
 * **Which is why messages are read from `MessageChannel` instead** — that copy
 * is rendered per reader (`broadcast.rb:23`) and carries `conversation_id` for
 * filtering. This channel is subscribed for `typing` and `read` alone, because
 * those two exist nowhere else (`broadcast.rb:41-48`).
 */
export interface ConversationEvent {
  typing?: boolean;
  read?: boolean;
  user?: { id: number; fullname: string | null };
  user_id?: number;
  last_read_at?: string;
}

/** Exposed for the tests, which assert the four corrections above by shape. */
export const __parse = { parseConversation, parseParticipant };

export type { ChatMessage };
