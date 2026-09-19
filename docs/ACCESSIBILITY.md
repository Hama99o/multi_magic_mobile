# Accessibility — what was measured, what was fixed, and what only a device can settle

First pass over this app, 2026-09-19. Before it, **nothing in this repo had
ever read the accessibility tree.** `keys.test.ts` resolves the keys the app
asks for; `locales.test.ts` compares the two locales to each other;
`screens.render.test.tsx` reads `testID`s and visible text — and a label, a
hint, a role and a state are none of those. The one gate that touches
accessibility at all is the `no-restricted-syntax` rule added with `49a0a7a`,
and it catches exactly one class: a bare worded literal in `accessibilityLabel`
or `accessibilityHint`, i.e. a name that exists and was never translated.

So this is not a re-check of known ground. Every question below is being asked
here for the first time, which is also why the findings are unevenly
distributed: the things somebody thought about are good, and the things nobody
thought about were never thought about at all.

**The method, and it is the reason anything was found.** Every existing check
in this repo asks *"is what we call defined?"* — `docs/TESTING.md` §8, the dead
`calendar.event` key. This pass asks the other direction: **what does the screen
draw that nothing names?** That question returns a list you can read, which is
what makes it cheap. It found four defects in an afternoon. The forward
question — *do the labels we wrote resolve?* — found none, because the labels
that were written were written carefully.

---

## The gate

`src/__tests__/a11y.test.tsx`, five assertions, running in `npm test` and
therefore in CI. Its header carries the same warning as this section and should
be read before anybody cites it.

| It asserts | It cannot see |
|---|---|
| No `Pressable` with a press handler in `app/` or `src/` is nameless — no label, no text in its subtree, and not excused by `accessible={false}` | Anything about whether the name is *right*, or whether two controls share one |
| `Button` keeps its accessible name while `busy` | — |
| `Markdown` gives every heading the `header` role | Whether heading *levels* are ordered sensibly |
| `Input` marks its error as a live region | Whether anything else that changes is announced |
| `ThinkingDots` is a live region and speaks when the wait turns slow | Whether a screen reader voices it in the order a person wants — a device question |
| The chat screen announces the answer arriving | — |
| Both speakers are named, and attributing the answer leaves its links reachable | — |

**A green here does not mean the gestures work**, and that is not a hedge. It is
this repo's §6 in its newest costume, and the instance is live: `06-people-chat`
fails on a long press that carries a correct, translated `accessibilityHint` and
a correct handler. Android's text-selection ActionMode takes the gesture — the
message body is `<Text selectable>` inside the Pressable — and `onLongPress`
never runs. Both halves are present and correct in the tree. No static check and
no render test can see it; only the OS knows what it consumed. Announced
gestures are therefore **listed** below for a device to close, not asserted.

**A green here does not mean anything is reachable.** A `Pressable` is an
accessibility element unless told otherwise — `Pressable.js:245`,
`accessible: accessible !== false` — and on iOS an accessibility element groups
its children into one. RNTL does not emulate that grouping, so a query in a test
finds nested controls that VoiceOver would never reach. See **N1**.

**Nothing here measures a pixel.** Jest has no layout engine. Touch targets
below are read out of the source and are settled on a device, not by this file.

---

> **A correction that belongs where the claim is.** Commit `67f9cc5`'s message
> says *"a test asserts the link survives the attribution."* It does not. That
> test passes whether or not the answer is wrapped in a named container — the
> naive fix was planted and it stayed green, because RNTL does not emulate
> native accessibility grouping. `docs/TESTING.md` §9 is the entry; this line is
> here so the next reader finds the correction where they find the claim.

## FIXED — unambiguous, each watched failing first

Four defects. Each test was written against the broken code and watched go red
before the fix; the static check was additionally re-verified by planting a
nameless icon-only `Pressable` in `Composer.tsx` and watching it name the line.

### F1 · A button lost its name at the moment it was doing something

`src/components/reusables/button.tsx`. The name came from the label `<Text>`
child. `busy` **replaces that Text with an `ActivityIndicator`**, so the
accessible name became empty exactly while a request was in flight. RNTL's
report was blunt: *Expected "Check and save", received ""*.

`accessibilityState={{ busy }}` was already set and does not help — it says
something is working, never *what*. Now `accessibilityLabel={label}` is written
rather than inherited, so the name cannot depend on what the component happens
to be rendering. Every submit button in the app goes through this component:
sign-in, sign-up, forgot-password, rename, delete-conversation, instructions,
scope, new conversation, ai-keys.

