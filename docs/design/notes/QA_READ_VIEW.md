# Notes read view: device QA (phase 2, 2026-11-12)

**Rig:** `qa_phone3`, headless, `-memory 1536`, `-gpu host`. Dev APK of 2026-11-09 (SDK 57, no new native module on this branch). Metro :3029 from the `mm-notes` worktree with its own `npm ci`.
- The served bundle was grepped first: 15 hits for Notes-only code, 0 paths from the main checkout.
- Backend: `multi_magic` dev on :3001.

**Data:** 23 notes in the QA account, titled `[qa-notes] NN · …`, with their stored HTML checked byte-equal after the POST.
- 20 are real dev notes, chosen to cover every node and mark: nested lists, tasks, tables, code, highlight, colours, links, legacy `<img>`/`<iframe>`, h4–h6, CRLF, Pashto, and a 914 KB note.
- 3 are added: emoji + sub/sup + colour, a 2.3.1 image uploader, and a Pashto note.

**Flow:** `qa/flows/26-notes.yaml`. It opens the Home tile and the list, then 10 notes, each shot twice. It writes nothing.

| Pass | Result |
|---|---|
| light · 411 dp · en | PASS (after 2 fixes) |
| dark · 360 dp · fr | PASS. The first try was NOT MEASURED: a native Fabric crash (`MountingCoordinator::pullTransaction`, SIGSEGV) right after `wm density` changed under a running app. It is in React Native, not in Notes, and the re-run was clean. |
| dark · 800 dp · en | PASS, after the highlight fix |

**About the Fabric crash.** The SIGSEGV in `facebook::react::MountingCoordinator::pullTransaction` happened on React Native 0.86.3 (New Architecture, Expo 57). It was a dev build, and the crash came right after `wm density` changed under the running app. The Contacts session saw the same crash on a relaunch. It has only been seen on dev builds, under a display change or a relaunch, and never in a Notes path.

## Found and fixed, test-first (red evidence kept)

| # | What the device showed | Fix |
|---|---|---|
| 1 | The list spun forever: a 914 KB real note hung `noteSnippet`. Its separator regexes backtracked exponentially on runs of empty paragraphs. | `efb79fd`: a sentinel and a split (linear). Perf tests added. |
| 2 | A Pashto list read right-to-left, but its bullets, numbers and boxes, and the quote bar, sat on the left. | `b53922c`: each row follows its first strong character. |
| 3 | An image whose file is gone drew a blank box. | `22d91d2`: it now shows "image unavailable". |
| 4 | Pictures pasted as `data:image/png;base64` showed as "content the phone cannot show". | `22d91d2`: raster data images are drawn. SVG and text are not. |
| 5 | In dark mode, light text on the default yellow highlight could not be read. | `3c51e57`: the mode's ink or ground, whichever contrasts more. The author's text colour still wins. |

## Seen, and left as is

- **Separate `<ol>`s each numbered "1."** The note is stored as five one-item lists, and the web shows the same thing.
- **The tablet list is a single column.** The side-by-side list and note view (SPEC §G1) is phase 3.
- **"View on web" was not followed into a browser.** That is left to the manual pass.

## Not covered

- Editing (phase 3).
- iOS.
- A real phone.
