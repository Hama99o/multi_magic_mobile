# The design, chosen — multimagic-mobile

Hamma9900: *"choose good design for mm app."* So this is decided, not offered.
It is read off his own icon and off what the app actually does, and the one
place the references disagree is settled with a reason.

---

## 1 · The palette is already his, in `assets/icon.svg`

| Token | Value | Why |
|---|---|---|
| `ground` (dark) | `#102125` → `#2d5363`, the icon's own diagonal | **The icon's background IS the dark mode.** Nothing to invent |
| `ground` (light) | `#F7F9F9` → white surfaces | a very slightly teal-biased off-white, not paper grey |
| `accent` | **`#48aaa2`** (the icon's teal) | one accent: send, the live mic, a focused field |
| `ink` (dark mode) | `#E8EEEF` | not pure white — the ground is teal-dark, so the text sits warm of it |
| `ink` (light mode) | `#12232A` | the icon's darkest stop, not black |
| the other seven | `#49b4e4 #77b87d #e9ab4c #db5d89 #bd8aca #e9df71 #e98262` | **the icon's vocabulary, used ONLY where a category exists** — a session's dot in the list. Never decoration |

**Dark-first as the identity, both modes built.** His words are *"both mode"*,
and his icon is dark; so dark is the one the app is designed in and light is
the one it also passes. Tokens on a root, redefined per mode — one set, two
resolutions, never a colour that exists in only one.

## 2 · Two typefaces, and the second one is the argument

- **UI — a grotesque.** Labels, the composer, the session list.
- **The assistant's answers — a SERIF.**

That is not a flourish. The reply is not in a bubble (§3), because these answers
are paragraphs drawn from his own notes, loans and contacts. **A serif is what
makes a paragraph read as a document rather than as a text message**, and the
reference we took the no-bubble decision from — the Claude app —
sets its answers in a serif for exactly that reason
(`chat/references/claude-push-to-talk.webp`). The user's own words stay in the
UI face, so authorship is legible by shape before anyone reads a word.

Google Fonts is the only host the artifact CSP admits and the same discipline
suits here: one grotesque with some character, one comfortable reading serif,
real fallback stacks, and nothing else loaded.

## 3 · The shape of the conversation — decided where the references differ

**The user's message: a small bubble, right-aligned, `accent`-tinted.
The assistant's answer: plain text on the page, full measure, no bubble, no
avatar.** Claude's shape over ChatGPT's and Tolan's. A bubble caps a paragraph's
comfortable width and makes an answer about somebody's money look like a remark.

**Per-answer actions under the reply, not floating** (ChatGPT): copy, and a
thumb pair only if `ai/feedbacks` is wired. Nothing else.

**Thinking: three dots where the answer will appear**, aligned with the answer
(Mindvalley) — never a centred spinner. Because the reply arrives over a socket,
**that indicator is load-bearing**: it is the only thing between a posted
question and silence on a bad connection.

## 4 · The composer is one pill and it never changes mode

Alan's shape (`chat/references/alan-recording-waveform-inline.webp`):
`+` · field · mic · send, and **recording happens inside the pill** — a live
waveform, a timer, an `✕` to cancel, the send arrow at the end. The screen does
not become a recording screen. A `✕` inside the field clears a draft (Tolan).

- `+` opens the attachment sheet: **photo, camera, document** — PDF and images
  are what he named. Mirror `multi_magic/app/services/ai/file_extractor.rb`'s
  accepted list exactly, because a file that uploads and teaches the assistant
  nothing is the week's recurring shape in a new costume.
- **Interim dictation words appear in the field while listening**, and the final
  text is **appended** to whatever is already typed.
- **The mic is absent, not disabled, when the device has no recogniser**, and a
  refused permission degrades to the keyboard with one line of explanation
  (Speak's *"I can't speak now"*).

## 5 · Sessions — a sheet, not a drawer

A phone with one job does not need a persistent drawer. The title bar carries a
list icon; it opens a **sheet**: session title, relative time, and the coloured
dot from §1. New conversation at the top. Rename and delete per row through the
same overflow-then-sheet pattern; **the delete confirm names what is safe**:

> **Delete this conversation and the 3 files in it?**
> Your notes, contacts, loans and money are not touched.

That sentence is a requirement, not copy — it is the guarantee he asked for, and
`BRIEF.md` §2a is the verification behind it.

## 6 · The empty state says what it can do WITH HIS DATA

No mascot, no illustration, no "How can I help you today?". One line and three
example questions drawn from the apps that actually exist — notes, money,
contacts, calendar — because **answering from his own data is the entire
difference** between this and any chat app he could install instead. Mindvalley's
disclaimer line under the composer is the honest touch worth keeping, in one
sentence.

## 7 · What this app does NOT get

No gradient hero. No orb. No avatar for the assistant. No streaming-typewriter
effect on the answer — the reply arrives whole from a job, and faking a stream
would be an animation pretending to be a mechanism. No bottom tab bar: there is
one destination.

## 8 · Both sizes

360 dp, 411 dp, 800 dp. At 800 the conversation gets a **max measure** (~640 dp)
and centres rather than stretching — a full-width line of serif text on a tablet
is unreadable, which is the one place a wide screen needs a decision rather than
a resize.
