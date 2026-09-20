# The conversation-session system: mobile against web

Hamma9900, twice: *make sure the mobile app has the whole conversation-session
system the web has, and that it is well tested.*

Read both codebases rather than a feature list. Every row below says which of
the three states it is in — **mobile has it**, **mobile deliberately differs**,
or **mobile simply never got it** — because collapsing those three is how a
gap becomes invisible.

Evidence is a file and a line on both sides. Where I did not measure something
I say so instead of implying it.

---

## The short version

**One real gap, and it is one line.** Mobile never calls
`POST /ai/sessions/:id/activate`, so **switching chats on the phone does not
tell the server**, and the laptop keeps opening the old one until somebody
asks a question. Everything else in the API surface is at parity.

**One thing mobile does not do that the web does, which is a decision rather
than a line**: the web confirms a save; mobile is silent.

**One thing mobile does that the web does not**, and the web should copy it.

---

## The API surface

| Operation | Backend | Web | Mobile | State |
|---|---|---|---|---|
| list | `sessions#index` | `aiSessionsApi.list` | `sessionsApi.list` | **has it** |
| create | `sessions#create` | `.create` | `.create` | **has it** |
| update — title, instructions, apps | `sessions#update` | `.update` | `.rename` + `.update` | **has it** |
| clear | `sessions#clear` | `.clear` | `.clear` | **has it** |
| destroy | `sessions#destroy` | `.remove` | `.destroy` | **has it** |
| documents (nested) | `documents#…` | — | `documentsApi` | **has it** |
| **activate** | `sessions#activate` → `Ai::Sessions.remember` | `AiChat.tsx:119` | **nothing** | **never got it** |

---

## The one that matters: which chat opens next

This took three passes to get right, and two of my intermediate answers were
wrong for the same reason — a `grep` scoped to the wrong directory. Both are
recorded because the method matters more than the conclusion.

**How the web does it** (`components/ai/AiChat.tsx`), and it is two halves:

```
selectSession(id):
  localStorage.setItem(`mm:aiSession:v1:<userId>`, id)   // this browser, instantly
  aiSessionsApi.activate(id)                             // every other device
```

Its own comment says exactly that: *"localStorage opens the right chat
instantly in this browser; the server is what makes the same chat open on the
phone."*

**How mobile does it** (`app/chat.tsx` → `src/lib/rememberedSession.ts`):

```
chooseSession(id):
  setChosenId(id)
  rememberSession(userId, id)                            // this device
  // …and nothing else
```

**Mobile copied the local half and not the server half**, and `mm:aiSession:v1:<userId>`
is byte-identical on both sides, so the parity that was achieved is real. What
is missing is the sentence after it.

`rememberedSession.ts`'s header describes the web's local key accurately and
**never mentions that the web also tells the server** — so the file reads as
though parity was reached. It is the second half of that mechanism that was
not copied, and the comment is why nobody noticed.

### What it costs, concretely

`Ai::Sessions.current(user)` is `remembered(user) || list(user).first ||
create(user)`, and `remembered` reads `user.data['ai_session_id']`. Only two
things write it: `activate`, and `ai#show` — **asking a question**.

So today:

- Switch chats on the phone, ask nothing, open the laptop → **the laptop
  opens the chat you left**, not the one you moved to.
- Ask a question on the phone → the server catches up, because `show`
  remembers.
- Switch on the laptop → the server is told immediately.

The promise in the route's own comment — *"which chat to open next time, on
any device"* — is kept by the web and half-kept by mobile.

---

## The web's five panels, and what mobile calls them

Asked specifically, because two of them were only visible in the audit as
*indicators* rather than as the panels behind them — which is exactly how a
gap hides. `AiSessionBar` declares `sessions · menu · rename · instructions ·
apps`. **Mobile has all five**, under different names and in a sheet rather
than a bar:

| Web panel | Mobile | State |
|---|---|---|
| `sessions` | `SessionsSheet`'s list | **has it** |
| `menu` | the row menu — `session-menu-*` | **has it** |
| `rename` | `RenameDialog` | **has it** |
| `instructions` | `InstructionsDialog` | **has it** |
| `apps` | **`ScopeDialog`** — the same family, a different word | **has it** |

**Both "clear it" semantics match, and they are the part worth checking**,
because a setting you can set and cannot unset is a worse bug than one you
cannot set at all. The web's API comment is *"Send `instructions: ''` to clear
them, `apps: []` to search everything."*

