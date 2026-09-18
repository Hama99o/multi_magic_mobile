# Sessions — several conversations, and a delete that says what is safe

**Status: `SPECIFIED`** · `api/v1/ai/sessions` · references pulled 2026-09-18

His words: *"we should be able to open multiple sessions and can delete, but
deleting session did not delete data of apps like loan, contact etc."*

## The guarantee, verified in code

`Ai::Sessions.destroy` deletes `AiChunk.where(conversation_id: …)` and the
conversation. A chunk from a Note, a Loan or a Contact has **no
`conversation_id`** — it carries a polymorphic `source_type`/`source_id` — so
the scope cannot reach it. `Conversation`'s dependents are `messages`,
`conversation_members` and `ai_documents`: **all session-local.**

**What delete DOES destroy: the transcript and the files uploaded into that
session.** That is intended and it is the one real loss.

## Sources — and one of them ships his exact sentence

| App | Reference | What we TAKE |
|---|---|---|
| **LINE** — [hide vs delete](https://mobbin.com/screens/7cce0028-c58c-4f7c-8e3f-653bc633404b) `references/line-hiding-does-not-delete.webp` | **a confirm whose entire job is to name what is NOT destroyed** — *"Hiding chats doesn't delete their messages."* This is his requirement, already shipped by somebody |
| **Cleo AI** — [history](https://mobbin.com/screens/9e4110e0-b74e-4c2f-8b4d-bbd623987c5e) `references/cleo-ai-history-new-conversation.webp` | **relative time above the title**, ⋮ → Rename / Delete with delete in red, and **New conversation as a pinned primary at the bottom**. Cleo answers questions about your money — the closest domain to this one |
| **Speak** — [chat history](https://mobbin.com/screens/84cb7cac-3714-494b-b76a-3d09a5da816d) `references/speak-chat-history-counts.webp` | a `Recent` group, and **a message count and a file count on the row** — which is exactly what `AiSessionSerializer` already gives us: `message_count`, `document_count` |
| **Notion** — [chats](https://mobbin.com/screens/0d1a034d-fbe8-4bbd-aecd-4fab8a778c2f) `references/notion-chats-today-rename-delete.webp` | **`Today` grouping**, and Rename / Delete in a small anchored menu rather than a full-width sheet |

## Our decisions

- **A sheet, not a drawer.** An app with one destination does not need a
  persistent drawer; the title bar carries a list icon.
- **Three actions per row, in this order: Clear messages · Rename · Delete.**
  `POST :clear` empties the transcript and **keeps the files and the session** —
  the non-destructive answer to *"this chat got messy"*, which is what most
  delete presses actually mean. **Offering it first is a better safety mechanism
  than a better warning**, and it makes the delete confirm rare.
- **Two delete strings, because "and the 0 files in it" tells a user nobody
  looked:**

  > **Delete this conversation and the 3 files in it?**
  > Your notes, contacts, loans and money are not touched.

  > **Delete this conversation?**
  > Your notes, contacts, loans and money are not touched.

  The second sentence is in **both** — it is the guarantee he asked for, and the
  moment of deleting is when a person wants to read it.
- **The row shows what Speak's shows**: title, relative time, message count and
  file count — the two numbers the serializer already carries, and the file count
  is what makes the delete copy honest.
- **50 sessions is the server's cap** (`Ai::Sessions::MAX_PER_USER`) and titles
  are 60 characters (`TITLE_LIMIT`). The app enforces both *before* the request,
  and says which limit it hit.
- **The first question titles the session automatically** (`autotitle`), so a
  new conversation is never called *Untitled* for long — and rename exists for
  when the first question was a bad name for the thread.
- **Sign out lives at the bottom of this sheet** and **never clears the device
  fingerprint** — the web comment says clearing it causes a re-authentication
  cycle.
