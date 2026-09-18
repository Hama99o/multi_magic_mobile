# People chat — and it is the SAME mechanism as the assistant

**Status: `RESEARCHING`** — the architecture is settled below and it changes
Phase 1; **references not yet pulled.**

His instruction, 18 Sept: *"chat should also work, think about that."*

## The finding that makes this affordable — one boolean

**`app/models/conversation.rb:19` — `scope :ai_sessions, -> { where(is_ai: true) }`.**

The assistant's session and a conversation with a human **are the same model**,
separated by one flag. Which means:

| | assistant | people |
|---|---|---|
| model | `Conversation` + `Message` | the same |
| transcript | `GET /api/v1/conversations/:id/messages` | **the same endpoint** |
| live delivery | `MessageChannel` — `stream_for current_user` | `ConversationChannel` — `stream_for @conversation` |
| reply arrives | asynchronously, from a job | asynchronously, from another person |

**So building the assistant properly builds most of this**, and the reverse is
also true: **build the message list and the socket AI-shaped and adding people
chat later is a rewrite.** That is why this note had to reach the session during
Phase 1 rather than after it.

## What Phase 1 must therefore do differently

- **`MessageList`, `MessageBubble` and the resync take a `conversationId` and
  know nothing about the assistant.** The assistant is the first *consumer*, not
  the shape.
- **Two channels, one subscription manager.** `MessageChannel` is per **user**
  and carries the assistant's replies; `ConversationChannel` is per
  **conversation** and carries a thread's messages. Same reconnect-then-resync
  rule for both — the resync endpoint is already shared.
- **`message_serializer` already carries what a human thread needs**:
  `role`, `user_id`, `body`, `sent_by_me`, `read_at`, `reactions`, `links`,
  `edited_at`, `deleted`, `undoable`, `undone_at`. The assistant uses a subset.
  **Do not narrow the parser to that subset.**

## The API surface

`resources :conversations` (full CRUD) · `POST :mark_read` · `GET
:unread_messages_count` · `DELETE :destroy_permanently` · nested `messages` ·
nested `reactions` (*"a reaction is a toggle: the same emoji twice takes it
back"*). `ConversationSerializer` gives `title`, `is_group`, `participants`,
`last_message`, `unread_messages_count`, `can_delete`, `is_admin`.

## Decisions already takeable

- **The list filters `is_ai` out.** The assistant is not a row in the people
  list, and a people thread is not a row in the session sheet. One boolean, two
  screens, and mixing them would confuse the one guarantee this app makes about
  deletion.
- **`mark_read` on open**, not on scroll-past — its own comment says it exists
  for a client that has just opened a thread and cannot wait for the socket.
- **Reactions are a toggle**, so the UI is a press that takes it back, never a
  separate remove.
- **`sent_by_me` decides the side**, not a comparison the client does with its
  own user id — the server has already answered it.

## Open
- References, through `/screen-design`. WhatsApp-shaped threads are the most
  familiar pattern in the world, which is a reason to check rather than assume.
- **Group chats** (`is_group`, `participants`, `is_admin`): read-only in v1, or
  full? Not asked. **Recommend read-only** — creating and administering groups
  is a second product, and he asked for chat to *work*, not to be founded.
- Attachments in a people message: the `links` field exists; whether the
  composer offers a file to a person as well as to the assistant is his call,
  and the upload path is per-**AI**-session today.
