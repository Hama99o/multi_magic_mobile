# The mic already switches language, and nobody can see it

**Two decisions, both yours, neither built.** Ten minutes to read. The drawings
below are drawings — nothing here has been on a device, nothing has been
measured, and no pixel in this file is a promise.

---

## 1 · Look at this before reading the argument

The dictation language and the interface language are two settings on purpose:
the default install listens in **French** (`fr-FR`) while the interface starts
in **English**, because that is how you use it. That part is right.

This is the composer today, mid-dictation:

```
   ●  Listening…                                        ✕
  ┌────────────────────────────────────────────────────────┐
  │  remind me to call the bank                     ⏹   ➤  │
  └────────────────────────────────────────────────────────┘
```

Three things are true at once and you cannot see any of them:

1. **It is listening in French.** Nothing on this screen says so. The only way
   to find out is to speak and read back what it got wrong.
2. **You can already change it.** A **long press on the mic** switches the
   language and remembers it between sessions. It has shipped, it works, and it
   has no label, no hint, no glyph and no mention anywhere in the app. Nothing
   else in MultiMagic uses long press to change a setting.
3. **A screen reader is told more than you are.** The mic's spoken label is
   *"Dictate in Français"*, so TalkBack and VoiceOver announce the listening
   language every time the mic is focused. The screen never prints it.