- `InstructionsDialog` calls `onSave(text)` with **no guard on empty**, so an
  empty field saves `""` and clears the standing prompt.
- `ScopeDialog` saves `selected`, and `scope-all` empties the selection, so
  saving with nothing chosen sends `[]` — all apps. `ScopeDialog.test.tsx`
  asserts that explicitly: *"saves an EMPTY list when nothing is chosen — all
  apps, not no apps."*

So a chat on the phone can be steered exactly as far as the same chat on the
web: a standing prompt that shapes every answer, set and cleared, and a scope
that narrows which apps it reaches, narrowed and widened.

**Tested**: `ScopeDialog.test.tsx` (11), `SessionOptionsDialogs` via
`sheets.insets.test.tsx`, and `19-session-options.yaml` end to end — which is
**UNRUN by me and was run by the device session**, and its run corrected one
of my assertions: I had asserted `scope-all` visible in the default state, and
it renders only once something is narrowed, because a control that would be a
no-op is absent rather than inert.

## Behaviour, not endpoints

| What | Web | Mobile | State |
|---|---|---|---|
| Untitled chat's label | `current?.title ?? t('ai.newChat')` | server's `DEFAULT_TITLE` renders as the row title | **has it** |
| Instructions set → an indicator on the bar | pencil, `ai.instructionsActive` | pen glyph on the row | **has it** |
| Scope narrowed → an indicator | funnel, `ai.searchScoped` | funnel on the row | **has it** |
| Clear — no heavy confirm | fires straight from the menu | same, and the SPEC argues why | **has it** |
| Delete — confirm naming the chat | `ai.deleteChatConfirm` with the title | confirm **plus** *"Your notes, contacts, loans and money are not touched."* | **deliberately differs — mobile does more** |

**↑ The one row where the web has something to learn.** An audit that only
asks "what is mobile missing" is a checklist; a comparison runs both ways.
Mobile's delete confirm names what is **not** deleted, and that is the
sentence that makes the action safe to read: *the* fear when deleting a
conversation with an assistant that can see your loans and contacts is that
the records go with it. The web says only which chat. **This should go the
other way.**
| **Save confirmed to the person** | toasts: instructions saved, scope saved, chat cleared | **nothing** — the dialog closes and that is all | **never got it** |
| Failure shown | `toast.error(ai.sessionFailed)` | inline `sessions-error` in the sheet | **deliberately differs** |

### On the missing confirmations

The dialog closing is *some* feedback, and clearing a transcript is
self-evident because the messages go. Saving standing instructions is the one
where silence is genuinely ambiguous — nothing on screen changes, and the only
way to know it took is to reopen the dialog, which is exactly what
`19-session-options` had to do to test it.

**It is not a one-line fix**: mobile has no toast system at all, so this is
new infrastructure or a different pattern, and which one is a design question.
Reported rather than built.

---

## What I did not measure

- ~~**The web's own tests.**~~ **Measured 2026-09-20, and it changes what this
  document is for.**

  `find app/javascript -iname "*.test.*" -o -iname "*.spec.*"` → **zero
  files.** The web's session client — `selectSession`, the localStorage key,
  the `activate` call, all five panels — has **no automated test of any
  kind**.

  The backend does. `spec/services/ai/sessions_current_spec.rb` covers
  `Ai::Sessions.current`, and its first example is named *"opens the chat the
  user chose, not the one last talked in"* — **the exact promise mobile was
  breaking**, written as an expectation a year before anybody looked at the
  phone. The `activate` endpoint itself has no request spec
  (`sessions_controller_spec.rb` never mentions it), so the service is
  covered and the door to it is not.

  **So "mobile should match the web" is a comparison against an untested
  reference.** Mobile is the tested client — 709 tests against zero. Where
  the two differ, mobile's version is the one with something behind it, and
  the row below where the web should copy mobile is not a courtesy.

  It also means this audit could only ever be a reading of the web's source.
  There was no suite to run and no failure to observe, which is worth knowing
  before anybody treats a line here as verified behaviour rather than as read
  code.
