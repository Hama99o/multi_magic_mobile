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
