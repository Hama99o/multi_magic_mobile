# Notes in Google Keep's style (owner, 2026-11-13)

> "we have almost all the similarity with Google Keep, so we do this"

**References:** the owner's Keep screenshots, 2026-11-13: grid, note,
keyboard-up, ⋮ menu, drawer. They are **not stored**: the owner's content
is private, and the screens stay his. Only their layout is described here.
Mobbin has no Google Keep (searched 2026-11-12 and 2026-11-13). Its Google
app has a [masonry grid](https://mobbin.com/screens/73060219-b806-440e-ad36-210528b0d363)
and a ["2 selected" bar](https://mobbin.com/screens/052f6c7e-9a47-4f47-b4c4-ad72db510348),
used for structure only.

## What the server already stores (reused, nothing invented)

| Keep | MultiMagic (multi_magic) |
|---|---|
| Colour | `data.color`, ten keys (`tag.rb` enum); the serializer falls back to a label's colour |
| Pin | `pinned` |
| Labels | note tags (colour, CRUD at `/note_app/tags`, `toggle_tag`, `create_and_assign_tag`) |
| Trash | `status: trashed`, `/trashes`, `restore`, `destroy_permanently` |
| Reminders | `note_app_reminders`, `data.launch_time` / `repeat_frequency`, `send_reminder` |
| Collaborators | shares (`share_with_user_toggle`, `update_shared_user_rights`) |
| Make a copy | `duplicate` |
| Search | `?search=` |
| Archive | **missing**: multi_magic branch in progress |

## 1 · The grid (built 2026-11-13)

Layout read from the reference:
- dark page;
- a rounded search pill at the top, with the layout key and the avatar on its right;
- a small "Pinned" label, then the pinned cards, then "Others";
- two columns of staggered height, 8 dp gutters;
- a card with no colour is **only an outline** on the page; a coloured
  card is **filled** with a strong tone;
- each card shows a bold title, several lines of the body with their line
  breaks, and label chips;
- a bar at the bottom with quick-create keys, and a large + floating over
  its right end.

Built:
- `app/notes/index.tsx`, using `cardPreview` (a linear scan that keeps
  breaks, indents, lists and to-do boxes, and stops at the lines it shows),
  `masonry` (shorter column first), `noteColors` (the web's Tailwind tone
  per key, blended over our page; dark = the 900 tone at 80%, which gives
  the full colour seen in the reference; ink ≥ 4.5:1 on every colour) and
  `notesView.store` (grid by default, list kept per user).
- Long-press selects; the bar pins/unpins, colours (`NoteColorPicker`, the
  web's ten swatches) and deletes to the trash after a confirm.
- **+** creates an empty note and opens it in the editor; the checklist key
  creates one with the web's empty to-do list.
- Not built: drawing, voice, sort (see `MISSING_FEATURES.md`). Archive,
  labels and drawer come in their own steps.

## 2 … 5 (next)

Note screen with one bar that moves with the keyboard; ⋮ sheet; drawer and
labels; archive, trash and reminders. See Hello's brief of 2026-11-13 and
`EDIT_EVERYTHING.md` for the editor.
