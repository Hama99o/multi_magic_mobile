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

## 2 · The note screen and the one bar (built 2026-11-13)

Layout read from the references (note and keyboard-up):
- a round back button at the top left;
- a rounded pill of actions at the top right;
- a large, light title, then the text straight on the page with no frame;
- a single bar at the bottom: + · palette · A on the left, undo · redo in
  the middle, ⋮ on the right;
- with the keyboard up, **the same bar** sits right on the keyboard.

Built (`app/notes/edit.tsx`):
- the page takes the note's colour (palette → the web's ten keys, saved to
  `data.color`);
- the title is 28 sp, regular weight;
- the header pill has **pin** (saved to `pinned`). Reminder and archive
  join it in step 5, so no key does nothing;
- the bar is `toolbarModel`'s Keep row. **A** is dimmed until the caret is
  in the body; it swaps the bar for the Format panel, with a close key. +
  opens the insert panel (the web's slash commands);
- ⋮ opens a bottom sheet: "Edited <when>", **Delete** (confirm, to the
  trash, then back), **Make a copy** (the web's duplicate; opens the copy),
  **Send** (the OS share sheet, plain text). **Labels** and
  **Collaborators** join it in step 4, with their sheets;
- tapping a note in the grid opens it straight in this screen: always in
  edit mode, as in Keep.

Still to do here: auto-detected links, phones and emails in the body (tap
to open). This is checked on the device, with the keyboard-occlusion pass.

## 3 · The ⋮ sheet: Labels (built 2026-11-13)

Labels joins Delete, Make a copy and Send: tick a label to put it on the
note or take it off (`toggle_tag`), or type a new name to create it on the
note (`create_and_assign_tag`).

## 4 · Drawer and labels (built 2026-11-13)

The drawer is opened by ☰ in the search pill. Layout read from the reference:
- the app name at the top;
- the current entry as a rounded pill;
- a "Labels" section with one tag icon per label.

Entries:
- **Notes**;
- **Reminders**;
- the labels (each one filters the grid with `tag_id`);
- **Edit labels** (create, rename, delete, in the web's store);
- **Archive**;
- **Trash** (restore, or delete forever after a confirm).

## 5 · Archive, trash, reminders (built 2026-11-13)

- **Archive:** the server addition is multi_magic **PR #21** (status
  `archived`, routes, MCP, minimal web; not merged). On the phone: the
  archive key in the note's pill, Archive in the grid's selection bar, and
  the Archive list.
- **Trash:** the web already had it (destroy → trashed, `trashes`,
  `restore`, `destroy_permanently`).
- **Reminders: local notifications** (Hello's decision). The reminder is
  stored on the note: `data.launch_time` + `repeat_frequency`, made
  writable by multi_magic **PR #22**. Every device and the web see it; the
  web shows it on the card.
  - Each phone schedules its own notification with `expo-notifications`:
    once, daily, weekly or monthly.
  - The schedule is rebuilt from the server at launch, after sign-in, and
    after any reminder change, archive or delete.
  - Tapping a notification opens the note.
  - The bell in the note's pill opens Keep's sheet: later today, tomorrow
    morning, next week, a date and time, a repeat, Remove.
  - **Limits, by design:**
    - a reminder fires only on a phone that has opened MultiMagic since it
      was set;
    - the server sends no email or push (MISSING: server delivery);
    - if notifications are off for the app, the note says so and the
      reminder is still saved.
  - `expo-notifications` is a native module: it arrives with the next
    native build.

## Next

Note screen with one bar that moves with the keyboard; ⋮ sheet; drawer and
labels; archive, trash and reminders. See Hello's brief of 2026-11-13 and
`EDIT_EVERYTHING.md` for the editor.
