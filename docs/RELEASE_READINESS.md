# MM mobile: release readiness (the TestFlight gate)

**The owner, 2026-11-21 (through Hello):** the MultiMagic TestFlight build
happens only when EVERYTHING is 100%: every feature done, every gate green,
and a very thorough device QA of every edge case. **This table is that gate.**
Hello reviews it; nobody ticks their own cell as reviewed.

Tree: `integration/mm-mobile-next` (local, never pushed). Gates per run are in
`docs/INTEGRATION.md`; this file is about the DEVICE.

## How a cell is written

- **PASS** + the evidence: a screenshot path in this repo, a flow and its run
  (`qa/FLOW_REGISTER.md` row), or a read-only DB check named in a log. Device
  evidence only: a green Jest test is named in the cell when it exists, but a
  cell is not PASS on Jest alone.
- **NOT MEASURED**: nobody has seen it on a device. The default. Never a pass.
- **N/A** + the reason (the app has no field, so "keyboard" is N/A).
- **FAIL** + the finding and who owns the fix.
- Date the cell: `PASS 11-21`. A cell older than the app's last change is
  re-measured.

Columns: **Off** offline · **Slow** slow network (qa/faults.sh) · **200%**
system font · **Dark** · **RTL** Persian/Pashto text in the user's content ·
**2×tap** a double tap on create/move/delete · **Kbd** keyboard over fields
· **360 / 411 / 800** dp · **States** empty, loading, error · **Perm**
permission denied · **Kill** kill and relaunch mid-task.

Owners (Hello, 2026-11-21): **88** Tables, Finance · **ee** Doc, Pages,
the Assistant, Chats, SafeZone · **ff** Flow, Notes, Search, the shell
(Home, header, Apps sheet, sheets), Calendar, Contacts.

## The table

| App (owner) | Off | Slow | 200% | Dark | RTL | 2×tap | Kbd | 360 | 411 | 800 | States | Perm | Kill |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Flow (ff) | PASS 11-20 [F-off] | NOT MEASURED | PASS 11-21 [F-200] | PASS 11-20 [F-dark] | NOT MEASURED | NOT MEASURED (Jest only [F-2x]) | NOT MEASURED | PASS 11-20 [F-360] | PASS 11-20 [F-411] | PASS 11-20 [F-800] | PASS 11-20 empty [F-empty]; error NOT MEASURED | N/A: Flow asks no permission | NOT MEASURED |
| Notes (ff) | NOT MEASURED | NOT MEASURED | NOT MEASURED | PASS 11-21 [N-dark] | PASS 11-13 [N-rtl] | PASS 11-21 [N-2x] | PASS 11-13 [N-kbd] | PASS 11-21 [N-360] | PASS 11-21 [N-411] | PASS 11-21 [N-800] | NOT MEASURED | NOT MEASURED (microphone, dictation) | NOT MEASURED |
| Search (ff) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | N/A: search writes nothing | NOT MEASURED | NOT MEASURED | PASS 11-21 fr [S-411] | NOT MEASURED | PASS 11-21 empty [S-empty]; loading, error NOT MEASURED | N/A: no permission | NOT MEASURED |
| Shell: Home, header, Apps sheet, sheet frame (ff) | NOT MEASURED | NOT MEASURED | **FAIL 11-21** [H-200]; fixed e842db8 (`fix/home-tile-names`: 2 columns from 150 %, names shrink to fit), device re-check owed (ff) | NOT MEASURED | N/A: no user text | N/A | N/A | NOT MEASURED | NOT MEASURED | PASS 11-20 header slot [H-800] | NOT MEASURED | N/A | NOT MEASURED |
| Tables (88) | PASS 11-21 flow 37: offline failure, then Try again recovers [T-man] | NOT MEASURED | **FAIL 11-21** table-tab pills cut at the bottom at 411 dp; fixed b5dfdf9, device re-check owed (88). Cards and delete sheet fit [T-man] | NOT MEASURED (only the 800 dp grid seen dark, flow 36) | NOT MEASURED | PASS 11-21 flow 37: a double tap on Add a row made one row, 25 → 26 [T-man] | PASS 11-21 delete-by-name sheet and field editor, keyboard up [T-man] | NOT MEASURED | PASS 11-21 flows 33, 35 (:3001), 37 [T-man] | **FAIL 11-21** + button covered the grid summary's last cell; fixed b5dfdf9, re-check owed (88). Grid, header, summary pass light and dark, flow 36 [T-man] | NOT MEASURED on device beyond the offline error (Jest: import, answers, empty grid) | NOT MEASURED (a viewer needs a 2nd account; two-person checks wait for demo.env) | NOT MEASURED |
| Contacts (ff) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Finance (88) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Doc (ee) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | **FAIL 11-21** inferred, not device-measured: text edit sheet on KAV "height"; fix 0c5c012, re-run owed (ee) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Pages (ee) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | **FAIL 11-21** qa_phone: text-file Save under the keyboard (flow 33), note picker behind it (flow 34); fix 4124956, re-run owed in slot 2 (ee); shots in gitignored qa/evidence, no tracked path yet | NOT MEASURED (flow 42 widths not run; flows 30/35/38 passed at 360 dp, no column claim) | NOT MEASURED (flow 42 widths not run; flows 30/35/38 passed at 360 dp, no column claim) | NOT MEASURED (flow 42 widths not run; flows 30/35/38 passed at 360 dp, no column claim) | NOT MEASURED | NOT MEASURED | NOT MEASURED (flows 40/41 written, stopped at the picker; fixed 5958fde) |
| Assistant (ee) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Chats (ee) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| SafeZone (ee) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Calendar (ff) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Workspace | N/A for this build: blocked on the owner's landscape decision (G1); not in the tree | | | | | | | | | | | | |

