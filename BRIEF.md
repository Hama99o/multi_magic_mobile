# multimagic-mobile — a phone app that is a login and the assistant

Hamma9900, 2026-09-18: *"a multimagic ai where it has login only, ai chat where
we talk, that's it. Very small project… speech to text as we have in web, same
ai assistance as we have… no big thing but with good design."*

**Scope**, after his additions of 18 Sept — *"upload pdf and image etc should
work, and we should be able to open multiple sessions and can delete"*:

**IN:** sign in · the conversation · **dictation** · **file upload (PDF and
images)** · **several sessions: list, open, rename, delete**.

**OUT:** read-aloud (`expo-speech` makes it two lines later; he asked for speech
*to* text), the actions UI (*"create a note"* — §5 of the web doc), the global
minimised window (§11, a desktop idea), page context (§4 — there are no other
pages here to be standing on).

**The folder is `multimagic-mobile`** — his correction. The icon is
MultiMagic's own, and the app is **English with both modes**, per his words.

---

## 1 · There is NO new backend. It talks to MultiMagic.

Verified by reading `~/Apps/Personal/multi_magic`:

| What | Where |
|---|---|
| Ask a question | `POST /api/v1/ai/show` + `GET /api/v1/ai/conversation` (`ai_controller.rb`) |
| **The answer arrives over ActionCable** | `app/channels/message_channel.rb` — `ai_controller#question` **enqueues** `Ai::RagChat`; the reply is broadcast, not returned |
| Sessions — list, create, rename, delete, clear | `api/v1/ai/sessions` (`index create update destroy`, `POST :clear` on member) |
| **Files in a session** | `api/v1/ai/sessions/:id/documents` (`index create destroy`) — this is the upload path, and uploads are **per session** |
| Provider | **DeepSeek**, with local embeddings and RAG over the user's own `ai_chunks` |
| Auth | the existing MultiMagic login |

**The single most important consequence: the reply is asynchronous.** The app
posts a question and then *waits on a socket*. So the composer's job is not
"send and await a response" — it is "send, show the question immediately, and
render the answer when it lands". `@rails/actioncable` works in React Native;
`multi_magic/app/javascript/lib/useMessageChannel.ts` is the web hook to copy
the subscription shape from, not the transport.

**And it must survive the socket dropping**, which on an Afghan or French mobile
connection it will: reconnect, and on reconnect re-read
`GET /api/v1/ai/conversation` so a reply that landed while the phone was in a
tunnel is not lost. That is the one piece of engineering in this app.

## 2 · Speech: the web uses the BROWSER's engine, so the app uses the PHONE's

`AI_ASSISTANT.md` §10: *"Both directions use the browser's own engines — no
server, no key, no per-minute cost."* There is no Web Speech API on a phone, so
the equivalent is the **device** recogniser — iOS Speech framework, Android
`SpeechRecognizer` — via `expo-speech-recognition`. Same principle, same cost:
**nothing goes to our backend and nothing is metered.**

Three behaviours to carry over from the web hook rather than reinvent:
- **Interim words shown while listening** (the web shows them beside a red dot),
  and the final text **appended** to whatever is already typed, not replacing it.
- **The button hides when the device cannot do it**, rather than offering
  something that will not work. On a phone that means the permission was refused
  or no recogniser is installed — and Speak's *"I can't speak now"* fallback
  (`chat/references/speak-cant-speak-now-fallback.webp`) is the honest version.
- **The honest privacy note stays honest**: on Android the recogniser usually
  streams audio to Google, exactly as Chrome's does. The web doc says so
  plainly; the app should too, once, where a user can see it.

## 2a · DELETING A SESSION CANNOT DELETE APP DATA — verified, not assumed

His requirement: *"deleting session did not delete data of apps like loan,
contact etc."* I read the code rather than trusting it, and the property holds
**by scoping**, which is the kind that cannot drift:

```ruby
# app/services/ai/sessions.rb:70
def destroy(conversation)
  AiChunk.where(conversation_id: conversation.id).delete_all
  conversation.destroy
end
```

`ai_chunks` carries **both** `conversation_id` (nullable) **and** a polymorphic
`source_type`/`source_id` — the Note, Loan or Contact a chunk came from. A
record's chunk has **no `conversation_id`**, so a delete scoped on that column
cannot reach it. And `Conversation`'s dependents are `messages`,
`conversation_members` and `ai_documents` — **all session-local; none is an app
record.**

**What deleting a session DOES destroy, and the app must say so plainly: the
transcript and the FILES uploaded into it** (`has_many :ai_documents, dependent:
:destroy`). That is intended — the web doc calls it *"its files and everything
those files put in the corpus"* — and it is the one real loss.

So the confirm dialog is a design requirement, not a nicety:
**"Delete this conversation and the N files in it? Your notes, contacts, loans
and money are not touched."** Naming what is safe is the whole point — he asked
for the guarantee, so the user should be able to read it at the moment of
deleting.

