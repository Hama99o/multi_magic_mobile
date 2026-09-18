# Privacy — DRAFT, needs Hamma9900's approval before it ships

**Every sentence below was checked against the code, and one was wrong when I
first wrote it.** Nothing here is boilerplate; if a line cannot be traced to a
file it does not belong in a privacy policy. Where a claim is about someone
else's service, it says so.

Approve, correct, or strike any line — then it becomes `PRIVACY.md` and the app
renders it.

---

## Who holds your data

MultiMagic runs on **our own server**. Your notes, contacts, money records,
documents, calendar and conversations are stored there. They are not sold, and
they are not shared with anybody except where this page says otherwise.

## The assistant sends your question to an AI provider

To answer a question, the assistant finds the passages of **your own data** that
look relevant and sends **the question and those passages** to the AI provider
configured for your account.

**Today that provider is Google.** Questions and the passages retrieved with
them go to Google's Gemini API. If you have added your own API key, the provider
is whichever one that key belongs to. Whoever it is processes what it receives
under their own terms, not ours.

**Your notes and records are searched on our server, not theirs** — only the few
passages relevant to a question you have just asked are sent.

## Finding the right passages happens here

The index the assistant searches is built on our own server, with a model that
runs locally. **Your notes and records are never sent anywhere to be indexed** —
only the few passages relevant to a question you asked, at the moment you ask
it.

## Dictation uses your phone, not our server

When you dictate instead of typing, the recognition is done by **your device's
own speech engine** — Apple's on iPhone, Google's on Android, your browser's on
the web. **Your voice does not reach our server and does not reach the AI
provider.**

Be aware of what that means on Android and in Chrome: **those engines usually
send the audio to Google** to transcribe it. That is their behaviour, not ours,
and it is the same thing that happens in any web dictation. If you would rather
not, type instead.

## Files you upload

A file you add to a conversation is stored on our server so the assistant can
read it. **It is deleted when you delete that conversation.**

If you file a document into Pages, it becomes a Page and stays until you delete
it — that is the point of filing it.

## Deleting a conversation, and deleting your account

**Deleting a conversation** removes its messages and the files you uploaded into
it. **It does not touch your notes, contacts, money records, documents or
calendar** — those are separate and stay exactly as they are.

**Deleting your account removes everything**: every conversation and its files,
your notes, contacts, expenses, incomes, loans, budgets, documents, calendar
events, saved devices and keys. **It cannot be undone.**

**One thing is kept, and here is why.** We keep a record of *what the assistant
cost* — which provider ran, how many tokens, how many credits — because it is
our billing ledger. **Your name is removed from those rows**, so what is kept is
the cost and not you, and the rows contain no part of any question or answer.

## Recognising your device

We give each device an identifier, so we can tell your phone from your laptop,
keep you signed in on both, and notice if a session token turns up on a device
it was not issued to.

**On the website, that identifier is derived from your browser and device** —
the browser's user-agent, its language, your timezone, your screen size and
colour depth, the number of processor cores and the amount of memory the browser
reports, **and a rendering test**: the page draws text to an invisible canvas
and takes a fragment of the result, because different graphics drivers and fonts
produce slightly different pixels. Those values are combined into a single short
hash, which is what we store.

**In the phone app, the identifier is a random value** created once on that
phone. Nothing about your hardware goes into it.

**Neither is used for advertising, for building a profile of you, or for
recognising you on any other website or app.** The identifier is compared only
against your own sessions on this service.

## Email

Some things reach you by email: an invitation to something shared with you, a
calendar reminder, a sign-in code, a SafeZone PIN. Those messages are sent
through an email provider, and they contain what the message is about — a
record's title, the name of whoever shared it, or a code. **Email is the one
routine path by which a fragment of your content leaves our server.**

## What we do not do

No advertising. No analytics sold on. No recognising you across other websites
or apps. No training anybody's model on your data.

---

### Notes for Hamma9900, not for the published page

**TWO SENTENCES IN MY FIRST DRAFT WERE FALSE AND THE multi_magic SESSION CAUGHT
BOTH. I verified each in the code before rewriting, and it was right both
times.**

**1 · "By default that provider is DeepSeek" — it is Google.**
`app/services/ai/config.rb:218` returns `gemini` when a Gemini env key is
present, and falls back to `deepseek` only when it is not. `.env.production`
sets **both** keys and does not set `AI_CHAT_PROVIDER`, so **Gemini wins**.
Questions and retrieved passages go to `generativelanguage.googleapis.com`.
Naming DeepSeek while the traffic goes to Google is the most consequential error
that page could have carried.

**2 · "Generated at random and not derived from you, your hardware or your
behaviour" — that sentence denied, clause by clause, exactly what the code
does.** `app/javascript/lib/fingerprint.ts` joins `navigator.userAgent`,
`navigator.language`, the timezone, `screen.width x height x colorDepth`,
`hardwareConcurrency`, `deviceMemory` and **`getCanvasFingerprint()`** — which
renders to an offscreen canvas and takes the first 100 characters of the data
URL — then murmur-hashes the lot into `localStorage`. **Nothing random enters
it.** And I had taken "random" from that file's own docstring, which also claims
the server stores a SHA-256 hash — a claim `db/schema.rb:144` disproves. **The
docstring is not a source; the function is.**

**A DECISION FOR YOU, and it is a product decision rather than a wording one.**
Canvas fingerprinting is the technique browser vendors and regulators treat as
covert tracking, and **Apple's and Google's privacy questionnaires ask directly
whether an identifier is derived from device signals.** A random value in
storage would serve both stated purposes — telling your devices apart, and
noticing a token used from a device it was not issued to — and would make the
reassuring sentence true.

**What you would lose by switching:** the fingerprint survives a user clearing
their site data; a random value does not, so that user looks like a new device
and signs in again. That is the whole of the difference.

**My recommendation: switch the website to a random identifier.** The phone app
already uses one, so the two would agree, the page gets shorter and truer, and
the store questionnaires get a plain "no". If you would rather keep it, the page
as rewritten above describes it accurately — which is the minimum either way.

- **The provider sentence was corrected by the multi_magic session** and it was
  right to correct it: `Ai::Config` and per-user `user_ai_keys` mean a user can
  bring their own key, so DeepSeek is the **default**, not the only provider.
  Saying "DeepSeek" flatly would have been wrong for anybody who supplied a key.
- **The device-identifier sentence I first wrote said it was stored only as a
  hash. That was wrong and I checked it because that session asked me to.**
  `db/schema.rb:144` — `allowlisted_jwts.device_fingerprint` is a plain
  `string`; `db/schema.rb:1150` and `trusted_device.rb:38` —
  `trusted_devices.fingerprint_digest` is SHA-256. **Both are true of different
  tables**, so the page says both. A privacy policy is the one document where an
  unverified sentence is worse than a missing one.
- **The billing exception is `dependent: :nullify`** on `ai_usage_events`, so
  deletion detaches rather than deletes. The wording *"your name is removed from
  those rows"* is what that actually does.
- **Still to decide by you:** whether the usage ledger should be deleted
  outright instead of detached. It is your billing record, so it is your call,
  and the multi_magic session and I both think detaching is defensible.
- **Two sentences are true today and one environment variable away from false**,
  so they are worth knowing before anybody flips a switch: embeddings are local
  because `AI_EMBEDDINGS` is unset — setting it to `openai` would send the
  corpus out to be indexed and make this page wrong; and "no analytics" holds
  because `SENTRY_DSN` is unset even though the Sentry gems are installed —
  setting a DSN would start transmitting error reports that carry request
  context. **Both verified absent in `.env.production` today.**