### F2 · A store-required document with no headings

`src/screens/account/Markdown.tsx`. Headings rendered as `<Text>` with a larger
`fontSize` and no `accessibilityRole="header"`. **A heading that is only bigger
is a heading to an eye and to nothing else** — swipe-by-heading, which is how
anybody reads a long document with a screen reader, did not work anywhere in the
app, and the privacy policy is the app's only long document and a store
requirement on both stores. `17-privacy` proves the headings survive the parse
onto a real screen; it says nothing about their being headings.

### F3 · An error that was drawn and never spoken

`src/components/reusables/input.tsx`. The error line appears *after* a press,
and nothing moves focus to it, so a screen reader user got silence where a
sighted user got a red line. It now carries
`accessibilityLiveRegion="polite"` — polite so it waits for the current
utterance instead of cutting it off. This is every validated field in the app,
including the 422 in `14-change-password` that the whole flow exists for.

### F4 · Two invisible focus stops that could have hidden a whole sheet

`PhotoSheet.tsx:109`, `ReactionSheet.tsx:94`. Each is a `Pressable` whose only
job is to stop a press reaching the scrim behind it — `onPress={() => {}}`. But
a Pressable is an accessibility element by default, so each was a nameless focus
stop wrapping the sheet's entire contents. Now `accessible={false}`, which takes
them out of the tree rather than inventing a name for something that is not a
control. This is **not** the whole of N1 below; it is the half that is
unambiguous without a device.

---

## FIXED FROM SOURCE — but not witnessed on the platform that had the defect

### N1 · The scrim wrapped the sheet, in EVERY sheet — FIXED

`AttachSheet.tsx:56`, `SourceSheet.tsx:45`, `SessionsSheet.tsx:304`,
`PhotoSheet.tsx:103`, `ReactionSheet.tsx:87`. **Five, not the two this section
first claimed.** The dismiss scrim is a `Pressable` with
`accessibilityLabel={t("common.close")}`, `flex: 1`, **and the sheet's content
as its children.**

*Three of the five were found by the static check in the gate and not by the
hand-read that wrote this entry. The first pass grepped for the press-swallowing
child; `SourceSheet` calls `e.stopPropagation()` instead, so it looked different
while being identical. A grep for one spelling of an idea finds one spelling of
an idea.* Per React Native's own documentation an
accessibility element groups its children into a single selectable component,
and on iOS that is absolute. If it behaves as documented, VoiceOver announces
one "Close" button for the entire modal and **the photo rows and the six
reaction emoji are not reachable at all.**

### Costed first, then built

It was pinned as too structural to touch without a device. Costing it changed
the decision, and Hamma9901's reasoning is worth keeping because it inverts the
obvious one: **the platform where the defect is real is the one we cannot test,
so this ships unverified either way — the only question is which unverified
state ships.** A scrim that is a sibling rather than a parent is correct under
both platforms' models, so waiting for a probe that can only speak about Android
would not have informed the choice.

