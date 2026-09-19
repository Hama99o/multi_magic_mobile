# What nothing walks — the backward walk over handles

2026-09-19. `node qa/unwalked.mjs`.

Every gate here asks whether the handles a flow **reaches for** exist:
`flow_lint.py`'s TESTID rule resolves each `id:` against the source, and a flow
naming a handle that is gone fails. Nothing asked the other question — **which
handles does nothing reach for?** — and by `docs/TESTING.md` §8 that answer is a
list you can read, because a handle is written when somebody expected a test or
a flow to need it. A handle nothing names is the receipt for a screen nobody
walked.

**176 handles are defined in `app/` and `src/`. 38 of them — 22% — were named by
no flow and no test when this was written.** §1 and the two worst of §2 have
since been closed and the count reads **24**. The list below is as found, with
what closed each one.

A hit is a question, not a verdict. A control can be reached by its label or its
text, and this repo *prefers* that: the register is explicit that a conversation
row is addressed by its "Options for …" label rather than by its database-id
handle. So every entry below was read rather than counted, and they sort into
three very different piles.

---

## 1 · The one that should not wait

### `answer-undo` — a destructive control on his real data, rendered by nothing — CLOSED

`AnswerActions.tsx:135`. The button calls `undoApi.undo` → **`POST
/api/v1/ai/undos`**, which in `src/api/ai.ts`'s own words takes back *"what an
assistant reply wrote"*. The assistant writes notes, contacts, expenses and
events into the live MultiMagic database, so this control **deletes real records
of his**.

- **No test mounts `AnswerActions`.** Not one.
- **No flow reaches it.** `01-ask` stops at the answer arriving.
- The two fixtures that construct a message both set **`undoable: false`**
  (`app/__tests__/chat.test.tsx:35`,
  `src/components/__tests__/sheets.insets.test.tsx:47`), so `showUndo` is never
  true and the control does not render even incidentally in the screen tests
  that mount the whole chat.

So every path to it is closed at once, and the closure is invisible: the chat
screen renders, its tests pass, and the branch holding the destructive control
is simply never entered. Its siblings `answer-undone`, `answer-undo-error` and
`answer-copied` are unreached for the same reason — the whole row is.

It is also **35 dp** against the 48 floor (see the audit's touch-target list),
which is the second thing to know about a control that deletes records.

**Closed by `src/components/chat/__tests__/AnswerActions.test.tsx`** — five
assertions: the control renders when the reply is undoable and not otherwise; it
carries a name that says what it undoes rather than bare "Undo"; it calls the
endpoint **once** with the right id, because a double fire here is a second
DELETE against his records; the server refusing is said on screen rather than
swallowed; and an already-undone reply shows as taken back instead of offering
the button twice.

All five passed on the first run, so three breaks were planted to prove they
can fail — the name removed, the handler made to fire twice, the error
swallowed. Exactly those three went red and the two that should not care stayed
green.

**Still no flow, deliberately.** Exercising this for real would delete something
of his, and `RIG_CONTRACT.md` §3 is why that is not a test.

---

## 2 · Features with an entry point and no coverage at all

Each of these has a handle on the door and handles on everything behind it, and
nothing opens the door. The register already says `04` and `15` do not cover
them; this is the same fact arrived at from the code, and it adds that **the
unit layer does not cover them either.**

| Feature | Handles nothing names | Mounted in a test? |
|---|---|---|
| ~~**"Search in" — conversation scoping**~~ | ~~`scope-*`, `scope-save`, `scope-all`, `scope-cancel`~~ | **CLOSED** — `ScopeDialog.test.tsx` |
| ~~**Pending file chips**~~ | ~~`pending-files`, `pending-file-*`, `pending-file-remove-*`, `pending-files-more`~~ | **CLOSED** — `PendingFiles.test.tsx` |
| **"How to answer" — per-conversation instructions** | `session-menu-instructions`, `instructions-input`, `instructions-save`, `instructions-cancel` | `InstructionsDialog`: yes, but nothing reaches these |
| **The file preview sheet** | `file-preview-open`, `file-preview-close`, `file-preview-image` | `FilePreview`: mounted, these unreached |
| **Read-aloud controls** | `answer-read-controls` | behind `READ_ALOUD_ENABLED`, renders nothing yet |

`scope-*` and `pending-file-*` were the two where **no test mounted the
component at all**, which put them in `answer-undo`'s position minus the
consequence. Both are closed, and each was closed against the claim its own
header makes rather than against its handles:

- **`ScopeDialog`** — nothing selected means search **everywhere**, not search
  nothing. An empty array goes to the server as the scope, and the only thing
  between "all apps" and "no apps" in a person's head is one sentence. Ten
  assertions; planting an inverted hint, a one-way toggle and a missing reset
  turned five of them red.
- **`PendingFiles`** — a failed upload **stays on screen as failed**, because a
  chip that vanishes is indistinguishable from one that uploaded, and the next
  thing a person does is ask about a document the assistant never received. Nine
  assertions; planting a vanishing failure, a strip that never collapses and a
  remove that discards the first file turned four of them red.

The row badges `session-scoped-*` and `session-instructed-*` are unreached too,
which is the same gap seen from the list: nothing asserts that a conversation
which HAS a scope or instructions shows it.

---

## 3 · Error and edge states nobody has ever rendered

`ai-keys-error`, `attach-error`, `profile-error`, `answer-undo-error`,
`composer-mic-problem`, `ai-keys-borrowed`, `thread-typing`, `unread-divider`,
`msg-retry`, `thinking-slow`, `source-sheet-open`, `source-sheet-close`,
`rename-cancel`, `ai-key-use-*`, `message-action-*`.

These are the states a person meets on a bad day, and they are the ones a
screenshot pass never reaches either, because reaching them means making
something fail.

**`thinking-slow` is closed.** It was the 45-second copy change
`docs/ACCESSIBILITY.md` D1 is about — the line that exists so a socket which
died silently does not look like a model that is thinking — and nothing had ever
rendered it. `announce.test.tsx` now advances the clock and asserts both halves:
the line appears on screen, and the indicator's own accessible name changes with
it. **A safeguard nobody has seen is the same shape as a control nobody has
entered**: not wrong, but nothing would tell us if it were.

Writing it turned up a leak worth recording. The new test called
`announceForAccessibility`, and its neighbour asserted that nothing had called
it — `restoreAllMocks` in an `afterEach` does not save you, because RNTL
registers its cleanup before any test body and Jest runs `afterEach` in reverse,
so the unmount lands after this file's restore. Clearing at the START of each
test is the only ordering that cannot be got wrong. Same trap as `gcTime` in
`src/__tests__/queryClient.ts`, one layer up.

`msg-retry` and `unread-divider` arrived tonight with e7's i18n fixes, so they
are new rather than neglected.

---

## What this does not say

- **Not that these features are broken.** Nothing here was run. It says nobody
  has looked, which is a different and cheaper claim.
- **Not that every handle needs a test.** A handle exists to be addressable; some
  will be addressed by a flow that has not been written yet, and the register
  already names several as deliberate gaps.
- **Not a complete map of untested surface.** It only sees what carries a
  `testID`. A screen with no handles at all is invisible to this walk, and so is
  anything reached by a variable — `testID={row.testID}` resolves to whatever
  the table holds.
