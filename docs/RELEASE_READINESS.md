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
| Notes (ff) | NOT MEASURED | NOT MEASURED | NOT MEASURED | PASS 11-21 [N-dark] | PASS 11-13 [N-rtl] | PASS 11-21 [N-2x] | PASS 11-13 [N-kbd]; re-checked 11-24 after 53b9793 [K-69] | PASS 11-21 [N-360] | PASS 11-21 [N-411] | PASS 11-21 [N-800] | NOT MEASURED | NOT MEASURED (microphone, dictation) | NOT MEASURED |
| Search (ff) | NOT MEASURED | NOT MEASURED | NOT MEASURED | PASS 11-21 [S-dark] | NOT MEASURED | N/A: search writes nothing | NOT MEASURED | PASS 11-21 [S-360] | PASS 11-21 fr [S-411] | PASS 11-21 [S-800] | PASS 11-21 empty [S-empty]; loading, error NOT MEASURED | N/A: no permission | NOT MEASURED |
| Shell: Home, header, Apps sheet, sheet frame (ff) | NOT MEASURED | NOT MEASURED | PASS 11-21 [H-200b]: 2 columns, every app name whole (was FAIL 08:48 [H-200], fixed e842db8) | NOT MEASURED | N/A: no user text | N/A | N/A | NOT MEASURED | NOT MEASURED | PASS 11-20 header slot [H-800] | NOT MEASURED | N/A | NOT MEASURED |
| Tables (88) | PASS 11-21 flow 37: offline failure, then Try again recovers [T-man] | NOT MEASURED | **FAIL 11-21** table-tab pills cut at the bottom at 411 dp; fixed b5dfdf9, device re-check owed (88). Cards and delete sheet fit [T-man] | NOT MEASURED (only the 800 dp grid seen dark, flow 36) | NOT MEASURED | PASS 11-21 flow 37: a double tap on Add a row made one row, 25 → 26 [T-man] | PASS 11-21 delete-by-name sheet and field editor, keyboard up [T-man]; form title and activity Send re-checked 11-24 after 53b9793 [K-69] | NOT MEASURED | PASS 11-21 flows 33, 35 (:3001), 37 [T-man] | **FAIL 11-21** + button covered the grid summary's last cell; fixed b5dfdf9, re-check owed (88). Grid, header, summary pass light and dark, flow 36 [T-man] | NOT MEASURED on device beyond the offline error (Jest: import, answers, empty grid) | NOT MEASURED (a viewer needs a 2nd account; two-person checks wait for demo.env) | NOT MEASURED |
| Contacts (ff) | NOT MEASURED | NOT MEASURED | PASS 11-21 header and a one-line row at 200 %, nothing spills [C-200]; the two-line row (name + subtitle) not shown | NOT MEASURED | NOT MEASURED | PASS 11-21 one contact from a double-tapped Save [C-2x] | PASS 11-21 [C-kbd] | NOT MEASURED | PASS 11-21 [C-200] | NOT MEASURED | PASS 11-21 empty book [C-empty]; loading, error NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Finance (88) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Doc (ee) | PASS 11-25 [FF-off]: offline says "MultiMagic could not be reached…"; Change file re-reads once back (86, 87c) | PASS 11-25 [SLOW]: flows 48, 49 ×5 | PASS 11-24 [D-200] | PASS 11-24 [D-dark] | **FAIL 11-25** (server, ee): a Persian PDF draws right, but `pdf/text` returns RTL runs in VISUAL order, so "Lines on this page" and the edit field show the letters reversed [FF-rtl]. multi_magic, not the app | PASS 11-25 [FF-2x]: a double tap on Save PDF gives one result, 1 POST pdf/edit at the proxy (85) | PASS 11-24 [D-kbd]: the edit-line sheet keeps Done above the keyboard (was FAIL 11-21; fixed 53b9793, red-first Jest) | PASS 11-24 [D-w] | PASS 11-24 [D-w] | PASS 11-24 [D-w] | PASS 11-25 [FF-st]: loading (busy card, 87); error says the app's own words, **was FAIL** (Rails' "Internal Server Error"), fixed red-first 339f8b0 (87b); Change file recovers (87c). A read failure offers no Retry (by design, ErrorLine: busy only). Busy 503 NOT MEASURED (flow 50 needs 83's slot) | PASS 11-25 [PERM]: Convert's camera refused says "No access" | PASS 11-25 [FF-kill]: force-stop mid-read, the relaunch is usable and nothing stays busy (88). Kill mid-save NOT MEASURED (real phone) |
| Pages (ee) | PASS 11-24 [P-off]: offline the upload waits, back online it arrives | PASS 11-25 [SLOW]: flows 30, 35, 37 with every API call +1.5 s | PASS 11-24 [P-200]: names whole, dates truncate | PASS 11-24 [P-dark] | PASS 11-24 [P-rtl] | PASS 11-24 [P-2x]: one folder per double tap, 3 runs, 3 folders | PASS 11-24 [P-kbd]: text-file Save and the page editor's toolbar above the keyboard (was FAIL 11-21; fixes 4124956, 53b9793) | PASS 11-24 [P-w] | PASS 11-24 [P-w] | PASS 11-24 [P-w] | PASS 11-24 empty folder [P-empty]; loading, error NOT MEASURED | PASS 11-25 [PERM]: camera refused says "No access" and the way out | PASS 11-24/25 kill mid-UPLOAD resumes, no copy left [P-kill], re-checked under a real force-stop 11-25; kill mid-COPY **NOT MEASURED** on the AVD (real-phone RC list) |
| Assistant (ee) | PASS 11-25 [A-off]: "Could not reach MultiMagic", Try again, the question kept | NOT MEASURED | PASS 11-25 [A-w] | PASS 11-25 [A-w] | PASS 11-25 [RTL]: a Persian question and reply (seeded, invented) | PASS 11-25 [A-2x]: one bubble, one POST | PASS 11-25 [A-2x]: composer above the keyboard | PASS 11-25 [A-w] | PASS 11-25 [A-w] | PASS 11-25 [A-w] | PASS 11-25 start state, offline error, memory card absent [A-st]; an ANSWER and its loading **NOT MEASURED** (shared-key rule) | PASS 11-25 mic refused said, still typeable [A-perm] | PASS 11-25 a typed draft survives a force-stop [K-78]; kill mid-ANSWER **NOT MEASURED** (shared-key rule) |
| Chats (ee) | PASS 11-25 [Ch-off]: "Could not reach MultiMagic. Showing what we had", Try again, the list kept | PASS 11-25 [SLOW]: flows 66, 67 | PASS 11-25 list and thread [Ch-w] | PASS 11-25 list and thread [Ch-w] | PASS 11-25 [RTL]: a Persian message in the list and the thread | PASS 11-25 [FF-2x] after a fix: **was FAIL** (a double tap on a row pushed two threads; raw adb taps too), fixed red-first e0a36c2 (83) | PASS 11-25 thread composer and Send above the keyboard, draft never sent [Ch-kbd]; new-conversation sheet PASS 11-24 [K-69] | PASS 11-25 [Ch-w] | PASS 11-25 [Ch-w] | PASS 11-25 [Ch-w] | PASS 11-25 empty list [Ch-empty]; ask-the-assistant from a thread composed, unsent [Ch-ask]; loading PASS 11-25 [FF-st] (kept list or skeleton; the thread opens on the last message it knew, 80); list error + Try again PASS (81, 81b); thread error **was FAIL** (a seeded thread failed silently), fixed red-first c92a55c (82, 82b) | PASS 11-25 [PERM]: mic refused said, still typeable | PASS 11-25 [K-78]: the draft survives a force-stop. **Was FAIL the same night** (lost: useState only); fixed red-first in app/chat/[id].tsx, test chat-thread.draft.test.tsx . Stray "typing…" after the relaunch (my own echo + the restored draft announcing typing) fixed red-first 005aee1; 78 now asserts its absence [FF-kill] |
| SafeZone (ee) | PASS 11-25 [Z-off]: the right PIN offline gives a notice, stays locked, not counted wrong | PASS 11-25 [SLOW]: flows 70, 73 | NOT MEASURED by picture (FLAG_SECURE blacks Android shots, by design); view tree PASS 11-25 [Z-lay] | NOT MEASURED (FLAG_SECURE; colours need a picture, iOS) | PASS 11-25 [RTL] by the view tree: a Persian title listed (FLAG_SECURE: no picture) | PASS 11-25 [Z-2x]: one row, one POST | PASS 11-25 [Z-kbd]: Save reached by scrolling with the keyboard up | NOT MEASURED by picture (FLAG_SECURE blacks Android shots, by design); view tree PASS 11-25 [Z-lay] | NOT MEASURED by picture (FLAG_SECURE blacks Android shots, by design); view tree PASS 11-25 [Z-lay] | NOT MEASURED by picture (FLAG_SECURE blacks Android shots, by design); view tree PASS 11-25 [Z-lay] | PASS 11-25 locked, wrong PIN with attempts left, unlocked list, locked again [Z-st]; empty tab NOT MEASURED | N/A: SafeZone asks for no permission (grep of src/screens/safezone, app/safezone) | PASS 11-25 [Z-kill]: the owner's window rule (48de822): reopens inside 2 min, PIN after 150 s dead |
| Calendar (ff) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | PASS 11-21 one event from a double-tapped Save [K-2x] | PASS 11-21 [K-kbd] | NOT MEASURED | PASS 11-21 [K-411] | NOT MEASURED | PASS 11-21 list + month views [K-411]; empty day, error NOT MEASURED | NOT MEASURED | NOT MEASURED |
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
- **[S-dark] [S-360] [S-800]** `docs/release/evidence/2026-11-21-ff/45-360-{light,dark}-en-*.png`, `45-800-{light,dark}-en-*.png`: the entry for the width (Home field on a phone, header key at 800), "qa-shot" hits, a hit opened, the empty state.
- **[C-200]** `…/48-411-light-f2.0-online-list-with-row.png` (the `#` header and the row at font_scale 2.0), `-card.png`.
- **[C-2x]** slot log 15:49: contacts made in the window [1341] = one; then deleted for ever (0 rows, read-only check 15:54).
- **[C-kbd]** `…/48-411-light-f2.0-online-keyboard.png`. **[C-empty]** `…/48-411-light-f2.0-online-list.png` (the QA account's book was empty).
- **[K-2x]** slot log 15:36: events "[qa] DST weekly" made in the window = 275, one; deleted (series, to the trash) 15:48.
- **[K-kbd]** `…/47-411-light-f1.0-online-keyboard.png`. **[K-411]** `…/47-411-light-f1.0-online-open.png`, `-other-view.png`.
- Calendar DST (83's 1a145681): **NOT MEASURED** on a device. The list shows 7 days (+30), so a March 2027 occurrence is not in it; and :3001 ran e9adf512, which does not contain the fix.
- **[H-200b]** `…/49-411-f2.0-home-{top,middle,bottom}.png` (17:28, qa_phone, :3001): two columns; SafeZone, Notes, Tâches, Pages, Finances, Flow, Tables, Discussions, Doc Outils, Contacts all whole. 100 % for comparison: `49-411-f1.0-home-*.png`.
- **Calendar DST, a SERVER FAIL reproduced on the device** (17:33): a weekly 09:00 event reads **9:00 AM on 25 Mar 2027** and **10:00 AM on 1 Apr 2027** (`…/47-411-light-f1.0-online-dst-{before-2027-03-25,after-2027-04-01}.png`, the month view = the server's occurrences). :3001 runs `~/Apps/Personal/multi_magic` e9adf512, which lacks 83's fix 1a145681. :3020 (container `mm-mobile-api-next`, worktree `mobile-api-next` e75bcafa) HAS it: the same flow there turns this PASS once the owner's demo credentials exist (Tuesday). Not an app defect: the phone shows what the server answers. Event 276 deleted (trashed).
- **[T-man]** `docs/design/tables/sweep/MANIFEST.md`, "Device pass 4" (pass 5 to be added by 88).
- **[H-800]** `docs/design/app-shell/ours/800-header-slot-contact-sheet.png`.

**2026-11-24, ee:** `qa_phone` (emulator-5580) against a local stack on
**:3030** (container `mm-ee-live`, multi_magic at origin/master 8075f963, DB
`multi_magic_eelive_development`, a copy of the QA database, never prod;
upload storage on /data). Signed in as the QA account only, invented data;
credentials read by name from a gitignored 600 file. Shots in
`docs/release/evidence/2026-11-24-ee/`, every one looked at.

- **[D-kbd]** `48-doc-text-keyboard.png`: Done on screen over the keyboard (flow 48).
- **[D-w]** `49-doc-text-{360,411,800}.png` (flow 49). **[D-dark]** `49-doc-text-411-dark.png`. **[D-200]** `49-doc-text-411-font200.png`, `49-doc-hub-411-font200.png`: nothing cut.
- **[P-w]** `42-folder-{360,411,800}.png` (flow 42). **[P-dark]** `42-folder-411-dark.png`. **[P-200]** `42-folder-411-font200.png`. **[P-rtl]** `44-rtl-list.png` (flow 44, Persian titles).
- **[P-2x]** `43-double-tap.png` (flow 43); read-only DB count: one "[qa] twice" folder per run (3 runs, ids 33, 41, 52).
- **[P-kbd]** `33-text-saved.png` (flow 33), `36-page-link-code.png` (flow 36).
- **[P-off]** `45-offline-waiting.png`, `46-offline-sent.png` (flows 45, 46); the server had the file at 22:51:49.
- **[P-empty]** `47-empty-folder.png` (flow 47). **[P-kill]** `41-after-kill-mid-upload.png` (flow 41); the app's copy folder empty after the relaunch.
- **[K-69]** `69-{notes,tables-form,tables-activity,chats-new}-kbd-{light,dark}.png` (flow 69): every other user of the shared KeyboardPadding after 53b9793, keyboard up: Notes toolbar, Tables form title, Tables activity Send, Chats new-conversation name and Start.
- **Pages kill mid-copy, NOT MEASURED (measured cause):** 1302 MB tripped the AVD's lowmemorykiller (2.5 GB RAM; the app was not killed); 800 MB was copied before Maestro, adb, or an on-device 10 ms poll saw a partial file. The copy streams (uploads.store.ts:259 → expo-file-system fsops/Utilities.kt:87), and the relaunch rule is Jest-covered (uploads.store.test.ts:574).

**2026-11-25, ee:** the same rig (:3030, `qa_phone` emulator-5580, QA account,
invented data), with **every AI key EMPTY** on the server (the dev `.env`
carries the prod free-tier keys; owner rule via Hello: no AI calls from dev).
Prompts therefore fail closed: one prompt POST all night (flow 63),
`ai_usage_events` 0. A second QA account sent one invented message to make a
thread (notification row and local cable only). Shots in
`docs/release/evidence/2026-11-25-ee/`, every one looked at.

- **[A-w]** `60-assistant-{360,411,800,411-dark,411-font200}.png` (flow 60). **[A-off]** `61-assistant-offline.png` (61). **[A-perm]** `62-assistant-mic-refused.png` (62). **[A-2x]** `63-assistant-double-tap.png` (63). **[A-st]** `65-assistant-memory-state.png`, `61-assistant-offline.png`.
- **[Ch-w]** `68-chats-{list,thread}-{360,411,800,411-dark,411-font200}.png` (68). **[Ch-kbd]** `67-chats-keyboard.png` (67). **[Ch-ask]** `66-chats-ask-composed.png` (66). **[Ch-empty]** `66-chats-empty.png`.
- **SafeZone, no pictures by design:** FLAG_SECURE (SafeZoneGate `useSecureScreen`) blacks every Android shot; each cell is a flow asserting the view tree, verdicts in `qa/FLOW_REGISTER.md` rows 70-75 (`qa/sz-readiness.sh`). **[Z-st]** 70. **[Z-kill]** 71. **[Z-off]** 72. **[Z-kbd]** 73. **[Z-2x]** 74 plus a read-only row count. **[Z-lay]** 75 at 411/360/800/411-dark/411-200 %: every PIN key, Forgot, Add and Search on screen; says nothing about clipping inside a control or colour.
- **Rig facts found here (each device-measured):** Maestro's `killApp` left a FOREGROUND app alive (SafeZone kept renewing through a "dead" 150 s): kill flows now `stopApp`. A plain `launchApp` grants every permission. Offline is decided by a failed request, not a network listener. A cold start reopens the last app AND record, so `login.yaml` backs out of a reopened record.


- **[SLOW]** `qa/fault_proxy.py` on :3040 in front of :3030 with `/api/v1=slow:1500`, the app from a second Metro (:3041) baked to it (bundle checked for the URL), torn down by PID after; flows in `qa/FLOW_REGISTER.md`. **[RTL]** `76-rtl-{assistant,chats-list,chats-thread}.png` (flow 76). **[PERM]** `77-{pages,doc}-camera-refused.png`, `77-chats-mic-refused.png` (77). **[K-78]** `78-assistant-draft-after-kill.png`, `78-thread-after-kill.png` (78, after the fix). **[Ch-off]** `79-chats-offline.png` (79).
- **Observed, cause since measured (ff, 2026-11-25):** after the relaunch in flow 78 the thread's header read "Sam Rivera typing…" while nobody was typing (`78-thread-after-kill.png`). Both inferred causes were real, each red in `chat-thread.typing.test.tsx`: the broadcast reaches the sender too (`Messaging::Broadcast.typing`, which the web filters) and the restored draft announced typing from an effect. Fixed 005aee1; flow 78 now asserts no "typing…".

**2026-11-25, ff (after ee's handoff):** the same :3030 stack and `qa_phone`
(emulator-5580), invented QA accounts from the 600 `qa.env`; the app from a
Metro (:3041) baked to `qa/fault_proxy.py` (:3040 → :3030), faults switched
per flow by the driver (`slow:8000`, `500`, `slow:20000`), network cut by
`svc wifi/data`. Tree: c4bf515 + the four fixes below. Shots in
`docs/release/evidence/2026-11-25-ff/`, every one looked at; `-BEFORE-fix`
shots are the failures as found.

- **[FF-st] Chats:** `80-chats-list-loading-{kept,skeleton}.png`, `80-chats-thread-{loading,loaded}.png` (80); `81-chats-list-error.png`, `81b-chats-list-recovered.png` (81, 81b); `82-chats-thread-error{-BEFORE-fix,}.png`, `82b-chats-thread-recovered.png` (82, 82b). **Doc:** `87-doc-loading.png` (87), `87b-doc-error{-BEFORE-fix,}.png` (87b), `87c-doc-recovered.png` (87c).
- **[FF-2x]** `83-chats-{double-tap-BEFORE-fix,after-one-back}.png` (83); `85-doc-double-tap-result.png` (85, 1 POST pdf/edit counted at the proxy).
- **[FF-off]** `86-doc-offline.png` (86), then 87c with the network back. **[FF-kill]** `88-doc-after-kill.png` (88); `78-thread-after-kill-settled.png` (78: no "typing…" over three checks, draft kept, then cleared).
- **[FF-rtl]** `84-doc-rtl-page.png`, `84-doc-rtl-lines-reversed.png` (84). Fixture: invented Persian, printed by LibreOffice (one show operation per line; Chrome writes one per glyph cluster, 57 for 3 lines, Latin as much as Persian, so it is not an RTL test). `pdftotext` reads the same file in logical order; `pdf/text` answers visual order. Measured on :3030 (multi_magic 8075f963); the fix belongs to the server.
- **Fixed red-first this run:** 005aee1 (thread "typing…": my own echo, and a restored draft announcing typing), e0a36c2 (Chats row double push), c92a55c (seeded thread failing silently), 339f8b0 (Doc 5xx shown as Rails' English body).

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

- **Owner's real-phone RC checklist (Hello, 11-24):** Pages kill mid-copy,
  and a copy over 800 MB (1.2 GB target). No emulator on this box can show
  either (see the Evidence note).
- **Shared AI key (Hello, 11-25):** the dev `.env` and every local mm-* container/image carry the PROD free-tier Gemini and DeepSeek keys. Every real-answer cell (Assistant answer, loading, kill mid-answer) waits for a dev-only key; the cleanup of the local containers/images is on the owner's disk list.
- **SafeZone pictures:** 200 %, Dark and the widths need an iOS run (iOS cannot block a screenshot).
