# multi_magic_mobile

MultiMagic on a phone: a login and the AI assistant.

It has **no backend of its own** — it talks to
[`multi_magic`](https://github.com/Hama99o/multi_magic): `POST /api/v1/ai/show`
for a question, **ActionCable** for the answer (the reply is enqueued as a job,
not returned from the request), `api/v1/ai/sessions` for conversations and their
files, and the existing login. Every token is bound to a device fingerprint, so
the app carries one and never clears it on sign-out.

Dictation uses the **phone's own** recogniser — iOS Speech, Android
`SpeechRecognizer` — because the web assistant uses the browser's own: no
server, no key, nothing metered.

## Where the thinking is written down

| | |
|---|---|
| [`BRIEF.md`](BRIEF.md) | what this is, what it talks to, what is deliberately **not** in it, and the endpoint-by-endpoint findings behind each decision |
| [`docs/design/README.md`](docs/design/README.md) | the board — every screen, 0 → 100, with status |
| [`docs/design/IDENTITY.md`](docs/design/IDENTITY.md) | the palette, read off the app's own icon; two typefaces, and why the assistant's answers are set in a serif |
| `docs/design/<screen>/SPEC.md` | per screen: the references, **what we took and what we rejected**, our own decisions, and how it is coded |

**No design here comes out of anyone's head.** Each screen is checked against
apps that ship, and the SPEC records which ones — Hamma9900's standing rule.
The reference *images* are not committed (see `.gitignore`); each SPEC cites its
sources by permanent link instead.

## Stack

Expo 54 · React Native 0.81 · expo-router 6 · NativeWind 4 · Zustand 5 ·
TanStack Query 5 · Jest + React Native Testing Library. Same as
[`karwan-mobile`](https://github.com/Hama99o/karwan-mobile), minus the
three-role theming, the map, and the RTL-first default: this app is English,
LTR, light and dark.