## 3 · Design — six references, and they disagree usefully

| App | Reference | What we TAKE | What we REJECT |
|---|---|---|---|
| **ChatGPT** — [answer + composer](https://mobbin.com/screens/c5788d46-2106-481c-b034-b5e0a8d29c94) | the composer as **one pill**: `+`, the field, a mic, and a filled voice button; **per-answer actions** (copy, read aloud, thumbs) under the reply, not floating | the voice-mode orb — that is a second product |
| **Claude** — [push to talk](https://mobbin.com/screens/91c85991-6bcd-4a78-85ae-a0157c542bc5) | **user text in a bubble, the assistant's answer as plain text on the page** — no bubble. It reads as a document rather than a chat, which is right for long answers | the full-screen push-to-talk mode |
| **Alan** — [recording](https://mobbin.com/screens/df5e3d89-6c61-446d-a5a3-d0f8d0eba194) | **recording happens IN the composer**: an `✕` to cancel, a live waveform, a timer, a send arrow. The screen does not change modes | — |
| **Mindvalley** — [thinking](https://mobbin.com/screens/10ded482-ba09-4e1c-a706-a61365493cd4) | **three dots where the answer will appear**, aligned with the answer, not a spinner in the middle; and a one-line disclaimer under the composer | the branded orb |
| **Speak** — fallback | *"I can't speak now"* as a **keyboard affordance**, so a refused permission degrades to typing | the mascot |
| **Tolan** — bubbles | the `✕` **inside** the field to clear a draft | bubbles for the assistant, and the character |

**The decision where they differ: the assistant's reply is NOT in a bubble.**
Claude's shape, because this assistant answers from the user's own notes and
finances and its answers are paragraphs, not remarks. A bubble makes a
paragraph look like a text message and caps its comfortable width.

**Because the reply is asynchronous, the thinking indicator is load-bearing
rather than decorative** — it is the only thing standing between a posted
question and silence on a bad connection. Mindvalley's dots-in-place is exactly
right: it occupies the spot the answer will fill.

## 4 · Same config as Karwan and Hatiwal, verified from `karwan-mobile`

Expo **54.0.35**, React Native **0.81.5**, `expo-router` 6, NativeWind 4.2.5,
Zustand 5, TanStack Query 5, axios, Jest + React Native Testing Library.

**What to lift rather than rewrite:** `src/api/http.ts` (the interceptors and
the error shape), `src/theme/tokens.ts` **reduced to one role** — this app has
no roles, so `TOKENS` collapses to light/dark and `METRICS` to one profile —
`ScreenContainer`, `components/reusables/*`, and the i18n scaffold.

**What must NOT be lifted:** the three-role machinery, the map, the RTL-first
default.

**Language — checked, and it is not what I first assumed.** `config/locales/`
holds only `en.yml` and `devise.en.yml`: **the web interface is English.** The
*corpus* is largely French, which is a different thing. And
`lib/useSpeechToText.ts` keeps an `stt_lang` preference in localStorage — so
**the UI is English, and the DICTATION offers FR and EN.** LTR throughout.

**Both modes**, his words — and the palette is already decided by his own icon
(`assets/icon.svg`): ground `#102125` → `#2d5363`, which *is* the dark mode
background, and eight accents — `#49b4e4 #77b87d #e9ab4c #db5d89 #bd8aca
#48aaa2 #e9df71 #e98262`. A design system does not need inventing here; it
needs reading off the icon.

**Icons generated** from that SVG's own geometry, since the box has no SVG
renderer and a 256 px source would be soft: `assets/icon-1024.png`,
`assets/adaptive-foreground-1024.png` (the tiles and star alone, for Android's
mask) with `#102125` as the adaptive background, and
`assets/splash-icon-512.png`.

## 5 · What "works well" means here, because it is the whole product

- A question posted on a bad connection **arrives, or says it did not** — never
  disappears into an optimistic bubble.
- An answer that lands while the app is backgrounded **is there on return**,
  which is what re-reading the conversation on reconnect buys.
- The composer **keeps a draft** across a backgrounding. Losing a dictated
  paragraph is the failure people abandon an app over.
- **Long answers are readable**: selectable text, code in a scrollable block,
  and no width cap inherited from a bubble.
- 360 dp and 800 dp both work, per the Karwan rule.

## 6 · Open for him

1. **The name** — folder is `multimagic-ai`; the app's visible name is his.
2. **Read-aloud** — the web has it; he asked only for speech *to* text.
   `expo-speech` makes it two lines. Recommend: not in v1.
3. **Which uploads to accept.** PDF and images are named. The web extracts text
   from more (`file_extractor.rb`); accepting a type the extractor cannot read
   would be a file that uploads and teaches the assistant nothing, which is the
   week's recurring shape. Mirror the extractor's list exactly, and say so in
   the picker.
