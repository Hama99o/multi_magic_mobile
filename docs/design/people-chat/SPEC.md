# People chat — and it is the SAME mechanism as the assistant

**Status: `SPECIFIED`** — eleven references pulled and read, 2026-09-18. The
architecture below is checked against the backend line by line, and **four
things the earlier draft of this file asserted turned out to be wrong**; they
are corrected in §0 rather than quietly rewritten.

His instruction, 18 Sept: *"chat should also work, think about that."*

## The finding that makes this affordable — one boolean

**`app/models/conversation.rb:19` — `scope :ai_sessions, -> { where(is_ai: true) }`.**

The assistant's session and a conversation with a human **are the same model**,
separated by one flag. Which means:

| | assistant | people |
|---|---|---|
| model | `Conversation` + `Message` | the same |
| transcript | `GET /api/v1/conversations/:id/messages` | **the same endpoint** |
| live delivery | `MessageChannel` — `stream_for current_user` | `MessageChannel` too — see §0.2 |
| reply arrives | asynchronously, from a job | asynchronously, from another person |

**So building the assistant properly builds most of this.** `src/api/ai.ts`
already exports `messagesApi.latest`, `.before` and `.parseOne` keyed on a bare
`conversationId`, and `src/hooks/useConversation.ts` already takes a channel
name. Phase 1 was built generic, so this screen consumes it unchanged.

---

## §0 · FOUR CORRECTIONS, each with a line number

### 0.1 · The list does NOT need to filter `is_ai` — the server already did

The earlier draft said *"the list filters `is_ai` out"*. It cannot see one to
filter. `conversations_controller.rb:14` goes through
`Conversation.for_member(current_user)`, and `conversation.rb:26-30` opens with
`human` — `where(is_ai: false)`. The controller's own header says listing
assistant sessions as chats with people *"was defect 1 in docs/MESSAGING.md"*.

**A client-side filter here would be a second implementation of a rule the
server already enforces**, and the two would disagree the day one changed. The
client does nothing. `is_ai` is not even on the wire.

### 0.2 · `sent_by_me` is TRUE on `MessageChannel` and FALSE on `ConversationChannel`

This is the one that would have shipped as a bug, and it is worth the detail.

`messaging/broadcast.rb:19-29` sends a new message **twice**, and the two copies
are not the same:

```ruby
conversation.conversation_members.active.includes(:user).each do |member|
  to_user(member.user, message: payload(message, member.user), conversation: …)   # per-reader
end
to_conversation(conversation, payload(message, nil)) unless conversation.is_ai   # user: NIL
```

`payload(message, user)` is `MessageSerializer.render_as_hash(message, user:)`,
and `message_serializer.rb:25-27` derives `sent_by_me` from that argument. On
the **ConversationChannel** copy it is passed **`nil`** — so `sent_by_me` is
`false` for everybody including the sender, and `reactions[].mine`
(`message_serializer.rb:44`) is `false` for everybody too.

Two consequences:

1. **A thread fed from `ConversationChannel` renders every message on the left**,
   the sender's own included, until a resync corrects it.
2. `useConversation.ts:203` is `if (!payload?.message) return;` — and the
   ConversationChannel `created` frame is the **bare message hash with no
   `message` key**. So it is dropped silently. The `updated` frame
   (`broadcast.rb:33`) *is* wrapped and would arrive.

**Resolution, and it needs no change to anybody's file:** the thread subscribes
to **`MessageChannel`** for messages — exactly as the assistant does — because
that copy is rendered per reader and is therefore correct, and it carries
`conversation_id` so `useConversation` filters it (`useConversation.ts:209`).
**`ConversationChannel` is subscribed separately and only for `typing` and
`read`**, which is the only place those two exist (`broadcast.rb:41-48`).

So the SPEC's old line — *"`sent_by_me` decides the side, not a comparison the
client does"* — stands, and is now true rather than nearly true: the client
reads `sent_by_me` from a payload where the server actually answered it.

### 0.3 · A one-to-one conversation's `title` is NULL — the row name is `user.fullname`