- **Live cross-device behaviour — half measured, 2026-09-20.**
  `qa/verify_activate.sh` was run on the device: `ai_session_id` went **269 →
  263** after switching by title on the phone with no question asked, landing
  on *that conversation's* id rather than merely changing. **Mobile's half is
  proved** — the write happens, which is precisely what was missing.

  The other half is not, and is not mobile's: whether a laptop then opens
  that chat is the web's behaviour, and the web has no tests at all (below).
  Nobody has switched on a phone and watched a browser. That would need two
  clients on one account, and the account would be his.
- **The floating assistant window** (`AiAssistantWindow`) shares `AiChat`, so I
  treated it as the same behaviour rather than checking it separately.

---

# Appendix: what testing the web's session client would take

**A proposal for `multi_magic`, not a change to it.** Nothing in his web app
has been touched. The instruction was to check what a test there would run on
before writing one, and the honest answer is that **there is no runner** — so
this is a decision about his web app rather than a gap to fill, and it is
written down so the decision is cheap rather than started so it is a fait
accompli.

## What exists today

| | |
|---|---|
| Test runner | **none.** No `test` script; no vitest, jest, mocha or karma |
| Component testing | **none.** No `@testing-library/*` of any kind |
| E2E | **none.** `eslint-plugin-cypress` is a lint plugin; Cypress itself is absent |
| `jsdom ^20.0.3` | **present in devDependencies and imported by nothing** — an orphan, and the only sign anybody ever started this |
| CI's frontend job | `npm run type-check` then `npm run lint`. Two steps, no third |

## It is smaller than "a whole test stack", and the reason is Vite

The expensive part of standing up a frontend runner is teaching it the app's
module resolution. **That already exists**: `vite.config.mts` defines the `@ →
app/javascript` alias, the React plugin, and Tailwind. **Vitest reads that
same config**, so the resolver, the alias and the JSX transform come for free.

So the real cost is:

1. **Two devDependencies** — `vitest` and `@testing-library/react`. Plus
   `@testing-library/jest-dom` for readable matchers if wanted. **`jsdom` is
   already installed.**
2. **A `test` block in `vite.config.mts`** — `environment: 'jsdom'`, one
   setup file. Roughly six lines.
3. **A `"test": "vitest run"` script.**
4. **One step in CI's existing Frontend job**, after ESLint.

**The one risk worth naming rather than discovering**: `vite-plugin-ruby` is
in that plugin list and is a Rails integration. It reads `config/vite.json`,
which is present, so it should load outside a Rails boot — but *should* is
doing work in that sentence and it has not been run. If it misbehaves under
vitest the answer is a `vitest.config.mts` that imports the shared `resolve`
block and omits the Ruby plugin, which is another six lines. **Nobody has
tried it.**

## The tests I would write first, and what each would have caught

In order of what the audit says is at risk. Every one is about the session
client, because that is the untested reference the phone was measured against.

1. **`selectSession` does BOTH halves.** Writes
   `mm:aiSession:v1:<userId>` *and* calls `activate(id)`. This is the exact
   defect mobile shipped for a week, and the web's version is protected by
   nothing but the fact that somebody wrote it correctly once.
2. **A failing `activate` does not break the switch.** The code is
   `.catch(() => undefined)`; nothing asserts that is deliberate, and
   "swallowed on purpose" and "swallowed by accident" look identical.
3. **The launch choice prefers the local key over the server's answer**, and
   falls back to `aiConv.id` when there is none — the `?? aiConv.id` in that
   effect is the whole cross-device story and is untested.
4. **The key is per user.** A second user must not open the first one's chat.
   Mobile's own header calls this out; the web has the same shape and no test.
5. **Empty instructions clear the prompt; an empty app list means all apps.**
   Mobile asserts both in words — *"saves an EMPTY list when nothing is
   chosen — all apps, not no apps"* — and the web, which is where those
   semantics are documented, asserts neither.
6. **Delete confirms and names the chat**; clear does not confirm. The
   asymmetry is deliberate on both sides and written down on neither.

Six tests, and **five of them are about behaviour mobile already has tests
for.** That is the finding restated: the phone is the tested client, and the
reference it was measured against is guarded by review alone.

## What I did not do, and why

Installing packages and editing `package.json`, `package-lock.json`,
`vite.config.mts` and CI in a repo whose pipeline **has a Kamal deploy job**,
on the night deploy work is in flight, is not a change to make unasked. It is
four files, one of which CI runs and one of which ships.

His call. If it is yes, the six above are a couple of hours with a planted
break each, and the stack is genuinely four files.
