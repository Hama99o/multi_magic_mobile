# The note editor screen on engine B (phase 3, 2026-11-13)

This note maps the editor design in `SPEC.md` (§B: 28 Mobbin references,
§C2–§C11, §G) onto engine B, chosen on 2026-11-12 (plan §11, "B with
conditions"). It records what ships in the first wired build, what B's
own toolbar covers, and what is still owed. The Mobbin sources are the ones
in SPEC §B; no new pattern was needed for this step.

## What is wired (`app/notes/edit.tsx`, flag `NOTES_EDITOR_ENABLED`)

| Part | Source in SPEC | First build |
|---|---|---|
| Entry | §C2 | a pencil in the read view's header, only when the flag is on (dev builds) and the reader may edit (`canEdit`: owner, administrator, contributor) |
| Header | §C2 (notion-empty-01, apple-notes-toolbar-01) | back · sync state (Saved, Not saved yet, Saving…, On this phone only, Edited on the web too) · globe (the web) |
| Title | §C2 | a large single-line field, 26/32 bold, as the read view |
| Body | §C2 | engine B, themed from our tokens (`engineTheme.ts`): UI face, 16/24 body, the read view's heading sizes, accent checkboxes, both modes |
| Toolbar | §C3 (notion-toolbar-01, bear-toolbar-01, obsidian-toolbar-01/02) | **B's keyboard-attached toolbar** (`toolbarPlacement="keyboard"`), themed. Our own toolbar (Aa format panel, + insert grid) is next; see "Owed" |
| Read-only blocks | §C8 (notion-table-01, notion-block-actions-02) | tables, code, legacy markup, images, and any block holding sub/sup or a web comment: an atom drawn by our read view (`ReadOnlyAtom.tsx`). Text blocks get "Edit on the web" under them |
| Autosave | §C11 | the local draft at once, the server 500 ms after the last change, and at once when leaving (`noteSaver.ts`) |
| Draft restore | §C11 | an unsent draft is restored on open, with a one-line notice |
| Conflict | §G2 | before each write the saver reads `updated_at`; if the web moved, nothing is written and a dialog asks: **Keep both** (first, the owner's default: a copy titled "… (conflict 12 Nov 15:40)") · Keep mine · Keep the web's |
| B refuses a note | plan §11 cond. 1 | the read view, with "cannot be edited on the phone yet", and the web |
| A change that cannot become valid HTML | plan §11 cond. 1 | nothing is sent; the screen says so in `danger`; the text stays in the draft |

## Why B's own toolbar first

B's toolbar already runs B's own commands: marks, lists, indent and
outdent, undo and redo. Those commands are what the device spike measured.
Our §C3 toolbar needs the same commands through B's ref
(`toggleMark`, `toggleList`, `indentListItem`…). It goes in as the next
step, once the first device QA shows the screen behaves (keyboard, caret,
drafts). It would be a mistake to build our toolbar before we know B's
commands behave on the device.

## Owed before this leaves dev builds

1. Our toolbar (§C3): cursor row, selection row, the `Aa` format panel,
   and the `+` insert grid (§C4), through B's commands.
2. **The keyboard never hides the caret** (§C11), measured at 360 × 640 with
   the caret on the last line of a long note and inside a list item.
3. Block actions and reorder (§C5, §C6).
4. Image insert and upload (§C9).
5. Tablet split view at ≥ 800 dp (§G1).
6. A server-side version check on `PUT notes/:id`. Until then the phone's
   read-then-write leaves a short window (`noteSaver.ts`). This is a
   multi_magic change and needs the owner.
7. The checks from plan §11 that need the owner's phone: Pashto keyboard,
   Samsung keyboard, iOS dictation, and a tablet with a hardware keyboard
   (B's known desync, SPEC §H).
