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
| Flow (ff) | PASS 11-20 [F-off] | PASS 11-25 [FF-slow]: list, board and card with every call +1.5 s | PASS 11-21 [F-200] | PASS 11-20 [F-dark] | PASS 11-25 [FF-rtl]: a Persian project and card title (renamed on :3030; Maestro cannot type Persian) read right in the list, the board, the card, light and dark | PASS 11-25 [FF-2x]: a double-tapped Create made ONE project (read-only SQL) | PASS 11-25 [FF-kbd]: the new-project sheet and the quick add above the keyboard | PASS 11-20 [F-360] | PASS 11-20 [F-411] | PASS 11-20 [F-800] | PASS 11-20 empty [F-empty]; 11-25 error ("Could not load your projects." + Try again) and recovery [FF-st] | N/A: Flow asks no permission | PASS 11-25 [FF-kill]: killed with a card half-typed in the quick add: the board comes back, 0 such cards (read-only SQL) |
| Notes (ff) | PASS 11-25 [FN-off]: an edit offline says "On this phone only", back online "Saved"; a note never opened online offers a named Try again (f0aa731) | PASS 11-25 [FN-slow]: every call +1.5 s, "Saving…" then "Saved" | PASS 11-25 [FN-200]: body text scaled, was not (857b6b2) | PASS 11-21 [N-dark] | PASS 11-13 [N-rtl] | PASS 11-21 [N-2x] | PASS 11-13 [N-kbd]; re-checked 11-24 after 53b9793 [K-69] | PASS 11-21 [N-360] | PASS 11-21 [N-411] | PASS 11-21 [N-800] | PASS 11-25 [FN-st]: loading keeps the prefetched rows; error with Try again; recovery | PASS 11-25 [FN-perm]: mic refused says so, the note keeps working | PASS 11-25 [FN-kill]: text typed before a force-stop is in the note |
| Search (ff) | PASS 11-25 [FS-off]: "Could not reach MultiMagic." + Try again, never "No results" | PASS 11-25 [FS-slow]: spinner, then grouped results | PASS 11-25 [FS-200]: titles end in "…", type labels stay on the row | PASS 11-21 [S-dark]; re-checked 11-25 [FS-w] | PASS 11-25 [FS-rtl]: Persian rows read right; a Persian query (via the `q` route) in the field; Persian TYPED is on the real-phone list | N/A: search writes nothing | PASS 11-25 [FS-kbd] | PASS 11-21 [S-360]; re-checked 11-25 [FS-w] | PASS 11-21 fr [S-411] | PASS 11-21 [S-800]; re-checked 11-25 [FS-w] | PASS 11-21 empty [S-empty]; 11-25 loading and error ("Search did not answer." + Try again) and recovery [FS-st] | N/A: no permission | PASS 11-25 [FS-kill]: Recent kept after a force-stop |
| Shell: Home, header, Apps sheet, sheet frame (ff) | PASS 11-25 [FH-off]: Home and the Apps sheet draw from the phone (no offline banner was up: nothing had failed yet, not claimed) | PASS 11-25 [FH-w]: every call +1.5 s | PASS 11-21 Home [H-200b]; 11-25 the APPS SHEET was FAIL ("SafeZo…", "Doc To…Contac…Calend…" [FH-200-before]), fixed 2a44268: 3 columns, names whole [FH-200] (the lower rows below the fold not yet photographed) | PASS 11-25 [FH-w] | N/A: no user text | N/A | N/A | PASS 11-25 [FH-w]: the sheet scrolls, 4th row under the fold | PASS 11-25 [FH-w] | PASS 11-20 header slot [H-800]; 11-25 the sheet as a centred dialog [FH-w] | PASS 11-25 [FH-st]: calendar 500, Home whole, "Coming up" hidden by design | N/A | PASS 11-25 [FH-kill]: killed with the sheet open, comes back closed, no stuck scrim, reopens |
| Tables (88) | PASS 11-21 flow 37: offline failure, then Try again recovers [T-man] | PASS 11-25 [FT-w]: bases, table, row with every call +1.5 s (skeleton rows while loading) | **FAIL 11-21** pills cut at 411; fixed b5dfdf9, **re-checked 11-25 PASS** [FT-200]: the table pills whole, cards and row page scale. Nit: the sort chips cut at the screen edge ("Recently ch…"), reachable by swiping | PASS 11-25 [FT-w]: bases, table, row at 411 and 800 | PASS 11-25 [FT-rtl]: an invented Persian base, table, columns and rows (API fixture on :3030, deleted after), 411, dark, 360 | PASS 11-21 flow 37: a double tap on Add a row made one row, 25 → 26 [T-man] | PASS 11-21 delete-by-name sheet and field editor, keyboard up [T-man]; form title and activity Send re-checked 11-24 after 53b9793 [K-69] | PASS 11-25 [FT-w]; the sort chips hid A–Z off-screen, fixed 1d01f97 (they wrap), re-shot [FT-chips] | PASS 11-21 flows 33, 35 (:3001), 37 [T-man] | **FAIL 11-21** + over the summary; fixed b5dfdf9, **re-checked 11-25 PASS** [FT-800]: the + sits below the summary, "3 rows · 3 filled · 1 filled" visible, light and dark | PASS 11-25 [FT-st]: "Could not load your bases." + Try again, and recovery (Jest: import, answers, empty grid) | NOT MEASURED (a viewer needs a 2nd account; two-person checks wait for demo.env) | PASS 11-25 [FT-kill]: killed with a row open; and killed mid-EDIT of a field (typed, not saved): the stored value unchanged, read-only SQL [FT-kill-write] |
| Contacts (ff) | PASS 11-25: "Could not reach MultiMagic. Showing what we had from 2 min ago" + Try again, list kept (shot off-repo*) | PASS 11-25 (off-repo*) | PASS 11-21 [C-200]; 11-25 the two-line row (name + phone) holds at 200 % (off-repo*) | PASS 11-25 (off-repo*) | N/A in the UI chrome; Persian contact names not seeded on :3030 (NOT MEASURED) | PASS 11-21 [C-2x]; re-checked 11-25, 1 row then deleted for ever (read-only SQL) | PASS 11-21 [C-kbd] | PASS 11-25 (off-repo*) | PASS 11-21 [C-200] | PASS 11-25: master-detail, "Select a contact" (off-repo*) | PASS 11-21 empty book [C-empty]; 11-25 error ("Search 0 contacts" was FAIL, fixed 39e745e) + recovery + empty search [FC-st] | PASS 11-25 [FC-perm]: contacts refused says so, Open Settings | PASS 11-25: killed mid-form, 0 rows half-saved (read-only SQL; shot off-repo*) |
| Finance (88) | PASS 11-25 [FF2-off]: banner, "Could not reach MultiMagic. Showing what we had from 2 min ago" + Try again, list kept | PASS 11-25 [FF2-w] | PASS 11-25 [FF2-w]: list, keypad, empty month; the tab row shows Expenses whole and "Inco…" peeking (53b498f) [FF2-tabs] | PASS 11-25 [FF2-w] | PASS 11-25 [FF2-rtl]: an invented Persian expense name reads right | PASS 11-25 [FF2-2x]: a double-tapped Save made ONE expense (read-only SQL) | PASS 11-25 [FF2-kbd]: Save above the keyboard on the name field | PASS 11-25 [FF2-w]; the tab row hid Budgets off-screen, fixed 9ad6411 + 53b498f: the selected tab whole and the next peeks by half under a fade [FF2-tabs] | PASS 11-25 [FF2-w]; tab row: Overview, Expenses, Income whole, "Loa…" peeks [FF2-tabs] | PASS 11-25 [FF2-w]: the entry as a centred sheet | PASS 11-25 [FF2-st]: error "Could not load these entries." + Try again, recovery; empty month "Nothing spent in January" | N/A: Finance asks no device permission | PASS 11-25 [FF2-kill]: a new expense half-entered then killed, 0 rows (read-only SQL)  |
| Doc (ee) | PASS 11-25 [FF-off]: offline says "MultiMagic could not be reached…"; Change file re-reads once back (86, 87c) | PASS 11-25 [SLOW]: flows 48, 49 ×5 | PASS 11-24 [D-200] | PASS 11-24 [D-dark] | **FAIL 11-25** (server, ee): a Persian PDF draws right, but `pdf/text` returns RTL runs in VISUAL order, so "Lines on this page" and the edit field show the letters reversed [FF-rtl]. multi_magic, not the app | PASS 11-25 [FF-2x]: a double tap on Save PDF gives one result, 1 POST pdf/edit at the proxy (85) | PASS 11-24 [D-kbd]: the edit-line sheet keeps Done above the keyboard (was FAIL 11-21; fixed 53b9793, red-first Jest) | PASS 11-24 [D-w] | PASS 11-24 [D-w] | PASS 11-24 [D-w] | PASS 11-25 [FF-st]: loading (busy card, 87); error says the app's own words, **was FAIL** (Rails' "Internal Server Error"), fixed red-first 339f8b0 (87b); Change file recovers (87c). A read failure offers no Retry (by design, ErrorLine: busy only). Busy 503 NOT MEASURED (flow 50 needs 83's slot) | PASS 11-25 [PERM]: Convert's camera refused says "No access" | PASS 11-25 [FF-kill]: force-stop mid-read, the relaunch is usable and nothing stays busy (88). Kill mid-save NOT MEASURED (real phone) |
| Pages (ee) | PASS 11-24 [P-off]: offline the upload waits, back online it arrives | PASS 11-25 [SLOW]: flows 30, 35, 37 with every API call +1.5 s | PASS 11-24 [P-200]: names whole, dates truncate; 11-25 the page EDITOR's text scales at 411 and 360 (857b6b2) [FP-200] | PASS 11-24 [P-dark] | PASS 11-24 [P-rtl] | PASS 11-24 [P-2x]: one folder per double tap, 3 runs, 3 folders | PASS 11-24 [P-kbd]: text-file Save and the page editor's toolbar above the keyboard (was FAIL 11-21; fixes 4124956, 53b9793) | PASS 11-24 [P-w] | PASS 11-24 [P-w] | PASS 11-24 [P-w] | PASS 11-24 empty folder [P-empty]; loading, error NOT MEASURED | PASS 11-25 [PERM]: camera refused says "No access" and the way out | PASS 11-24/25 kill mid-UPLOAD resumes, no copy left [P-kill], re-checked under a real force-stop 11-25; kill mid-COPY **NOT MEASURED** on the AVD (real-phone RC list)  |
| Assistant (ee) | PASS 11-25 [A-off]: "Could not reach MultiMagic", Try again, the question kept | NOT MEASURED | PASS 11-25 [A-w] | PASS 11-25 [A-w] | PASS 11-25 [RTL]: a Persian question and reply (seeded, invented) | PASS 11-25 [A-2x]: one bubble, one POST | PASS 11-25 [A-2x]: composer above the keyboard | PASS 11-25 [A-w] | PASS 11-25 [A-w] | PASS 11-25 [A-w] | PASS 11-25 start state, offline error, memory card absent [A-st]; an ANSWER and its loading **NOT MEASURED** (shared-key rule) | PASS 11-25 mic refused said, still typeable [A-perm] | PASS 11-25 a typed draft survives a force-stop [K-78]; kill mid-ANSWER **NOT MEASURED** (shared-key rule) |
| Chats (ee) | PASS 11-25 [Ch-off]: "Could not reach MultiMagic. Showing what we had", Try again, the list kept | PASS 11-25 [SLOW]: flows 66, 67 | PASS 11-25 list and thread [Ch-w] | PASS 11-25 list and thread [Ch-w] | PASS 11-25 [RTL]: a Persian message in the list and the thread | PASS 11-25 [FF-2x] after a fix: **was FAIL** (a double tap on a row pushed two threads; raw adb taps too), fixed red-first e0a36c2 (83) | PASS 11-25 thread composer and Send above the keyboard, draft never sent [Ch-kbd]; new-conversation sheet PASS 11-24 [K-69] | PASS 11-25 [Ch-w] | PASS 11-25 [Ch-w] | PASS 11-25 [Ch-w] | PASS 11-25 empty list [Ch-empty]; ask-the-assistant from a thread composed, unsent [Ch-ask]; loading PASS 11-25 [FF-st] (kept list or skeleton; the thread opens on the last message it knew, 80); list error + Try again PASS (81, 81b); thread error **was FAIL** (a seeded thread failed silently), fixed red-first c92a55c (82, 82b) | PASS 11-25 [PERM]: mic refused said, still typeable | PASS 11-25 [K-78]: the draft survives a force-stop. **Was FAIL the same night** (lost: useState only); fixed red-first in app/chat/[id].tsx, test chat-thread.draft.test.tsx . Stray "typing…" after the relaunch (my own echo + the restored draft announcing typing) fixed red-first 005aee1; 78 now asserts its absence [FF-kill] |
| SafeZone (ee) | PASS 11-25 [Z-off]: the right PIN offline gives a notice, stays locked, not counted wrong | PASS 11-25 [SLOW]: flows 70, 73 | NOT MEASURED by picture (FLAG_SECURE blacks Android shots, by design); view tree PASS 11-25 [Z-lay] | NOT MEASURED (FLAG_SECURE; colours need a picture, iOS) | PASS 11-25 [RTL] by the view tree: a Persian title listed (FLAG_SECURE: no picture) | PASS 11-25 [Z-2x]: one row, one POST | PASS 11-25 [Z-kbd]: Save reached by scrolling with the keyboard up | NOT MEASURED by picture (FLAG_SECURE blacks Android shots, by design); view tree PASS 11-25 [Z-lay] | NOT MEASURED by picture (FLAG_SECURE blacks Android shots, by design); view tree PASS 11-25 [Z-lay] | NOT MEASURED by picture (FLAG_SECURE blacks Android shots, by design); view tree PASS 11-25 [Z-lay] | PASS 11-25 locked, wrong PIN with attempts left, unlocked list, locked again [Z-st]; empty tab NOT MEASURED | N/A: SafeZone asks for no permission (grep of src/screens/safezone, app/safezone) | PASS 11-25 [Z-kill]: the owner's window rule (48de822): reopens inside 2 min, PIN after 150 s dead |
| Calendar (ff) | PASS 11-25 [FK-off]: banner "calendar changes need a connection"; month says "Could not reach MultiMagic." and never "Nothing on this day"; list shows what it had | PASS 11-25 [FK-w] | PASS 11-25 [FK-w] | PASS 11-25 [FK-w] | N/A: no user text in the grid; event titles are rows like any other (Persian rows in Search, 11-25) | PASS 11-21 one event from a double-tapped Save [K-2x]; re-checked 11-25 (1 row, read-only SQL) [FK-dst] | PASS 11-21 [K-kbd] | PASS 11-25 [FK-w] | PASS 11-21 [K-411] | PASS 11-25 [FK-w]: wide header, centred column | PASS 11-21 list + month views [K-411]; 11-25 error + recovery, the day never claims empty [FK-st]; **DST PASS 11-25** [FK-dst]: a weekly 09:00 reads 9:00 AM before and after 28 March 2027 (server 1a145681 on :3030) | N/A: Calendar asks for no device permission | PASS 11-25 [FK-kill]: killed mid-form, nothing half-saved (0 rows) |
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
- **[FN-*] Notes** (90–97, after 857b6b2 and f0aa731): `92b-notes-offline-edit`, `92c-notes-back-online`, `92d-notes-offline-uncached` [FN-off]; `95-notes-slow-saved` [FN-slow]; `97-notes-note-411-font200-fixed` [FN-200]; `90-notes-loading`, `91-notes-list-error`, `91b-notes-list-recovered` [FN-st]; `94-notes-mic-refused` [FN-perm]; `93-notes-after-kill` [FN-kill].
- **[FS-*] Search** (100–106): `102-search-offline` [FS-off]; `100-search-{loading,loaded}`, `105-search-slow` [FS-slow]; `105-search-411-font200` [FS-200]; `105-search-{411-dark,360,800}` [FS-w] (the first dark and 800 shots were of HOME — Gboard's stylus pill made hideKeyboard a Back — and are void; these are the re-runs, after `SHOTSCREEN`, 2d718b8); `106-search-persian-411{,-dark}` and the Persian rows in every shot [FS-rtl]; `103-search-keyboard` [FS-kbd]; `101-search-error`, `101b-search-recovered` [FS-st]; `104-search-recents-after-kill` [FS-kill].
- **[FK-*] Calendar** (47, 110, 111; server :3030 with 1a145681): `47-411-light-f1.0-online-dst-{0325,0401}` [FK-dst]; `47-411-light-f1.0-offline-{open,other-view}` [FK-off]; `47-411-light-f1.0-slow-other-view`, `47-411-dark-f1.0-view-open`, `47-411-light-f2.0-view-open`, `47-{360,800}-light-f1.0-view-open` [FK-w]; `110-calendar-error`, `110b-calendar-recovered` [FK-st]; `111-calendar-after-kill` [FK-kill]; `47-411-light-f1.0-online-keyboard`.
- **[FP-200] Pages editor:** `98-pages-editor-{411,360}-font200` (font_scale read back 2.0; an earlier 360 shot was really at 1.0 and is void).
- **[FH-*] Shell** (120–122): `120-{home,apps-sheet}-{411,411-dark,360,800,slow}` [FH-w]; `120-apps-sheet-411-font200-BEFORE-fix`, then `120-{home,apps-sheet}-411-font200-fixed` [FH-200]; `121-{home,apps-sheet}-offline` [FH-off]; `120-home-calendar-500` [FH-st]; `122-apps-after-kill` [FH-kill].
- **[FC-*] Contacts** (48, 130–132): `130-contacts-error` (after 39e745e), `130b-contacts-recovered`, `48-411-light-f1.0-view-list` [FC-st]; `131-contacts-import-refused` [FC-perm]. *The other Contacts shots of 11-25 show the invented seed contact under its first name, which carried the owner's surname; they stay in `/data/claude-qa-mm/ff-logs/contacts-1/` (looked at, contact sheet `contacts-1-sheet.png`), and the contact is renamed "[qa] Ana Test" on :3030 for the next re-shoot.
- `47-411-light-f1.0-online-keyboard` replaced 11-25 17:10: the first one showed Gboard's stylus-handwriting pill, not a keyboard.
- **[FF-*] Flow** (140–144): `141-flow-{projects,board,card}-slow` [FF-slow]; `141-flow-{projects,board,card}-rtl{,-dark}` [FF-rtl]; `140-flow-board-with-card` [FF-2x]; `140-flow-{project,quick-add}-keyboard` [FF-kbd]; `142-flow-error`, `142b-flow-recovered` [FF-st]; `143-flow-after-kill` [FF-kill]; `144-flow-after-cleanup` (every [qa-ff] project and card gone, read-only SQL).
- **[FT-*] Tables** (150–152, READ-ONLY, the :3030 QA account's two bases of two tables): `150-tables-{bases,table,record}-{411,411-dark,360,800,800-dark,slow}` [FT-w]; `150-tables-{bases,table,record}-411-font200` [FT-200]; `150-tables-table-800{,-dark}` [FT-800]; `151-tables-error`, `151b-tables-recovered` [FT-st]; `152-tables-after-kill` [FT-kill].
- **[FT-rtl] / [FT-kill-write] / [FT-chips] Tables** (153, 154; fixture `[qa] پایگاه آزمایشی` through the API on :3030, deleted after): `153-tables-rtl-{bases,table,record}-{411,411-dark,360}`; `154-tables-after-kill-mid-edit`; `150-tables-bases-{360,411-font200}-chips` (after 1d01f97).
- **[FF2-*] Finance** (160–164; three invented `[qa-ff]` expenses through the API on :3030, one Persian, one long): `160-finance-{list,entry,empty}-{411,411-dark,411-font200,360,800,slow}` [FF2-w]; `160-finance-list-411` [FF2-rtl]; `161-finance-after-double-tap` [FF2-2x]; `161-finance-keyboard` [FF2-kbd]; `162-finance-error`, `162b-finance-recovered` [FF2-st]; `163-finance-offline` [FF2-off]; `164-finance-after-kill` [FF2-kill].
- **[FF2-tabs] Finance tab row** on the RC (53b498f): `160-finance-list-rc-{411,360,font200}`. Forced RTL (`debug.force_rtl`) does not flip this app (en/fr, RTL not allowed): the left-edge peek is NOT MEASURED.
- **Fixed red-first this run:** 005aee1 (thread "typing…": my own echo, and a restored draft announcing typing), e0a36c2 (Chats row double push), c92a55c (seeded thread failing silently), 339f8b0 (Doc 5xx shown as Rails' English body); then 2ddebe6 (Doc read failure offers Retry, the owner's decision), 857b6b2 (note and page text ignored the system font size), f0aa731 (a note that cannot load hid its retry), 2a44268 (Apps sheet cut app names at 200 %), 39e745e (a failed Contacts load said "Search 0 contacts"), 1d01f97 (Tables sort chips hid A–Z off-screen), 9ad6411 + 53b498f (Finance tab row hid Budgets; the next tab now peeks).

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