The earlier draft said `ConversationSerializer` *"gives `title`"*. It does
(`conversation_serializer.rb:13`) and for a direct chat it is **nil** —
`Conversation.create_one_to_one` (`conversation.rb:90`) never sets one. A list
built on `title` is blank rows for every one-to-one chat, which is most of them.

`display_title` exists on the model (`conversation.rb:50`) and **the serializer
does not use it**. What it does instead is better: `conversation_serializer.rb:30-37`
emits a **`user`** field that is the other person for a direct chat and
`{ fullname: title || 'Group' }` for a group — *"so a list row and a header can
be drawn the same way whichever it is"*, in its own words.

**So the display name is `conversation.user.fullname` in both cases**, with
`user.email` as the fallback because `fullname` is `.presence` and can be null
(`user_serializer.rb:204`). One rule, no branch on `is_group` for the name.

### 0.4 · `unread_messages_count` (collection) counts CONVERSATIONS, not messages

`conversations_controller.rb:30-35` returns **two** numbers under one name:

```ruby
{ unread_messages_count: Messaging::ReadState.unread_conversation_count(current_user),
  unread_messages_total: Messaging::ReadState.unread_total(current_user) }
```

The key called `unread_messages_count` is **how many threads have something
new**, not how many messages. The per-row field of the same name
(`conversation_serializer.rb:66`) *is* a message count. Same name, two meanings,
one endpoint apart. `src/api/conversations.ts` names them `unreadConversations`
and `unreadMessagesTotal` so the ambiguity dies at the boundary.

The bell on the chats icon wants **`unread_messages_count`** (threads), because
that is what every reference badges.

---

## §1 · Sources — eleven screens, and what each one settled

