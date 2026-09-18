# Read-aloud with a real voice — a recommendation, not a build

Hamma9900, 2026-09-18: *"we need to find a library — something in backend, I
don't know — like a real human voice… on web it's broken, something is reading
very bad, so we should find a serious thing… if we find a good voice which can
read the text very well we will use it for web and for mobile also, maybe we
need an API for this. We should be able to stop it, restart it and pause it —
this kind of thing should happen on web also and on mobile also."*

**Not built and not on tonight's list.** His finish-tonight scope is login, AI
conversation, messages, notifications, calendar and profile — all six of which
are done. This is the written answer to a question he asked, for him to decide
on when he is back.

---

## 1 · Why the web one sounds bad, precisely

`multi_magic/app/javascript/lib/ai/useSpeech.ts` wraps the **browser's own
`speechSynthesis`**, and `docs/AI_ASSISTANT.md` §10 says why that was the right
first choice: *"no server, no key, no per-minute cost."*

But `speechSynthesis` does not have a voice — **it borrows the operating
system's**, and that is the whole problem:

- On **Linux/Chrome** the available voices are usually eSpeak-class: robotic,
  and worse in French than in English. **That is what he is hearing.**
- On macOS and iOS they are good. On Windows, mixed. On Android, whatever
  Google's engine provides.
- So **the same app reads beautifully on one machine and badly on another**, and
  no code change fixes it, because the voice is not ours.

**And the transport controls are the second half of the complaint.**
`speechSynthesis.pause()`/`resume()` are notoriously unreliable across engines —
they no-op, or resume from the start, or cancel. **You cannot build a dependable
play/pause/stop on an interface that is a different implementation per browser.**

## 2 · The choice is one decision, and it is not really about voices

**Device voices, or our own audio?**

| | device (`speechSynthesis` / `expo-speech`) | our own audio |
|---|---|---|
| voice quality | whatever that machine has | **the same everywhere** |
| cost | free | metered, or a server |
| offline | yes | no |
| **pause / stop / restart** | **unreliable** | **trivial and exact** |
| his complaint | is caused by this | is what fixes it |

**We generate the audio.** Then the voice is a decision rather than an accident,
and the controls are an audio player — `pause()`, `currentTime = 0`, `seek()` —
which behaves identically on both platforms because it is the same file.

## 3 · Two candidates, and I would try them in this order

### A · Gemini TTS — because he is already paying for Gemini and nothing new is needed

`gemini-2.5-flash-preview-tts`, about **$0.30 per million input tokens and
$2.50 per million output**
([pricing](https://ai.google.dev/gemini-api/docs/pricing),
[model](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts)).

- **The key already exists.** `GEMINI_API_KEY` is set in `.env` *and*
  `.env.production` and the assistant already answers through Gemini, so this is
  one service, one bill, one key — **no new account, no new secret.**
- Multilingual, so **French and English from one voice family**, which matters
  because his corpus is largely French while the UI is English.
- Style and pacing are controllable by prompt, which the browser's voice is not.
- **His credit balance is €8.09 with auto-reload off**, so the failure mode is
  the assistant going quiet rather than a surprise bill — and at his current
  usage of €1.91 in eighteen days, read-aloud on a few answers a day is cents.

**Try this first, because "serious" and "already paid for" is a rare pair.**

### B · Kokoro-82M — if he wants zero marginal cost, which is his own rule elsewhere

Currently the best small open model: **82M parameters, Apache-2.0, runs on CPU,
faster than real time, 54 voices across 8 languages**
([overview](https://www.sevenlabs.site/blogs/best-self-hosted-tts-models-2026),
[comparison](https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models)).
By mid-2026 the open/commercial gap is reported at ~81 ELO, with open models
beating ElevenLabs in blind tests more often than not
([ranking](https://findskill.ai/blog/best-open-source-tts-2026/)).

- **Zero per-minute cost forever**, which is `CLAUDE.md` correction 6's rule for
  Karwan and a defensible one here too.
- **But it is a service to run on a box that is at 95% disk and hard-rebooted
  from exhaustion three days ago.** That is the honest objection, and it is
  about this machine rather than about the model.
- **Piper** is the fallback if Kokoro is too heavy: real-time on a Raspberry Pi,
  30+ languages including French, and the most efficient CPU option there is
  ([comparison](https://pinggy.io/blog/best_open_source_self_hosted_text_to_speech_models/)).
  Lower quality than Kokoro, far above eSpeak.

**Not ElevenLabs.** Best-in-class and a per-character bill on a path a user
touches — the exact shape correction 6 exists to forbid.

## 4 · The shape, whichever voice wins

**One endpoint, one contract, both clients.**
`POST /api/v1/ai/messages/:id/speech` → audio, with the text taken **from the
stored message rather than from the client**, so the web and the phone cannot
read different words.

- **Cache by message id.** An answer is immutable once written, so the second
  play costs nothing and a re-read is instant. **This is what makes a metered
  voice affordable** — you pay once per answer, not once per press.
- **Stream it** so the first syllable does not wait for the last, and both
  clients get `<audio>`/`expo-av` semantics: play, **pause, resume, stop,
  restart, seek** — all exact, because it is a file.
- **One speaker button per answer**, and a second press on another answer
  cancels the first — which is the rule the web hook already has and the only
  part of it worth keeping.
- **Degrade to the device voice** when the endpoint is unreachable, and **say
  which one is speaking** rather than silently sounding worse.
- **A hard cap** on characters per request, because an assistant answer can be
  long and a bill is a function of length.

## 5 · What this costs to find out

**An afternoon, and the first hour answers it:** generate the same French and
English paragraph through Gemini TTS and through Kokoro on this box, put the
four files in front of him, and let him choose by listening. **The decision is
his ear, not a benchmark** — and *"something is reading very bad"* is exactly
the kind of judgement that a table of ELO scores cannot settle.

**Nothing should be built before he has listened.**

---

**Sources:** [Gemini TTS model](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts) ·
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) ·
[self-hosted comparison](https://www.sevenlabs.site/blogs/best-self-hosted-tts-models-2026) ·
[open-source TTS in 2026](https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models) ·
[open vs commercial](https://findskill.ai/blog/best-open-source-tts-2026/) ·
[CPU-constrained options](https://pinggy.io/blog/best_open_source_self_hosted_text_to_speech_models/)
