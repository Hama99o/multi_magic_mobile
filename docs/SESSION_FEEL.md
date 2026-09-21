# The conversation side, as it actually behaves

He said the conversation and session part of the assistant "is not what I
want", which is not actionable as stated. So this is what it does today, in the
order somebody meets it, written from a device I watched rather than from the
code — `docs/SESSION_PARITY.md` already covers the endpoints and the panels.

Screenshots behind each claim were taken on `qa_phone4`, signed in as the QA
account, 2026-09-21.

Where mobile and the web differ I say which I think is better, because a
recommendation can be overruled in a second and a diff cannot be acted on.

---

## 1 · Which conversation opens when you open the app — THIS WORKS

**What happens.** The one you last opened. It is remembered locally
(`src/lib/rememberedSession.ts`, AsyncStorage key `mm:aiSession:v1:<userId>` —
byte-identical to the web's localStorage key) **and the server is told**, so the
same chat opens on the laptop.

`app/chat.tsx:180`, inside `chooseSession`:

```ts
if (user?.id) void rememberSession(user.id, id);
void sessionsApi.activate(id).catch(() => undefined);
```

`sessionsApi.activate` is `src/api/ai.ts:430` → `POST /api/v1/ai/sessions/:id/activate`.
Both halves, the same two the web does.

### The first version of this section said the opposite, and that is the lesson

It said mobile copied the local half only, that the phone and the laptop
disagree until you ask a question, and that fixing it was "one call in
`chooseSession`". Every word of that was wrong, and I wrote it **from
`docs/SESSION_PARITY.md` instead of from the function**. That file's table still
carries

```
| **activate** | sessions#activate | AiChat.tsx:119 | **nothing** | **never got it** |
```

and the call landed in `3088fd2` on 2026-09-20 15:45, three hours before that
file was last edited. So the row was already false when somebody touched the
file and left it alone.

Had that recommendation been acted on, the fix would have been a SECOND
`activate` beside the existing one, and nothing in any gate would have said so.
`docs/TESTING.md` is a book about this exact failure and I still made it, in the
section I said to read first.

**The real defect here is the register, not the app.** SESSION_PARITY.md's row
is corrected in the same commit as this paragraph.

## 2 · Starting a new one — two taps, and one may already be waiting

**What happens.** Tap the speech-bubble icon in the title bar → the
**Conversations** sheet → **New chat**. Two taps from an answer.

**What I watched, and it is the part I would change.** The QA account's list
opened with a row reading **"New chat · 0 messages · Yesterday"** — an empty
conversation created on a previous visit, still sitting in the list. Nothing
cleans it up, and pressing New chat again would add another.

**My recommendation.** Either do not create the session until the first question
is sent, or reuse an existing empty one instead of making a second. An empty
chat is not a thing anybody wants to scroll past, and it is the first row.

## 3 · What a title is — and this part is good

**What happens.** The title is **the first question you asked**, verbatim. From
the real list:

- *"What did I note about the apartment?"* — 14 messages · 1 file
- *"When did I last speak to Ahmad?"* — 2 messages
- *"Do I owe anyone money?"* — 2 messages

Until you ask something it is "New chat". You can rename from the row menu.

**This is not a list of six-word stubs.** Each row carries the question, the
message count, whether a file is attached, and a relative time, and the list is
grouped under **Yesterday** / **Earlier**. It is more informative than the web's
titles-only sidebar, and I would not change it.

## 4 · When a session appears in the list

**Immediately** — before it has a single message, which is how the "New chat ·
0 messages" row above came to exist. See §2.

## 5 · A half-typed question — this is better than the web

**What happens.** The draft is kept **per conversation** in AsyncStorage
(`useDraft`), so switching to another chat and back brings your half-typed
question with it, and it survives backgrounding the app.

The web keeps one draft in component state; switching chats loses it.

**Keep it as it is.**

## 6 · What the screen says before you have asked anything

**What happens.** A muted line (`chat.emptyTitle`) and **at most three starter
prompts**, and they are derived from what the account actually holds rather than
being fixed copy — `buildPrompts` in `useStarterPrompts.ts` prefers, in order:
a READY file you put in this conversation ("What does <file> say?"), a calendar
event, then the apps holding the most data, using the server's own ranking.

**Not measured:** I could not photograph it, because the QA account has
history, so every conversation I could reach already had messages. Worth a look
on a genuinely new account before judging it.

## 7 · Getting from an answer back to a different conversation

Two taps: the speech-bubble icon, then the row. The sheet covers the
conversation while open and closes on the ✕ or the scrim.

## 8 · A long answer, and the keyboard

Both were wrong until tonight and both are fixed: a conversation now lands at
the newest message however tall it is (`scrollToEnd` was using an *approximated*
last-row height and clamping to the top), and the keyboard no longer hides the
newest message. Four commits, `bd97118` last.

---

## The short answer, if only one thing gets changed

**§2** — the empty conversation. A "New chat · 0 messages" row sits at the top
of the real list because a session is created before it is used and nothing
reuses or cleans one up. It is the first thing he sees when he opens the list,
and it is the only item here that is a defect rather than a preference.

(§1 was the answer to this question in the first draft of this file. It was
wrong, and §1 says how.)
