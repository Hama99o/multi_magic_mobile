# Chat — the app

**Status: `SPECIFIED`** · `app/chat.tsx` · references pulled 2026-09-18

## The one fact that shapes everything

**The reply does not come back from the request.** `ai_controller#question`
enqueues `Ai::RagChat`; the answer arrives over ActionCable
(`app/channels/message_channel.rb`). So the screen posts, shows the question
immediately, and renders the answer when it lands — and **it must survive the
socket dropping**, which on a mobile connection it will: reconnect, then re-read
`GET /api/v1/conversations/:id/messages` (newest-first, 25 a page, older by
`?before_id=` cursor). `GET /api/v1/ai/conversation` returns **only** `{id}` and
is not a transcript.

`POST /api/v1/ai/show` **requires** `conversation_id`, so nothing can be posted
before a session id exists. Limits: **15 questions a minute, 200 an hour**.

## Sources

| App | Reference | What we TAKE | What we REJECT |
|---|---|---|---|
| **Claude** — [chat](https://mobbin.com/screens/91c85991-6bcd-4a78-85ae-a0157c542bc5) `references/claude-push-to-talk.webp` | **the user's text in a bubble, the assistant's answer as plain text on the page** — no bubble, no avatar. It reads as a document, which is what an answer about someone's own notes and money is | the full-screen push-to-talk mode |
| **ChatGPT** — [answer](https://mobbin.com/screens/c5788d46-2106-481c-b034-b5e0a8d29c94) `references/chatgpt-answer-actions-voice-mode.webp` | the composer as **one pill** — `+`, field, mic — and **per-answer actions underneath the reply**, not floating | the voice-mode orb; that is a second product |
| **Alan** — [recording](https://mobbin.com/screens/df5e3d89-6c61-446d-a5a3-d0f8d0eba194) `references/alan-recording-waveform-inline.webp` | **recording happens inside the pill**: `✕` to cancel, live waveform, timer, send arrow. The screen never becomes a recording screen | — |
| **Mindvalley** — [thinking](https://mobbin.com/screens/10ded482-ba09-4e1c-a706-a61365493cd4) `references/mindvalley-thinking-dots-disclaimer.webp` | **three dots where the answer will appear**, and a one-line disclaimer under the composer | the branded orb |
| **Speak** — fallback `references/speak-cant-speak-now-fallback.webp` | *"I can't speak now"* as a **keyboard affordance**, so a refused mic degrades to typing | the mascot |
| **Tolan** — `references/tolan-bubbles-mic-clear.webp` | the `✕` **inside** the field to clear a draft | bubbles for the assistant; the character |

## Our decisions

- **No streaming typewriter.** The reply arrives whole from a job. Animating it
  as if it were streaming would be an animation pretending to be a mechanism.
- **The thinking indicator is load-bearing, not decorative** — it is the only
  thing standing between a posted question and silence on a bad connection, so
  it occupies the exact spot the answer will fill, and it has a **timeout**:
  after ~45 s it becomes *"still working — this one is taking a while"* rather
  than spinning forever. A socket that died silently must not look like a model
  that is thinking.
- **`{ aiError: true }` already comes over the socket** (`useMessageChannel.ts:10-13`)
  — so the error branch is handled, not invented: the question stays on screen
  with a **Retry** under it. A question must never vanish into an optimistic
  bubble.
- **The draft survives backgrounding.** Losing a dictated paragraph is what
  people abandon an app over.
- **Answers are selectable**, code sits in a horizontally scrollable block, and
  nothing caps the measure except §8's tablet rule.
- **On 429**: *"you have asked a lot in a short time"* with the minute it
  resets, not a red failure.

## The references under an answer — and they are already on the wire

His instruction: *"preview reference should be also there."*
`app/serializers/message_serializer.rb:55` already ships them:

```ruby
field :sources do |message|
  Array(message.data&.dig('sources')).filter_map { |link| FrontendRoutes.present(link) }
end
```

So **every answer already carries the records it drew on** — and, exactly like
Karwan's eleven fields, nothing would have rendered them unless somebody looked.
This is the app's whole claim: it answers **from his own data**, and a claim
with no receipt under it is just a chat app.

- **A row of small source chips under the answer**, above the copy action —
  the record's kind and its title, nothing more, because a chip that tries to
  summarise is a second answer.
- **Tapping a chip opens a preview sheet**, not a web page: the record's title
  and a readable excerpt. **This app has no note screen, no loan screen and no
  contact screen**, so the preview is the whole of "open it" — and that is a
  feature rather than a shortfall: the point is to see *why* the assistant said
  what it said.
- **`FrontendRoutes.present` returns a WEB route.** A mobile app cannot follow
  it, so the sheet gets **"open in MultiMagic"** as a secondary action for
  anyone who wants the real record, and the primary experience stays in the app.
- **No sources means no row** — never an empty *"Sources"* heading. An answer
  from the model's own knowledge rather than from his data is a different kind
  of answer, and the absence of chips is the honest way to show it.

## Dictation, inside the composer

`expo-speech-recognition@3.1.3` — **pinned**, because the package switched to
SDK-tracking versions and `latest` (57.x) would put an SDK-57 native module in
an SDK-54 app. Device recogniser only: the web's §10 rule is *"no server, no
key, no per-minute cost"* and this is its phone equivalent.

- **Interim words in the field while listening**; final text **appended** to
  whatever is already typed, never replacing it.
- **Default language `fr-FR`**, matching `lib/useSpeechToText.ts:70`, with EN
  switchable and remembered.
- **The mic is absent, not disabled, when no recogniser exists.** A refused
  permission degrades to the keyboard with one line.
- **Never restore a `denied` permission from storage** (`useSpeechToText.ts:74-79`)
  — the user may have granted it in Settings since, which is more likely on a
  phone than in a browser.
- **The honest note stays honest**: on Android the recogniser usually streams
  audio to Google, exactly as Chrome's does. The web doc says so; so does this
  app, once, where a user can see it.

## The empty state

No mascot, no *"How can I help you today?"*. One line plus three example
questions drawn from the apps that exist — notes, money, contacts, calendar —
because **answering from his own data is the entire difference** between this
and any chat app he could install instead. Mindvalley's one-sentence disclaimer
under the composer stays.

## At 800 dp

The conversation takes a **max measure of about 640 dp and centres**. A
full-width line of serif text on a tablet is unreadable — this is the one place
a wide screen needs a decision rather than a resize.

## How we code it — written 2026-09-19 from the code, `main` at `bbdfc2b`

This section was missing (README rule 3) and is written from what exists, not
from what was planned. Where the code went somewhere the decisions above did
not anticipate, it is recorded as a divergence below rather than rewritten.

| Thing | Where |
|---|---|
| the screen | `app/chat.tsx` — `Screen measure={false} avoidKeyboard`; the list and the composer wrapper each take `metrics.maxMeasure` (640) themselves, so §8's centring is theirs, not the container's |
| the session id | `useQuery(["ai","currentSession"])` → `aiApi.currentSessionId()` → `GET /api/v1/ai/conversation` (`{id}` only); overridden by this device's remembered choice, `src/lib/rememberedSession.ts` |
| asking | `aiApi.ask({ conversationId, body })` → `POST /api/v1/ai/show`, 202; the question is drawn at once from the 202's `userMessageId` via `addPending` so the socket echo merges rather than doubles |
| transcript + live + resync | `useConversation({ conversationId, channel: "MessageChannel" })` (`src/hooks/useConversation.ts`): `messagesApi.list/older` → `GET /api/v1/conversations/:id/messages` (`?before_id=`), `subscribeToChannel` from `src/lib/cable.ts`, re-read on `onConnected`, a 3 s poll (`RESYNC_MS`) while a reply is awaited, released after 180 s (`REPLY_TIMEOUT_MS`) |
| the rows | `src/components/chat/MessageRow.tsx` — the user's words in a bubble, the answer as `AnswerMarkdown` (`variant="answer"`, serif, `selectable`, code in a `horizontal` `ScrollView` in `FONTS.mono`), `testID="assistant-answer"` |
| thinking | `src/components/chat/ThinkingDots.tsx` — `testID="thinking"`, and after `SLOW_AFTER_MS` (45 s) `thinking-slow` with the "taking a while" copy |
| the two failures | `chat-answer-failed` ("That question did not get an answer." + **Ask again**) when `useConversation` reports `failed` (the socket's `aiError`, or the 180 s release); `chat-send-failed` (**Retry**) when the POST itself failed — 429, offline, or the server's own sentence via `apiErrorMessage` |
| the composer | `src/components/chat/Composer.tsx` — one pill: `composer-attach` (+), `composer-input` (`multiline`), `composer-clear` (✕ with a draft), `composer-mic`, `composer-send` |
| the draft | `useDraft(conversationId)` (`src/hooks/useDraft.ts`) — AsyncStorage per conversation, so it survives backgrounding; notifications and calendar `setDraft` into it and push `/chat` |
| dictation | `useSpeechToText` (`src/hooks/useSpeechToText.ts`) over `expo-speech-recognition@3.1.3`: `DEFAULT_LANG = "fr-FR"`, `LANGUAGES` (fr/en), the choice in AsyncStorage `mm-stt-lang`; interim words beside the field (`composer-listening`), `composer-dictation-cancel`, final text appended; `denied` is never restored from storage; `composer-mic-refused` is the one-line degradation; the mic is **absent** when the module is missing (`available` false) |
| sources | `src/components/chat/SourceChips.tsx` (`source-chips`, none → no row) and `SourceSheet.tsx` (`source-sheet`, `source-sheet-close`, **Open in MultiMagic** = `source-sheet-open` via `Linking`) reading `message.sources` from `message_serializer.rb:55` |
| under an answer | `src/components/chat/AnswerActions.tsx` (`answer-actions`, `answer-copied`, `answer-undo` on the newest undoable reply only → `undoApi.undo` `POST /api/v1/ai/undos`; feedback → `POST /api/v1/ai/feedbacks`) |
| files in an answer | `src/components/chat/FilePreview.tsx` (`file-preview`, `file-preview-image`, `file-preview-open`) for a link that `isFileLink` |
| the empty state | `src/components/chat/EmptyState.tsx` (`chat-empty`) with prompts from `useStarterPrompts` — `buildPrompts` derives at most three (≤ 64 chars) from what the account actually holds |
| the doors | `chat-open-chats` · `chat-open-notifications` · `chat-open-calendar` · `chat-open-sessions` in the title bar, badges from `notificationsApi.unreadCount` and `conversationsApi.unreadCount` (threads, not messages) |
| errors from `http` | `isRateLimited` · `isNetworkFailure` · `apiErrorMessage` (`src/api/http.ts`) |
| flows | `01-ask` (the socket — NOT MEASURED until the send button is found in the tree), `03-dictation` (VERIFIED, four states, dev build), `09-keyboard`; `07` and `08` end in this composer, composed and not sent |

### Divergence notes — 2026-09-19

- **Recording inside the pill is thinner than Alan's.** The decision names a
  waveform, a timer and a send arrow; the code shows the interim words and an
  `✕`. The interim text is the proof it is hearing you, which is the job; the
  waveform and timer were never built. Decision stands; state recorded.
- **The language switch is a long-press on the mic**, remembered, with no
  visible affordance beyond the accessibility label *"Dictate in Français"*.
  "EN switchable" is true; "discoverable" is not asserted anywhere.
- **The empty state's three questions are derived, and may be none.** The
  decision says three example questions drawn from the apps that exist; the
  code derives them from the person's own records and, for an account with
  nothing to derive from, offers the one line and no questions
  (`useStarterPrompts.ts` header, rule 3). `01-ask` types its question for
  exactly this reason.
- **Two failure branches, not one.** "Retry under the question" became **Ask
  again** for an answer that never came and **Retry** for a question that never
  posted. Both keep the question on screen, which was the point.
- **On 429 the copy names the minute but does not count it down** at `bbdfc2b`
  ("Try again in a minute."). *Landed since, in `74b1cba`:* it is now a muted
  line naming both caps (15 a minute, 200 an hour) with a live countdown, the
  question kept in the composer and send held until it reaches zero — and
  **no Retry button**, because offering one is inviting the person to do the
  thing that keeps the limit closed. `Retry-After` is honoured where the
  server sends it (Rack::Attack does; Rails' own `rate_limit` on `ai#show`
  does not, so 60 s is the fallback).
- **Additions the decisions did not anticipate**: the four title-bar doors
  (his instruction, `70c68b6`); Undo and feedback under an answer (from the web's
  §Undo); file previews for links in an answer; the device-remembered session
  (`rememberedSession.ts`, because `ai/conversation` follows whichever client
  spoke last).

### Divergence notes — 2026-09-19, later

Written after the failure-paths, read-aloud, freshness and language work
landed. Everything above still holds; these are the decisions the table above
did not know about.

- **The composer has three lines under it now, and all three are states
  rather than errors.** `composer-mic-refused` (was already there),
  `composer-mic-problem` — a recogniser that exists but cannot work right now,
  network or microphone or an unsupported language, one sentence each — and
  `composer-offline`, which also **disables send and attach** while
  MultiMagic is not answering. Offline is observed rather than asked of a
  native module: any response marks the host reached, no response marks it
  not, and a `GET /up` probe runs only between a failure and the next success
  (`src/stores/reachability.store.ts`).
- **A 401 now leaves this screen.** It used to clear the token, flip the
  store and navigate nowhere, so the chat stayed up with every request
  failing. The root layout watches the store and replaces to sign-in, which
  says whether the session expired or was revoked — read from the token's own
  `exp`, because devise-jwt answers both identically.
- **Read-aloud exists, behind `READ_ALOUD_ENABLED = false`.** Per-answer
  controls (`answer-read`, `-pause`, `-resume`, `-restart`), the server's
  voice from `GET /api/v1/ai/messages/:id/speech`, the phone's voice as a
  fallback that **says so on screen** (`answer-read-device-voice`), and
  pause/restart deliberately NOT offered for the phone's voice because it
  cannot resume from a sample. `BRIEF.md` §6 said "recommend: not in v1"; he
  asked for it on 18 Sept and it waits on his ear, not on code.
- **The answer's serif and its code blocks name a real family.**
  `fontFamily: "serif"` and `"monospace"` are Android generic names; on iOS
  they are a console warning and San Francisco, so IDENTITY §2's whole
  argument did not render there. `src/theme/fonts.ts` resolves Georgia and
  Menlo on iOS.
- **Everything on this screen is translated.** English and French, the web's
  own French wherever a string exists in both (`docs/LANGUAGES.md`). The
  dictation language and the interface language are still separate settings,
  which is correct — he dictates in French into an interface he may be
  reading in English — but nothing on screen says so. Proposed at the foot of
  this file, with the words, and left unbuilt for him.
- **The composer went under the keyboard on Android, and it is fixed and
  verified.** `ScreenContainer` passed `behavior={undefined}` on Android on the
  belief that the window always resizes, which stopped being true when
  `edgeToEdgeEnabled` was set. Fixed in `28cf795`. QA's first-ever run of
  `09-keyboard` then passed against a **docked, full-width** Gboard with a
  message sent and ticked, so this is witnessed rather than reasoned.

  *Corrected the same day:* an earlier version of this note said the flow had
  been passing vacuously against a FLOATING keyboard. It had not been passing
  at all — it had never been run — and that AVD's Gboard is docked. The
  "floating" claim came from the flow's own header and was believed because it
  was specific. `docs/TESTING.md` §6 is the write-up, including the part where
  this file got it wrong.

---

## Proposal, not built — saying which language the mic is listening in

**2026-09-19. Written down, deliberately unimplemented. The words below are a
starting point for his, and where the control lives is a separate decision from
whether the sentence exists.**

### What is actually on screen today

The dictation language and the interface language are two settings, and that is
right: the corpus is largely French, so he dictates in French into an interface
he may be reading in English. `DEFAULT_LANG = "fr-FR"`
(`useSpeechToText.ts:107`) while `DEFAULT_LANGUAGE = "en"` (`i18n/index.ts:46`),
which means **the default install already disagrees with itself on purpose**.

Nothing says so. Three things are true at once and none of them is visible:

1. **The state is unspoken.** While listening, the row reads `"Listening…"` /
   `"Écoute…"` — no language in it. The only way to learn which language the
   recogniser is in is to speak and read what comes back wrong.
2. **The control already exists, and nobody can find it.** A **long press on
   the mic** switches the language and remembers it (`Composer.tsx:207-211`).
   There is no label, no hint, no second glyph, and nothing anywhere else in
   the app uses long press to change a setting. This is a feature that ships
   and is never used.
3. **A screen reader is told and a sighted user is not.** The mic's
   `accessibilityLabel` is `composer.dictateIn` → *"Dictate in {{language}}"*.
   VoiceOver and TalkBack announce the listening language on focus. The screen
   does not print it. That inversion is an accident, not a decision.

### The proposal: one sentence, where dictation starts

Fold the language into the line that already appears when listening begins,
rather than adding a fourth line to a composer that has three already
(`composer-mic-refused`, `composer-mic-problem`, `composer-offline`). It
appears exactly when the mic opens, and it is replaced by the interim words the
moment the recogniser hears something — which is the right moment for it to
stop mattering.

The words, in the **interface** language, naming the **listening** language:

| interface | listening | line |
|---|---|---|
| EN | fr-FR | `Listening in French…` |
| EN | en-US | `Listening in English…` |
| FR | fr-FR | `Écoute en français…` |
| FR | en-US | `Écoute en anglais…` |

Nothing more — no "tap to change", no chevron, no second control. If he wants
the switch discoverable that is the *other* decision below, and bolting a hint
onto this line answers both questions badly.

### The one thing in it that is genuinely a decision

**Which language do we name it in?** The table above writes *French* and
*anglais* — the language named **in the interface language**, so the sentence
reads as a sentence. But `LANGUAGES` deliberately labels each language **in
itself** (`Français`, `English`), which is correct for the chooser in
`LanguageRow` and correct for the mic's current label, and would give
*"Listening in Français…"* here.

Both conventions are defensible and the app currently only has the second. A
sentence wants the first. Picking one means either a second label per language
or an accepted inconsistency between the chooser and the sentence — and that is
his call, not a detail to settle in an implementation.

### The decision this does NOT make

He may want the listening language switchable **from the composer** rather than
from a settings row — which, given (2) above, is less "add a control" than
"make the hidden one real". That is a different screen and a different
question: a visible affordance next to the mic costs horizontal space in the
one row that has none to spare, and the alternatives (a chip above the field, a
long-press hint the first time, a sheet on the mic) are three different
designs, not three spellings of one.

So: the sentence is proposed on its own, and stands on its own if the switch
never moves. **Neither is built.** Both wait on him.

`docs/DICTATION_LANGUAGE.md` is the version written for him rather than for
this file: the inversion in point (3) above drawn rather than argued, the three
shapes side by side with what each costs and breaks, a recommendation, and the
naming question as two columns of example sentences. Short enough to decide
from.

## Dismissal — the scrim closes, the sheet does not

Tapping the dark area **outside** the source preview sheet closes it. Tapping the sheet itself,
including its padding and any gap between rows, does **nothing**.

Unchanged on 2026-09-19, when the scrim was restructured: this sheet already
behaved this way, by way of an inner Pressable that swallowed the tap. That
Pressable is gone and the behaviour is the same, now as a consequence of the
layout rather than of a handler.

**And the scrim is a SIBLING of the sheet, never its parent** (`SourceSheet.tsx`). This is
not a layout preference: a named accessibility element groups its children, so a
`Pressable` labelled "Close" wrapping the content made the whole modal announce
as one "Close" button with every row inside it unreachable — on iOS, absolutely.
`docs/ACCESSIBILITY.md` N1, and `src/__tests__/a11y.test.tsx` fails if any
container with a name acquires a control inside it again.
