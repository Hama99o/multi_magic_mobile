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

## How we code it — written 2026-09-19 from the code, `main` at `bbdfc2b`

This section was missing (README rule 3) and is written from what exists.
Divergences from the decisions above are recorded below, not folded in.

| Thing | Where |
|---|---|
| the sheet | `src/components/sessions/SessionsSheet.tsx` — a `Modal`, `testID="sessions-sheet"`, opened from `chat-open-sessions`; `sessions-close` |
| the list | `useQuery(["ai","sessions"])` → `sessionsApi.list()` → `GET /api/v1/ai/sessions`, grouped `Today` / `Earlier` by `isToday(updatedAt)` (`src/lib/relativeTime.ts`) |
| a row | `src/components/sessions/SessionRow.tsx` — relative time above the title, `messageCount` · `documentCount` beneath, a dot coloured by `categoryColorFor(session.id)`, `session-scoped-*` / `session-instructed-*` glyphs; `testID`s `session-row-<id>` and `session-menu-<id>` |
| new | `sessions-new` → `sessionsApi.create()` → `POST /api/v1/ai/sessions` (server title `New chat`); disabled at `LIMITS.maxSessions` (50) with `sessions-at-limit` naming the limit |
| the row menu | `session-menu` — `session-menu-clear` → `POST /api/v1/ai/sessions/:id/clear` · `session-menu-rename` → `RenameDialog.tsx` (`rename-input`, `maxLength={LIMITS.titleLimit}` = 60, Enter saves) → `PATCH /api/v1/ai/sessions/:id {title}` · `session-menu-scope` → `ScopeDialog` (`scope-<app>`, `scope-all`, `scope-save`) → `PATCH {apps}` · `session-menu-instructions` → `InstructionsDialog` (`instructions-input`, `instructions-save`) → `PATCH {instructions}` · `session-menu-delete` |
| the confirm | `src/components/sessions/DeleteConfirm.tsx` — `delete-conversation-confirm`, `deleteQuestion(fileCount)` in `delete-conversation-question`, the guarantee in `delete-conversation-safe`, `delete-conversation-yes` / `-cancel` ("Keep it") → `sessionsApi.destroy` → `DELETE /api/v1/ai/sessions/:id`, which answers with the session to fall back to |
| the choice | `onOpenSession` → `chooseSession` in `app/chat.tsx`, remembered per user in `src/lib/rememberedSession.ts` |
| below the list | `ThemeRow.tsx` (`theme-row`, `theme-system` / `-light` / `-dark`, `useThemeStore`), then an **Account** heading under a divider: `sessions-profile` → `/profile`, `sessions-account` → `/account`, `sessions-sign-out` → `useAuthStore.signOut()` → `DELETE /users/logout`, token and email cleared, **fingerprint kept** (`src/api/auth.ts`) |
| flows | `04-delete-conversation` (menu order, confirm wording, cancels), `15-sessions-switch` (new → empty, rename, switch by title, deletes what it made), `12-account` (theme) |

### Divergence notes — 2026-09-19

- **Five actions per row, not three.** Clear is still first and Delete still
  last, as decided; between them sit **Search in** (which apps this chat may
  draw on, `apps`) and **How to answer** (standing `instructions`), both
  `PATCH`es the server offered and the decisions did not anticipate. The
  safety argument — the non-destructive answer first — is intact.
- **The sheet carries more than conversations.** Appearance (System · Light ·
  Dark) and an Account group live under a divider at the bottom, on his
  instruction; `../account/SPEC.md` §3.1 is why the account rows sit apart
  from the list rather than in it.
- **A device remembers its own choice.** Not in the decisions: `ai/conversation`
  returns whichever session was spoken in last from ANY client, so a laptop
  question would move the phone mid-thread. `rememberedSession.ts` makes the
  server's answer the fallback only.
- **Row testIDs are database ids.** `session-row-<id>` and `session-menu-<id>`
  cannot be named by a flow ahead of time; `flow_lint`'s DBID rule reports them
  and `15` names rows by title and menus by their `Options for <title>` label.
  A stable per-row handle would need a slug, and none is on the serializer.

### Divergence notes — 2026-09-19, later

- **Appearance is now two rows, not one.** `language-row` sits beside
  `theme-row` under the same heading: `language-en` / `language-fr`, each
  language **written in itself**, because the way out of a language you
  cannot read has to be legible from inside it. His instruction put language
  and mode in one breath ("same lang as we have in web, both mode"), and the
  choice is saved on the same `users.lang` the web's switcher writes, so a
  switch on the laptop reaches the phone.
  **This diverges from `../account/SPEC.md`**, whose references put settings
  on the account screen. The theme chooser was already here with a reason,
  and moving two controls the night before a first iOS build buys nothing —
  recorded rather than acted on, per Hamma9901.
- **The rename field says what the cap is.** `rename-count` renders `n / 60`
  beside it. `maxLength` already enforced the server's `TITLE_LIMIT`, which
  means the typing simply stopped with nothing to explain why.
- **The sheet respects the bottom inset.** Its last row is **Sign out**, and
  it padded a fixed 24 dp — under the gesture bar on edge-to-edge Android and
  under the 34 pt home indicator on every iPhone since the X. One table now
  holds all six of this app's sheets to the same rule
  (`src/components/__tests__/sheets.insets.test.tsx`).
- **Both dialogs lift themselves above the keyboard**, on both platforms.
  `RenameDialog` autofocuses, so on a short phone its field opened underneath
  the keyboard; a `Modal` is its own window and is not resized under
  edge-to-edge either. See `../chat/SPEC.md`'s note on `09-keyboard` for why
  the old rule survived so long.
- **The delete confirm's guarantee is a function now, not a constant.**
  `SAFE_SENTENCE` was evaluated at import — before the stored language is
  read — so it would have stayed English in a French app while every test
  passed, because the tests compared against the same constant.

## Dismissal — the scrim closes, the sheet does not

Tapping the dark area **outside** the conversation row menu closes it. Tapping the sheet itself,
including its padding and any gap between rows, does **nothing**.

**This changed on 2026-09-19 and it changed in the direction of the rule.**
Before that, the sheet's body sat *inside* the dismiss target, so a tap on its
own padding propagated to the scrim and closed it. That was accidental rather
than designed — the other sheets never behaved that way — and it is gone. If it
comes back as a report that the sheet "stopped closing", this line is the
answer: it is closing exactly where it always should have.

**And the scrim is a SIBLING of the sheet, never its parent** (`SessionsSheet.tsx`). This is
not a layout preference: a named accessibility element groups its children, so a
`Pressable` labelled "Close" wrapping the content made the whole modal announce
as one "Close" button with every row inside it unreachable — on iOS, absolutely.
`docs/ACCESSIBILITY.md` N1, and `src/__tests__/a11y.test.tsx` fails if any
container with a name acquires a control inside it again.