It was **one shape, five times** — every scrim is
`style={{ flex: 1, backgroundColor: <translucent>, justifyContent: "flex-end" }}`
(SessionsSheet's menu uses `"center"`) with the sheet as its children. The three
variants differ only in what stops a tap inside the sheet from reaching the
scrim, and that difference disappears in the fix:

| Sheet | What swallows the inside tap today |
|---|---|
| `AttachSheet:56`, `SessionsSheet:304` | nothing — the content is a plain `View` |
| `SourceSheet:45` | an inner `Pressable` calling `e.stopPropagation()` |
| `PhotoSheet:103`, `ReactionSheet:87` | an inner `Pressable` with a no-op `onPress` (given `accessible={false}` in F4) |

**The change, identical in all five:** the scrim stops being the parent and
becomes an absolutely-positioned sibling *behind* the content.

```jsx
<View style={{ flex: 1, justifyContent: "flex-end" }}>
  <Pressable
    style={StyleSheet.absoluteFill}
    onPress={onClose}
    accessibilityRole="button"
    accessibilityLabel={t("common.close")}
  />
  <View style={sheetStyle}>{…}</View>
</View>
```

The inner press-swallowing `Pressable`s then had nothing to swallow and are
gone — including the two F4 touched, so that fix is subsumed rather than
duplicated. Applied to all five; all five were the same shape, so there was
nothing to stop at.

**One behaviour change fell out of it, and it is an improvement nobody asked
for.** In `AttachSheet` and `SessionsSheet` the content was a plain `View`
*inside* the scrim Pressable, so a tap on the sheet's own padding propagated to
the scrim and closed it. With the scrim behind the content that tap now does
nothing, which is what the other three already did by way of their swallowing
Pressable. Worth knowing before anybody reads it as a regression.

**What is proven and what is not.** The static check in the gate now finds zero
named containers holding controls, and it was re-planted — one scrim reverted to
being a parent, watched to name the line, restored. Lint, typecheck, 568 tests
and the bundle are green. **None of that is a screen reader.** The defect was
iOS-only by the reading below, and nothing here has been in front of VoiceOver.

**The `ours/` screenshots should not need retaking**, and that is the claim to
check rather than trust: the scrim covers the same area in the same colour, the
parent keeps `flex: 1` and the same `justifyContent`, and the sheet's own style
is untouched, so the rendered pixels should be identical. If they are, `DONE`
survives the change. That is a question for the picture pass, not for this file.

**Android is very likely NOT affected, and that halves the urgency.** From the
framework's own source rather than from belief:
`ReactAccessibilityDelegate.java:467`, `hasNonActionableSpeakingDescendants`
walks a view's children and **`continue`s past any child that is itself
`isAccessibilityFocusable`**. Android's model is to merge *non-actionable*
speaking descendants into their parent and leave actionable ones addressable —
so a `Pressable` row inside a labelled `Pressable` scrim should still take
TalkBack focus on its own. iOS has no such carve-out: an accessibility element
groups its children, full stop.

So the expected result is **broken on iOS, fine on Android** — and iOS is the
platform with no build, no simulator and no rig here.

**The probe still runs, and its job has changed.** It was going to decide
whether to build the fix; the fix is built, so it now confirms the rows are
reachable on the repaired build, and a pass proves the change is not harmful
rather than that it was necessary. e0 has it: attach sheet, TalkBack on, swipe
right, expect *Photo*, *Camera* and *Document* as three separate stops.

**And the reading above is a reading.** Four sessions tonight reasoned correctly
from source and were wrong about the device, which is this repo's §5 in its
plainest form. "Probably Android-safe" is sourced from a Java file and not from
a phone, and it should be repeated to anybody as exactly that until the probe
comes back.

### N2 · A correct hint pointing at an unreachable gesture

`PersonMessageRow.tsx:136` declares `accessibilityHint={t("thread.reactHint")}`
— *"Long press to react"*. The hint is present, correct, and now translated. The
gesture it describes **cannot be performed on the current Android build**: the
bubble's `<Text selectable>` starts the platform's text-selection ActionMode and
eats the long press, which is the Copy · Share · Select all in
`06-people-chat`'s failure frame.

This is the sharpest case in the audit and worth keeping after it is fixed. The
string was untranslated; then it was translated; and throughout, it described an
action that could not be performed. **The hint was never the thing that was
wrong**, and no gate at any point touched it. **Fixed by e7 in `67f698b`** — `selectable` dropped; the reaction sheet already
offers Copy, so the prop was redundant with the menu it was destroying. The
gesture itself stays unverified until `06-people-chat` re-runs on the device.

---

## BUILT — D1 and D2, taken rather than listed

These were written up as decisions and Hamma9901 ruled they are not: *"they are
the same information the screen already gives everyone else."* That is the right
test, and it is worth keeping as the line between this section and the next —
**adding the spoken half of something the screen already says is a defect fix;
deciding what the app should newly say is his.**

### D1 · Nothing announced the answer arriving, and the answer is the product

The app's entire claim is an asynchronous reply over ActionCable, and until this
pass there was **one live region in the whole app** — the field error in F3. So
a screen reader user posted a question and got silence, with no way to know the
reply had landed except to swipe the screen looking for it. The sighted half
already existed: `chat.tsx` calls `scrollToEnd` so the screen moves to where the
answer will be.

`ThinkingDots` was the sharpest case, because it was designed against exactly
this failure and could not reach the people it was designed for. Its header says
the 45-second copy change exists so that *"a socket that died silently must not
look like a model that is thinking"* — and with no live region, a screen reader
was never told the label had changed from `chat.thinking` to `chat.stillWorking`.
Someone who cannot see the dots has no other way to tell those two apart.

Built: the indicator is a polite live region and speaks `chat.slow` when the
wait turns slow, and `chat.tsx` announces `chat.answerArrived` when
`awaitingReply` falls. **The arrival is announced, not the answer body** — an
answer here is paragraphs about somebody's notes and money, and speaking it
unbidden would talk over whatever they were doing and take the reading out of
their hands.

### D2 · Who is speaking was carried entirely by shape

`MessageRow`'s header is explicit: **"authorship is legible by shape before
anybody reads a word"** — the user's words in a bubble on the right, the
assistant's answer unbubbled in a serif. It is a good decision and a *sighted*
one. There was no role, label or prefix distinguishing them, so a screen reader
read question and answer as one undifferentiated run of text. For an app whose
answers are drawn from somebody's own money and contacts, "who said this" is not
decoration.

Built, and **nothing anybody looks at changed**: the question's `<Text>` carries
`chat.youAsked`, and the answer's speaker goes on the first text block of
`AnswerMarkdown`.

**The way it is attached is the interesting part, and it is this audit's own N1
nearly reintroduced by its own fix.** The obvious implementation — wrap the
answer in an element carrying the name — would have made the element group its
children, and `AnswerMarkdown` renders `accessibilityRole="link"` pressables
inside answers (the assistant puts a file's download link *in* the answer). That
would have made every link in every answer unreachable. So the name goes on one
text block, never the container, and it skips a block containing a link, because
a label REPLACES what is read and would bury the link inside a sentence.

**And the test written to guard that cannot actually catch it — measured, not
assumed.** `announce.test.tsx` asserts a link inside an answer is still reachable
after attribution; the naive container fix was planted and it stayed green,
because RNTL does not emulate native grouping. The static check that replaced it
catches a name on a container that LEXICALLY holds a control (planted in
`Composer.tsx`, watched to fire) and is blind to `AnswerMarkdown`'s own shape,
which builds its children into an array. So this one is held by discipline —
name a leaf, never a container — and `docs/TESTING.md` §9 is the entry.

---

## DESIGN DECISIONS — his call, not mine

### D3 · A destructive long press announced under a hint about something else — FIXED in `2d7e6aa`

`app/notifications.tsx:293` — long-pressing a notification row calls
`confirmRemove`. `NotificationRow.tsx:58` carries
`accessibilityHint={t("notifications.hint")}`, which reads *"Opens the assistant
with a question about this"*. That describes the **tap**. So the only announced
affordance is the non-destructive one, and the destructive one is announced
nowhere — a screen reader user is not merely uninformed about the long press,
they have been told the row does something else.

**Settled as a defect rather than a decision, and fixed by e7 in `2d7e6aa`:**
`notifications.hint` now names both actions — *"Opens the assistant with a
question about this. Long press to delete it."* The line between this and the
rest of the section is worth keeping: a hint that describes the *wrong* action
is wrong whatever convention the app later adopts, so it did not need the
decision. What the convention should be still does.

**The convention question is now one document, not three findings.**
`docs/DICTATION_LANGUAGE.md` §4 draws all three long presses side by side with
their costs and a recommendation — reaction on a message, delete on a
notification, switch language on the mic — and it closes on the point that
matters most: whichever convention is chosen, the answer should record which
gestures it still cannot reach. Anything reachable only by a long press cannot
reach somebody with a tremor, somebody on switch control, or a screen reader
whose own gesture set has claimed the hold — and cannot reach a platform that
takes the gesture first, which is not hypothetical: Android's text selection ate
the reaction entirely until `67f698b`, while the handler, the sheet and the hint
were all correct. Read that rather than this.

### D4 · The mic announces a language the screen never prints

`Composer.tsx:205`. A long press on the mic switches dictation language and
remembers it. It has **no hint, no label for the gesture, no glyph and no
mention on screen** — undiscoverable for everybody, not only for screen reader
users. Meanwhile the mic's `accessibilityLabel` is
`t("composer.dictateIn", { language })` → *"Dictate in Français"*, so **TalkBack
is told the listening language while the screen prints it nowhere.**

That inversion is an accident of one label written well, and it is the only
place in the app where the accessibility tree carries information the screen
does not. Written up as a proposal in `docs/DICTATION_LANGUAGE.md` and
**deliberately unbuilt — the owner decides.** Audited here, not fixed, on e7's
note and that document's own instruction.

---

## Touch targets

`tokens.ts:77` sets `touch: 48`, and `button.tsx`'s header calls it *"the
touch-target floor"*. It is honoured by every control built through `Button`,
`Input` and the row components, and it is not a rule anything enforces, so the
icon-only controls drifted. Effective size is the box plus `hitSlop` on each
side; measured from source, so treat these as candidates for a device rather
than as verdicts.

**The three destructive ones first, because they are the ones that matter and
they are also among the four smallest — which is the wrong way round.**

| Control | Box | hitSlop | Effective | |
|---|---|---|---|---|
| `ai-key-remove` (`ai-keys.tsx:231`) | icon 13 | 8 | **29** | **removes a provider key** |
| `pending-file-remove` (`PendingFiles.tsx:80`) | icon 16 | 8 | **32** | **removes a queued file** |
| `answer-undo` (`AnswerActions.tsx:117`) | icon 15 | 10 | **35** | **undoes what an answer created** |
| `msg-retry` (`PersonMessageRow.tsx:254`) | `minHeight: 32` | none | **32 high** | e7's file — reported, not touched |
| `Freshness.tsx:47` | icon 18 | 6 | **30** | |
| `composer-dictation-cancel` (`Composer.tsx:86`) | icon 16 | 8 | **32** | cancels dictation |
| header icons (`chat.tsx:72`) | icon 21 | 6 | **33** | the app's main navigation |
| reveal (`change-password.tsx:88`) | icon 18 | 8 | **34** | |
| `session-menu` (`SessionRow.tsx:98`) | icon 20 | 8 | **36** | |
| `answer-*` (`AnswerActions.tsx:87`) | icon 17 | 10 | **37** | copy / read aloud |
| `file-preview-close`, `sessions-close` | icon 22 | 10 | **42** | |
| reveal (`input.tsx:84`) | icon 20 | 12 | **44** | closest to the floor |

Nothing here is fixed, deliberately: `hitSlop` is cheap to raise and every one
of these sits inside a laid-out row, so **whether raising it makes two adjacent
targets overlap is a layout question and Jest has no layout.** The pattern is
worth a decision rather than twelve separate patches — raising the floor inside
the icon-button pattern itself would fix them together.

---

## Not accessibility, found by the same walk — three untranslated strings

The backward walk over visible `<Text>` literals found three worded English
strings that never reach i18next, all in people-chat, all committed:

- `DayDivider.tsx:74` — `"UNREAD"`
- `PersonMessageRow.tsx:99` — `"This message was deleted"`
- `PersonMessageRow.tsx:267` — `"Not sent. Tap to retry."`

The third is also an accessibility finding: `msg-retry` has
`accessibilityRole="button"` and no label, so that literal **is** its accessible
name — a French screen reader reads it in English, which is precisely the defect
`49a0a7a` was written to end.

**`49a0a7a` is the commit that last touched `PersonMessageRow.tsx`.** It fixed
the two accessibility literals in this file and these survived it, two lines
away, because the eslint rule guards `accessibilityLabel` and
`accessibilityHint` and a `<Text>` child is neither. Reported to e7, who owns
i18n and that file; not fixed here. The scan that finds them is ten lines and
would make a fourth gate whenever somebody wants the three keys written.

---

## What has still never been checked

Named so that nobody reads this document for more than it did.

- **Focus order.** Not examined. It is a device question — the order TalkBack
  and VoiceOver walk a screen in is a function of the native view hierarchy, and
  nothing in Jest exposes it.
- **Contrast.** No colour was measured. `IDENTITY.md` chose the palette and
  `docs/TESTING.md` is explicit that no test here can tell you a colour is
  legible.
- **Dynamic type / font scaling.** No screen was rendered at a large system font
  size. Given `screens.render.test.tsx` already walks three widths × two schemes
  × two languages, a font-scale dimension is the cheapest thing on this list to
  add — and the French strings that were shortened to fit 360 dp
  (`docs/LANGUAGES.md`) say what it would probably find.
- **Whether any of the names are good.** The gate proves a name exists. Twelve
  controls share `t("common.close")`; whether "Close" is the right thing to hear
  on each is a judgement no assertion makes.
- **The people thread and the notification list with real content.** Both were
  audited from source. `07` and `08` reached only empty states because the QA
  account has no notifications and no events, so the rows this audit discusses
  have never been on a screen anybody looked at.
