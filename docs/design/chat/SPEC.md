# Chat — the app

**Status: `SPECIFIED`** · `src/screens/Chat` · references pulled 2026-09-18

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
