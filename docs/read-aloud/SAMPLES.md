# Three voices — listen and pick one

**His decision, by ear.** `docs/READ_ALOUD_PROPOSAL.md` chose the mechanism;
this chooses the voice, and that is not a thing to decide from a description.

```
docs/read-aloud/samples/charon.mp3
docs/read-aloud/samples/kore.mp3
docs/read-aloud/samples/orus.mp3
```

All three are **Gemini TTS** (`gemini-2.5-flash-preview-tts`), generated through
the same key the assistant already answers on — so nothing new is being paid
for and nothing new had to be signed up to. 15–16 seconds each.

## What they are reading, and why that sentence

> *You lent Sam Lee five hundred euros on the third of March, and he has paid
> back two hundred. The remaining balance is three hundred euros, due at the
> end of this month. You also have a dentist appointment on Friday at half past
> nine.*

Not a stock paragraph. A voice has to be judged on **the kind of sentence it
will actually read** — an amount, a name, two dates and a time — because that
is where a bad voice falls over: money read as digits, a date flattened, a name
mangled. A neutral passage would have all three sounding fine.

**The name is invented.** The real examples in this product use a family name,
and an audio file *saying* somebody owes money is a different kind of artefact
from a name in a document — this repo is public.

## The three

| File | Voice | Character |
|---|---|---|
| `charon.mp3` | Charon | informative, level — closest to "reading you your own note" |
| `kore.mp3` | Kore | firm and brisk, a little more clipped |
| `orus.mp3` | Orus | warmer and slower, the most conversational of the three |

They are deliberately close together rather than one obviously odd. He asked
for *"a serious real human voice"*, so all three are in that register and the
choice is between shades of serious, not between serious and playful.

## What happens once he picks

**Nothing in either client changes.** `voice` is server-owned in the contract
agreed with `multi-magic-mobile-ae`: the phone sends a message id and no voice
name, so the default moves in one place and the web and the phone move with it.

## Why these files are not committed

`docs/read-aloud/samples/` is gitignored, for the same reason
`docs/design/**/references/` is: this repo is public and 400 KB of generated
audio is not something it needs to carry. They are on disk to be listened to.
Regenerate with the script recorded in this commit's message.