## Evidence

Device facts: `qa_phone` (Android, emulator-5554) on 2026-11-21 against the
local :3001 stack as the QA account only, with invented `[qa]`/`[qa-shot]`
data; the 2026-11-20 Flow pass was `qa_phone3` against the :3020 demo stack.
Every shot of 11-21 carries the dev client's performance overlay in its top
right (a known dev-client toggle, not the app; to be off from the next slot).

- **[F-off]** `docs/design/flow/ours/411-dark-fr-offline.png`, `-offline-add.png`, `-offline-refresh.png`.
- **[F-200]** `docs/release/evidence/2026-11-21-ff/46-font200-411-board.png`: a two-line title whole, tile sized to it (fix 025020e).
- **[F-dark]** `docs/design/flow/ours/411-dark-fr-*.png`, `360-dark-fr-*.png`.
- **[F-2x]** `flowApp.test.tsx` "creates ONE project when Create is tapped twice in one frame" (red with the guard planted out). Not seen on a device.
- **[F-360] [F-411] [F-800]** `docs/design/flow/ours/360-*`, `411-*`, `800-*` (11-20, before the header slot; the 800 dp header shot is `docs/design/app-shell/ours/800-after-flow.png`).
- **[F-empty]** `docs/design/flow/ours/411-light-en-projects-empty.png`, `411-dark-fr-projects-empty.png`.
- **[N-dark]** `docs/release/evidence/2026-11-21-ff/44-411-dark-*.png`, `44-800-dark-*.png`; `docs/design/notes/ours/parity-800-dark-fr-*.png`.
- **[N-rtl]** `qa/FLOW_REGISTER.md` row `27d-notes-rtl.yaml` (PASS 11-13, 360 light, 411 dark). Typing in Pashto not covered there.
- **[N-2x]** slot log 09:15: the double tap made exactly 1 note (read-only count, note 10010, then deleted for ever) (fix 887b603).
- **[N-kbd]** `qa/FLOW_REGISTER.md` row `27-notes-edit.yaml` (keyboard_check PASS 11-13).
- **[N-360] [N-411]** `docs/design/notes/ours/parity-360-*`, `parity-411-*`; `docs/release/evidence/2026-11-21-ff/44-411-*.png`.
- **[N-800]** `docs/release/evidence/2026-11-21-ff/44-800-*.png`: every Notes sheet a centred 560 dp card over the scrim.
- **[S-411]** `docs/release/evidence/2026-11-21-ff/45-411-light-fr-open.png`, `-hits.png`.
- **[S-empty]** `docs/release/evidence/2026-11-21-ff/45-411-light-fr-empty.png`.
- **[H-200]** `docs/release/evidence/2026-11-21-ff/46-font200-411-home.png`: Home's tiles cut app names at 200% ("SafeZ…", "Finan…", "Doc T…"); the rule is never cut an app's name. Owner ff; fix red-first.
- **[T-man]** `docs/design/tables/sweep/MANIFEST.md`, "Device pass 4" (pass 5 to be added by 88).
- **[H-800]** `docs/design/app-shell/ours/800-header-slot-contact-sheet.png`.

## Notes from owners

- 88 (11-21): Contacts and Finance are all NOT MEASURED on the 13 columns. Finance's device pass 3 proved swipe reveal/delete, no stale offset on Loans, Expense Undo restoring row and total (`docs/design/hygiene-step0/MANIFEST.md` rows 124-126), none of them a column here. Contacts: My family and the who-is-it sheet are Jest only; the keyboard over that sheet is ⚠ in the manifest (C2).

- ee (11-21): Jest covers parts of Doc and Pages (both schemes in `screens.render`, the offline upload queue, Doc's busy/Retry in `busy.test.tsx`); named here, not PASS.

## Open, before any cell can turn

- `qa/flows/login.yaml` cannot sign in at 360 dp or at 200% font: its last
  step taps Home's Assistant tile, which is below the fold there (ff to fix:
  scroll to it).
- The dev client's performance monitor toggles on a "p" key-up when nothing
  takes text (ee found it): every slot turns it off in its preflight.
- Device sign-in (Hello, decided 11-21): the :3001 QA account, credentials
  read by name from the gitignored `.env`. The :3020 demo file is on the
  owner's Tuesday list; until then every TWO-PERSON check (sharing, members,
  a viewer's rights) is NOT MEASURED.