| App | Reference | What we TAKE | What we REJECT |
|---|---|---|---|
| **WhatsApp** — [chat list](https://mobbin.com/screens/a9840503-a573-48d2-8d8f-21006b99bff5) | `whatsapp-chat-list-unread-badge-filters.webp` — a **numeric** badge right of the preview line, and the **timestamp turns accent-coloured when unread** | the All/Unread/Favorites/Groups filter chips — four filters over a list that will hold six rows |
| **LINE** — [chats](https://mobbin.com/screens/c286bb4a-e074-4dcd-b695-ec5a7bd80c1b) | the same numeric badge in the same place — **two apps agreeing makes it convention**; and a two-line preview | the top search field; the sticker/service rows |
| **XChat** — [chat](https://mobbin.com/screens/fe434973-7c36-4233-bad9-26dbd19dd36a) | — | **a bare unread DOT.** We have a real count on the wire; a dot throws it away |
| **corner** — [thread](https://mobbin.com/screens/740d8087-6ce2-4943-bb7a-fd1a7fa43d64) | the **`UNREAD MESSAGES` divider** rule across the thread, and a **double tick + time under the last sent message** | the full-bleed gradient ground |
| **talabat** — [thread](https://mobbin.com/screens/cb15aac5-7bf9-4339-8d93-8be4f427369c) | **the sender's name above a received bubble** — needed for groups, and harmless in a direct chat where we omit it; the double tick again | the brand-orange bubble; the `✕` to close a thread |
| **X** — [thread](https://mobbin.com/screens/5d238784-662d-41c0-bd2e-15ed7c79f9e2) | **day separators** (`Yesterday`, `Today`) as centred capitals, and a `New` marker on the unread boundary | time *inside* the bubble — it re-flows the last line at 360 dp |
| **WhatsApp** — [react](https://mobbin.com/screens/dd9178d3-bf3d-4d36-9977-029a99a43076) | **six emoji in a pill ABOVE the message**, action menu beneath | the `+` to a full emoji keyboard (§2.2) |
| **X** — [react](https://mobbin.com/screens/9232ccac-8d6d-4828-98f6-91e1631f3ea0) | the action menu's shape: Reply · Copy · **Delete in red, last** | twelve emoji in two rows; Report |
| **Believe** — [react](https://mobbin.com/screens/7bae6248-d0a0-4a35-9b4c-1743af9ddfe4) | **counted reaction chips UNDER the message** — `👍 2`, left-aligned. This is the only reference that shows the *result* rather than the picker, and it is the part we actually have data for | View Profile / Mute User |
| **Gymshark** — [empty inbox](https://mobbin.com/screens/358245e8-f562-4bcd-8377-79d0636ad5bd) | **heading + one line, NO icon and NO illustration** — and it is a dark screen, which is ours | shouting caps |
| **My BMW** — [empty](https://mobbin.com/screens/5ce9c75f-93ae-4be1-9c4a-89d65da2b076) | *"Nothing for you today / We will inform you as soon as we have news."* — an empty state that **says what will fill it** | — |
| **Runna** — [empty](https://mobbin.com/screens/ea16f1bc-e747-4028-8183-d910fac17981) | — | **the `Send us a message` CTA.** See §2.3: we cannot start a conversation, so that button is a door with no room behind it |

## §2 · The disagreements, and how we resolved them

### 2.1 · Unread: a number, not a dot — and the timestamp carries it too

WhatsApp, LINE and Shopee badge a **number**; XChat shows a **dot**. Three to
one is not the argument — the data is: `unread_messages_count` per row is on the
wire already (`conversation_serializer.rb:66`), so a dot would be discarding
something the server paid a batched query to compute
(`conversations_controller.rb:122`).

**We take WhatsApp's second signal as well**: the timestamp goes `accent` when
the row is unread. It costs one conditional and it is the part that reads at
arm's length, in sunlight, without focusing on a 20 dp badge.

### 2.2 · Reactions: six emoji, and NO `+`

All six reaction references put a horizontal emoji row above the message — that
is settled. They differ on whether a `+` opens the full picker (WhatsApp, Retro,
X yes; Discord, PlayStation, Believe no).

**No `+`.** The server takes any string (`reactions_controller.rb:12`), so this
is purely a client decision and it can widen later. A system emoji keyboard
inside a long-press sheet is a second interaction to get right — and the whole
justification for this screen is that it is ~30% more work, not double.

**The six**: 👍 ❤️ 😂 😮 😢 🙏 — the intersection of WhatsApp's, X's and
PlayStation's rows, minus 👎, which none of the three-way intersection needed
and which is the one reaction that makes a chat worse.

**And the toggle is the press itself.** `routes.rb:295` — *"A reaction is a
toggle: the same emoji twice takes it back"* — so a chip with `mine: true` is
accent-tinted and **pressing that chip removes it**. There is no separate
remove, and none of the references offers one either.

### 2.3 · The list is READ-AND-REPLY. It cannot start a conversation, and the empty state must say so

Runna and Origin end their empty inbox with a button. **We must not**, and the
reason is structural rather than aesthetic: `POST /api/v1/conversations` needs
`user_id` or `user_ids` (`conversations_controller.rb:127-141`), which needs a
**people picker**, which needs a user-search screen, follow lists and a blocking
rule — the same five-permission-question shape that put groups out of v1.

So v1 **replies to threads that exist** and says so in one honest line, in the
register of `../calendar/SPEC.md`'s *"a calendar that can read but not write is
honest, a calendar with a broken create button is not"*:

> **No conversations yet**
> Chats you start on MultiMagic appear here.

**Groups are read-only, and that costs nothing extra.** `is_group`,
`participants`, `is_admin` and `can_delete` all arrive on the wire; rendering a
group thread is the direct thread plus a sender name above received bubbles
(talabat), which we take anyway. What is out is `PUT /conversations/:id` —
`change_membership` (`conversations_controller.rb:111`) — and group creation.
`is_admin` is parsed and **not rendered**: it is the flag the add/remove UI
would hang off, and there is no add/remove UI.

### 2.4 · The two screens MUST NOT be mistakable — his instruction, and it is a requirement

**Hamma9900, 2026-09-18:** *"make sure the design did not mix like ai assistance
and chat should not have same style so people did not mix, we should see the
different."*

The starting point was already a divergence. `IDENTITY.md` §3 says the
assistant's reply is **not** in a bubble, and gives the reason: *"these answers
are paragraphs drawn from his own notes, loans and contacts… a bubble caps a
paragraph's comfortable width."* **That reasoning does not transfer** — a
message from a person is a remark, not a document; all eight thread references
bubble both sides; and the serif that carries the assistant's answers exists to
make a paragraph read as a document, which is the wrong claim about *"ok, see
you at 6"*.

**But a divergence is not the same as being unmistakable**, and his instruction
is the stronger one. So the separation is carried by **four** signals, because
one can be missed at a glance:

| | the assistant (`app/chat.tsx`) | people (`app/chat/[id].tsx`) |
|---|---|---|
| **my message** | `userBubble` — a muted tint (`#2d5363`) | **solid `accent`** (`#48aaa2`), the way every reference fills the sent side with the app's own colour |
| **their message** | **no bubble at all** — plain text on the page | an **outlined** `surface` bubble |
| **type** | the **SERIF**, `variant="answer"` | the UI grotesque. **Nothing in `src/screens/people/` may use `variant="answer"`** |
| **avatars** | **none**, by rule — `IDENTITY.md` §7 | everywhere: list rows, the thread header, group senders |

Colour and shape are the two that read at arm's length; type and avatars are the
two that confirm it. `MessageRow.tsx` stays the assistant's and is not touched;
`src/screens/people/PersonMessageRow.tsx` is ours.

**This is now a gate, not a preference:** the `ours/` screenshots for `DONE`
must show the two threads side by side, and if they could be confused at a
glance the screen is not done.

## §3 · Our decisions — the half no reference can supply

- **`mark_read` fires ON OPEN, and the unread count is captured BEFORE it.**
  `routes.rb:287` says the endpoint exists *"for a client that has just opened
  one and cannot wait for a subscription"* — that is the instruction. But the
  divider (§1, corner) needs the count the row had *before* the open, so the
  screen reads `unread_messages_count` off the list row and keeps it in a ref
  that `mark_read` cannot reach. Firing `mark_read` first and then asking how
  many were unread gets zero, every time.
- **Sending is HTTP and never the socket.** `messages_controller.rb:5-8`:
  *"`perform` on a subscription that is not up is a silent no-op, and a send
  that vanishes is the worst failure a chat can have."* The same rule as the
  assistant's question, for the same reason — and `cable.ts:250`'s
  `performOnChannel` returns `false` for exactly this case, which is why
  `typing` and `mark_read` may ride the socket and a message may not.
- **A failed send stays on screen with a Retry.** `BRIEF.md` §5: a question on a
  bad connection *"arrives, or says it did not — never disappears into an
  optimistic bubble."* A chat message is the same promise.
- **Deleting a message keeps the row.** `messages_controller.rb:64-65`:
  *"a hole in the thread reads as a bug."* The row renders *"This message was
  deleted"* in `inkMuted` italic, from `deleted: true` + `body: null`.
- **Editing says so.** `edited_at` non-null → a small `edited` after the body,
  because *"a message that silently changes after somebody replied to it is
  worse than no editing at all"* (`messages_controller.rb:50-52`).
- **`read_at` is all-or-nothing and the tick must mean that.**
  `message_serializer.rb:29-39`: it is nil unless **every** other member has read
  past it. In a group of five that is a strong claim, and it is the right one —
  so the tick is rendered **only under the last sent message**, as Luma and
  Messages do, never under every one.
- **`can_delete` is obeyed, not guessed.** `conversation_serializer.rb:15-20`:
  true for a direct chat, and for a group only if you are an active admin. And
  `DELETE /conversations/:id` is **clear-for-me, not delete** — it returns
  *"Conversation deleted for you"* and `soft_delete_for_user`
  (`conversation.rb:59`) keeps the other side's history. **So the confirm must
  not say "delete".** It says: *"Clear this chat? It disappears from your list.
  The other person keeps theirs."* — the same discipline as the session delete
  confirm, which names what is safe.
- **360 dp and 800 dp.** A bubble takes `maxWidth: '78%'` of the measure, not of
  the screen, so at 800 dp it inherits `METRICS.maxMeasure` (640) from
  `ScreenContainer` and a line of chat does not run 700 dp wide.

## §4 · How we code it — real identifiers

| Thing | Where |
|---|---|
| `app/chats.tsx` | the list. `useQuery(['conversations'])` → `conversationsApi.list()` |
| `app/chat/[id].tsx` | the thread. `useLocalSearchParams<{ id: string }>()` |
| `src/api/conversations.ts` | **mine to own.** `list · show · messages via messagesApi · send · edit · remove · react · markRead · unreadCount · clearForMe` |
| `src/screens/people/ConversationRow.tsx` | avatar · name · preview · time · badge |
| `src/screens/people/PersonMessageRow.tsx` | the bubble, both sides, + reaction chips |
| `src/screens/people/ReactionSheet.tsx` | six emoji + the action menu |
| `src/screens/people/DayDivider.tsx` | `Today` / `Yesterday` / a date, and the `UNREAD` marker |
| transcript + resync | **`useConversation({ conversationId, channel: "MessageChannel" })`** — the sibling's hook, unchanged (§0.2) |
| typing + read + `mark_read` | `subscribeToChannel("ConversationChannel", …, { conversation_id })` and `performOnChannel(…, "mark_read", …)` from `src/lib/cable.ts` |
| parsing | `obj/arr/str/id/bool` from `src/api/parse.ts`; `messagesApi.parseOne` for anything message-shaped |
| colour | `useColors()` → `accent` for my bubble + the unread badge, `surface` for theirs, `inkMuted` for times, `danger` for Delete |
| avatar tint | `categoryColorFor(user.id)` from `src/theme/tokens.ts` — the initial on a stable colour, since `avatar` is often null |
| relative time | `src/lib/relativeTime.ts`, already built for the sessions sheet |

**Nothing in `src/api/ai.ts`, `src/lib/cable.ts`, `src/hooks/useConversation.ts`
or `app/chat.tsx` is edited.** `messagesApi` and `useConversation` are consumed
exactly as the assistant consumes them, which is the check that Phase 1 really
was built generic.

### Divergence note — 2026-09-19, SPEC versus code

Checked by the verifier session against `main` at `971f951`.

- **`conversationsApi` does not carry `send · edit · remove · react`.** Those
  four live on a second object, `threadApi`, in `src/api/conversations.ts:223`;
  `conversationsApi` (`:162`) keeps `list · show · markRead · unreadCount ·
  clearForMe`. One file, two names — the table should name both.
- **`mark_read` goes over HTTP, not `performOnChannel`.** The thread calls
  `conversationsApi.markRead` on open (`app/chat/[id].tsx:129`, and the header
  says why: "a message may not ride the socket"). `performOnChannel` is used
  for `typing` only (`:190`). The SPEC's `performOnChannel(…, "mark_read", …)`
  describes a path the code deliberately does not take.
- **"Nothing in `app/chat.tsx` is edited" was true for Phase 2 and is not true
  now**: `70c68b6` added the three title-bar doors, on his instruction. The
  claim that `useConversation` and `messagesApi` are consumed unchanged still
  holds (`app/chat/[id].tsx:106-109`, `channel: "MessageChannel"`).
- Holds: `useQuery(["conversations"])` → `conversationsApi.list()`
  (`app/chats.tsx:39-41`); `useLocalSearchParams` (`app/chat/[id].tsx:81`);
  `subscribeToChannel("ConversationChannel", …)` (`:161`); the four `screens/
  people/*` files; `absoluteUrl` (`conversations.ts:117`).

## §5 · Evidence required before `DONE`

1. `ours/` at **360, 411 and 800 dp** — list and thread, dark and light — **and
   the assistant's thread beside the people thread**, which is the evidence for
   §2.4. If the two could be confused at a glance, this row is not `DONE`.
2. The thread verified with **two accounts**, so `sent_by_me`, the double tick
   and `read` over `ConversationChannel` are observed rather than assumed. On the
   QA test account only (`qa/RIG_CONTRACT.md` §3), never his own.
3. **The socket killed mid-thread**, and a message sent from the other side
   still arriving after reconnect — that is the `onConnected` resync, and it is
   the only claim in this file that cannot be checked by looking.
4. `npx tsc --noEmit` and the Jest suites for `src/api/conversations.ts`.
