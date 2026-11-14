# Editing long notes on the phone (proposal, 2026-11-14)

**Status: proposal. Nothing is built; the owner decides.**

## Today

- A note over 96 KB opens in the read view: "This note is too long to edit on the phone yet" (`EDIT_SIZE_LIMIT`, `editSession.ts`). It has no web button, per the owner's rule.
- Measured with `qa/scripts/epoch_probe.py` on the emulator (QA-2026-11-13.md, "The edit size limit"):
  - 112 KB edits and saves;
  - 125 KB and up: the first keys block the UI thread for more than 5 s, and Android kills the app (ANR);
  - 800 KB: engine B refuses the note (`POSITION_EPOCH_LIMIT_EXCEEDED`).
- Opening time on the emulator:
  - 100 KB: 1.8 s after the source map change;
  - 400 KB: about 5 s, most of it creating B's document (`[notes-open]` log).
- **Inferred, not proven:** the ANR comes from B's native work on each key, which grows with the document. Our export of a 200 KB note takes about 170 ms, on the JS thread.

The goal: edit any note on the phone, with no ANR and no lost key, while keeping the web's HTML exact. "Exact" means bytes we did not touch are written back as they were, and what we did touch is written as the web's Tiptap writes it.

## What other apps do (checked 2026-11-14)

- **Mobbin, Notion iOS:**
  - [page editor](https://mobbin.com/screens/de033fb7-8d36-4c24-9e2d-40f95d1f7ff5?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp);
  - [table in a page](https://mobbin.com/screens/db2814d9-78bd-4b01-9d57-8e1c4dcbdbbc?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp).
  - Editing is block by block: the toolbar acts on the focused block and can move it up or down. Each block is its own editable unit.
- **Mobbin, Lightyear iOS:**
  - [a 40-page document](https://mobbin.com/screens/e45aaa32-557e-4650-90c4-4bc31d64cad9?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp).
  - A long text is shown as pages with a "1 of 40" counter and a contents list to jump. Read-only.
- **From general knowledge, not verified in this session:**
  - Google Keep caps a note at about 20 000 characters, so it never meets this problem.
  - Notion loads a page's blocks in chunks, so the client never holds a huge document as one editor.
- **What Mobbin cannot show:** how these apps work under the hood. It only shows screens.

What they have in common: nobody edits a 900 KB document as one rich-text field on a phone. They either cap the size (Keep) or edit small units (Notion).

## Option A: section by section (recommended)

The note opens in the read view, cut into **sections**. "Edit" on a section opens just that section in engine B. On leaving, the section is spliced back into the note's HTML and the whole note is saved.

### How the sections are cut
- The codec's source map already splits the stored HTML into consecutive slices, each with the top-level nodes it produced. Their concatenation is the input, byte for byte: `SourceMap.chunks` in `tiptop-schema/html/parse.ts`.
- A section is a run of chunks starting at a heading (h1–h3). A note without headings is cut every ~48 KB at a chunk boundary.
- Each section stays under ~48 KB, half the measured edit limit, which leaves room to type.
- A single top-level node larger than that (one huge table or list) cannot be cut. That section stays read-only and says so.

### How the web's HTML stays exact
- New HTML = the original slices for every section not edited + `toHTML(edited section)` for the one edited.
- Untouched sections are byte-identical. The edited one is written as the web writes it (the oracle tests compare `toHTML` with Tiptap `getHTML`).
- This is the existing `toHTML({ source })` path, used on one section instead of a whole note.

### Where the splice happens
On the phone (client-side). The server keeps receiving one full HTML note, as today, so multi_magic needs no change (its master needs the owner's yes). A server-side splice (a "PATCH this section" API) would send less data. That's not needed now.

### Conflicts
- Same as today: the save sends the version it started from, and a 409 opens "This note changed on the web".
- Possible later improvement: re-fetch the note and splice again when the web changed *other* sections only (a section-level 3-way merge). That's not needed for a first version.

### Undo
B's undo works inside the open section. Leaving the section saves it; there's no undo across sections. The web keeps its own history.

### Cost and risk
- **Cost:** about 3–5 days with tests.
  - Section cutter (pure, Jest).
  - Section read view with "Edit" per section and a contents list, like Lightyear's jump.
  - Splice on save.
  - Tests: a property test (random sections edited, every other byte unchanged), the web oracle on edited sections, and the probe on a 900 KB note (no ANR, keys saved).
- **Cost of the source map:** building it for a 900 KB note costs several seconds on the phone (2–3× a plain parse). It's built once, when the first section is opened, with a spinner. The read view never needs it.
- **Risk: low to medium.** All of it is our code, in parts we already test (codec, source map, saver). The main UX risk is that people want to scroll and edit freely across sections; "Edit section" is one more tap.

## Option B: a lazy or virtualised engine B

Give B only the part of the document on screen, and swap parts as the person scrolls.
- **Exactness:** the same splice as A, but done continuously.
- **Conflicts and undo:** undo across swapped parts would need our own history layer.
- **Cost and risk:** high. B 2.2.3 has no API for a partial document or a window. Its position epochs and its per-key cost live in the compiled Rust core. This means forking B's core, which we can't maintain.
- Not recommended.

## Option C: an upstream fix in engine B

File the issue (draft: `ENGINE-B-ISSUE-position-epoch.md`, not filed; it needs the owner's yes). Ask for a configurable epoch limit and for per-key cost that does not grow with the document.
- **Exactness:** unchanged; the note stays one document.
- **Cost:** low for us.
- **Risk:** timing and outcome are out of our hands, and the ANR may be a design choice in the core.
- Worth doing **in parallel**, not instead.

## Rejected: a plain-text editor for long notes

Fast, but it loses formatting, and it cannot keep the web's HTML exact (marks, tables, tasks). That breaks the shared schema rule.

## Recommendation

1. **Build Option A**: section-by-section editing with a client-side splice. Sections are cut at headings, ~48 KB maximum, and notes over 96 KB open that way. It uses parts we own and already test, keeps every untouched byte, and needs no server change.
2. **File the upstream issue (Option C)** once the owner says yes, with the numbers we have. If B fixes the cost, the section limit can grow or go away.
3. Keep the 96 KB guard until A ships. Re-run the probe on a real phone, which may allow a higher limit.

The owner decides.