Point 3 is the one worth a second. It is not that a blind user gets the whole
feature and you get none — **nobody is told about the long press**, including
them: the app announces long presses elsewhere (a message row says *"Long press
to react"*) and the mic says nothing. What the screen reader gets is the
*language*; what you get is silence. That inversion is an accident of one
`accessibilityLabel` written well, and it is the cheapest possible evidence
that the information belongs on screen.

---

## 2 · Where the switch should live — three shapes

Every shape below assumes the one-line change is made anyway: when the mic
opens, the line says which language it is listening in. These differ only on
where the **control** goes.

### A · A tag beside the mic, always visible

```
  ┌────────────────────────────────────────────────────────┐
  │  ask me anything                        ✕   FR  🎤  ➤  │
  └────────────────────────────────────────────────────────┘
         visible before you speak · tap FR to switch
```

- **Costs**: horizontal space in the only row that has none. Four controls plus
  a field at 360 dp, and a tap target below 44 dp is not a tap target, so this
  is really "make the field narrower."
- **Makes discoverable**: the language *and* the control, permanently, before
  you commit to speaking.
- **Breaks**: `FR` is an abbreviation, and nothing else in this app abbreviates
  anything. It also puts a setting in the composer forever to answer a question
  you have once.

### B · The listening line carries it

```
   ●  Listening in French…                              ✕
  ┌────────────────────────────────────────────────────────┐
  │                                                 ⏹   ➤  │
  └────────────────────────────────────────────────────────┘
        appears the instant the mic opens · tap "French"
        to switch and start listening again
```

- **Costs**: nothing new on screen. The row already exists, already appears at
  exactly the right moment, and already has a control on its right.
- **Makes discoverable**: the language, at the moment it matters; and the
  control, because the label *is* the control.
- **Breaks**: it only exists while the mic is open, so you cannot set it in
  advance. And tapping it must **restart** the recogniser — today's switch only
  takes effect next time, which would make a tappable word a lie.

  That restart is not really a cost. The only reason to tap is that you are
  watching it hear the wrong language, and the words it has heard are wrong
  anyway. Losing them is the correct outcome, not a side effect.

### C · A row in settings, under the interface language

```
  Language            English   Français
  Dictation           English   Français
```

- **Costs**: two taps away from the moment of use, and one more row on a screen
  that just got one.
- **Makes discoverable**: that the two settings *exist and are different* —
  structurally, by sitting next to each other, instead of by a sentence
  explaining it.
- **Breaks**: nothing. It is the conventional answer and it is the one place
  you would go looking after you had already been surprised once.

### What I would do

**B, and C is not an alternative to it.** B answers "it is listening in the
wrong language *right now*"; C answers "which language does this thing listen
in, and where do I change it" — a different question asked at a different time,
and the pairing of the two rows says the thing the sentence would otherwise have
to explain. Neither needs the other to ship.

**A is the one I would not do.** It is the most visible and it pays for that in
the worst currency available — width in the composer — to keep a two-letter
abbreviation on screen permanently for a setting most people set once.

And whichever you pick, the **long press should stop being silent**. Either it
gets an `accessibilityHint` and a visible partner, or it goes. A gesture that
works, persists and is known to nobody is not a feature; it is a thing that will
eventually be discovered by accident and read as a bug.

---

## 3 · What the sentence calls the language

Genuinely your call, and it is the only thing in section 2 that an
implementation cannot settle.

The language chooser writes each language **in itself** — `Français`, `English`
— which is right for a list of languages, and is what every phone does. The
question is whether a *sentence* does the same.

| interface | listening | named in itself | named in the interface language |
|---|---|---|---|
| EN | fr-FR | Listening in Français… | **Listening in French…** |
| EN | en-US | Listening in English… | **Listening in English…** |
| FR | fr-FR | Écoute en Français… | **Écoute en français…** |
| FR | en-US | Écoute en English… | **Écoute en anglais…** |

**I would name it in the interface language** — the bold column.

A chooser is a list of things, and a thing is called by its own name. A sentence
is read by a reader, and the left-hand column hands an English reader a French
word mid-clause and a French reader an English one. *"Écoute en English…"* is
the clearest case: French wants *en anglais*, lowercase, and English refuses to
inflect, so the sentence stops being French halfway through. The sentence exists
to remove a confusion between two languages; it should not be written in both.

**What it costs**: one exonym per language per interface — four short strings —
and an accepted difference between the chooser (`Français`) and the sentence
(*French*). I do not think that is an inconsistency. They are doing different
jobs, and the phone you are holding does exactly the same thing.

---

Nothing above is built. The words in the bold column are a starting point for
yours, and the drawings are drawings.

*(Section 4 was added later the same day, when the accessibility audit found
that the mic is one of three long presses and the other two disagree with it
and with each other.)*

---

## 4 · Three long presses, three different treatments

**Added 2026-09-19 from the accessibility audit (`docs/ACCESSIBILITY.md`).
Section 1 turned out to be one third of a larger question, and the larger
question is worth settling once.**

The app has exactly three long-press gestures. Each is handled differently,
and no two agree.

| Where | What it does | What a screen reader is told | What the screen shows |
|---|---|---|---|
| A notification row | **Deletes the notification** (with a confirm) | *"Opens the assistant with a question about this"* — the **tap**, not this | nothing |
| A message bubble | Opens the reaction sheet | *"Long press to react"* — correct | nothing |
| The composer mic | Switches the dictation language | nothing about the gesture; the label names the **language** | nothing |

One gesture described right, one described as something else, one not
described at all. Read down the last column: **no long press in this app is
visible to anybody.**

### One of these is a defect, not a decision

The notification row's hint describes the tap while the long press deletes.
Whatever convention gets chosen below, *a hint that describes the wrong action
is wrong* — a person is being told a control does one thing while it does
another, and the one it actually does is the destructive one. That is worth
fixing on its own, tonight, rather than waiting on a convention.

The other two are genuinely a decision.

### The convention, three ways

**A · Every long press gets a hint, and nothing else changes.** Cheapest —
three strings, no layout. It makes the gestures discoverable to screen readers
and to nobody else, which formalises the inversion Section 1 is about rather
than fixing it. The mic keeps a setting that sighted users cannot find.

**B · Every long press gets a hint AND a visible partner.** A `⋯` on a
notification row, the reaction chips already visible under a bubble, a
language tag by the mic. Honest and expensive: three controls on three
crowded rows, and the composer has no width for its one (Section 2, shape A).

**C · No long press does anything a person cannot reach another way**, and the
hint says the other way. Deletion moves to the row's own menu; reacting keeps
the long press *and* the sheet reachable by tapping an existing chip; the mic's
language moves to the listening line (Section 2, shape B) or to settings. The
long press survives as a shortcut for people who know it, and nothing is only
reachable through it.

### What I would do

**C, with A as the floor.** A long press is the only gesture in this app with
no visible affordance at all, and the deletion case shows why that matters:
the most destructive action on the notifications screen is reachable by an
accident of holding a finger still, described to a screen reader as something
else, and drawn nowhere. Making every gesture reachable another way is the
only version that is true for people who cannot long-press at all — a tremor,
a switch control, a stylus.

A is the floor because it costs three strings and can ship tonight; it just
should not be mistaken for the answer.

**And fix the notification hint regardless**, because it is wrong under all
three.
