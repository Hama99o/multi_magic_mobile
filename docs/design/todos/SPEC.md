# Todo — SPEC

**Status: SPECIFIED** (2026-11-16). The data layer is built and tested
(`src/api/todos.ts`, `src/screens/todos/useTodoMutations.ts`); the screens are
not built yet. The owner asked for the Todo app (via Hello, 2026-11-16): *"start
todo app also put it there"*, then *"check well what they want and we should
add these apps also very well"* and *"make sure we work well on design"*.

The bar: everything the web's Todos does, plus what people expect from the best
to-do apps (Todoist, TickTick, Things, Microsoft To Do), in the same family as
Notes, Contacts and SafeZone. There is no "open it on the web" escape hatch.

---

## A · Web parity: every feature the web has

Read from multi_magic `0986d1e4`: `app/javascript/pages/todos/**`, the
`TodoApp` controllers, models and serializers.

| # | Web feature (file) | Server | Mobile | Status |
|---|---|---|---|---|
| A1 | Lists as cards: name, done/total, progress, overdue count, 3 pending tasks as a preview (`GroupCard.tsx`) | `GET todo_groups` 20/page, `updated_at desc`, `todos_count` `completed_count` `pending_count` `overdue_count` `preview_todos` | List rows on the Todo home | API ✅ |
| A2 | Tick a task straight from a card's preview (`GroupCard.tsx`) | `PUT todos/:id/toggle` | Tick from the preview, optimistic | API ✅ hook ✅ |
| A3 | Search the lists (`Index.tsx`, debounced 400 ms) | `?search=` (list names) | Search field, 300 ms like SafeZone | API ✅ |
| A4 | New list (`CreateGroupDrawer.tsx`) | `POST todo_groups` | `NameDialog`, then the new list opens | API ✅ |
| A5 | Open a list: every task in its order (`GroupDrawer.tsx`) | `GET todo_groups/:id`, `position asc` | List screen | API ✅ |
| A6 | Rename the list | `PUT todo_groups/:id` | ⋯ › Rename (NameDialog) | API ✅ hook ✅ |
| A7 | Progress: done/total and a bar | counts | Progress bar under the title | — |
| A8 | Add a task (Enter adds, the field stays) | `POST todos` (`todo_group_id` beside `todo`) | Quick-add bar, stays open for the next one | API ✅ hook ✅ |
| A9 | Tick / untick | `PUT toggle` | Checkbox and swipe right | API ✅ hook ✅ |
| A10 | Edit a task's title inline | `PUT todos/:id` | In the task sheet | API ✅ hook ✅ |
| A11 | Priority none/low/medium/high, a coloured dot | `priority` enum | Flag in the row, chooser in the sheet | API ✅ hook ✅ |
| A12 | Due date, chip red when overdue, amber within 2 days | `due_date`, `overdue` | Date chip in the row, chooser in the sheet | API ✅ hook ✅ |
| A13 | Notes on a task | `notes` | Notes field in the sheet | API ✅ hook ✅ |
| A14 | Delete a task | `DELETE todos/:id` (a hard delete) | Swipe left or the sheet, with **Undo** | API ✅ hook ✅ |
| A15 | Drag to reorder | `PUT todos/reorder` | Long-press and drag (B9); Move up/down in the sheet as the accessible path | API ✅ hook ✅ |
| A16 | Clear completed | `DELETE clear_completed` | ⋯ › Clear completed (confirm) | API ✅ hook ✅ |
| A17 | Reset the list (untick all) | `POST reset` | ⋯ › Uncheck all | API ✅ hook ✅ |
| A18 | Duplicate the list | `POST duplicate` | ⋯ › Duplicate, then the copy opens | API ✅ |
| A19 | Save as template | `POST save_as_template` | ⋯ › Save as template | API ✅ |
| A20 | Delete the list (inline confirm) | `DELETE todo_groups/:id` | ⋯ › Delete (Alert naming the list and its count) | API ✅ hook ✅ |
| A21 | Templates: list, new, edit (name, one task per line, repeat none/daily/weekly/monthly × interval), delete, apply (`TemplatesDrawer.tsx`) | `templates` CRUD, `apply` | Templates screen and form | API ✅ |
| A22 | Recurring templates make fresh lists on their own | `generate_due_for!` on the lists index | Nothing to build: the server makes them when the lists load | ✅ |
| A23 | A global-search hit opens the list on that task (`?task=`) | — | `multimagic://todos/list?id=&task=` highlights the row (`inAppRoute.ts`) | — |
| A24 | Loading skeletons, an empty state, a load error with Retry | — | `skeleton.tsx`, the empty state, `LoadFailure` | — |

## B · What people expect from the best apps

| # | Expectation (who does it) | Server today | Decision |
|---|---|---|---|
| B1 | Quick add from the list, chips for Today / Tomorrow / date / priority above the keyboard (Todoist 08, Evernote 09) | ✅ | **MUST** |
| B2 | Due date in one tap: Today, Tomorrow, Next week, pick a day (Evernote 12) | ✅ date | **MUST** |
| B3 | A due time and a reminder notification (Todoist 11, Evernote 12) | ❌ no field | **MUST, needs the server PR** (§E). Local notifications, like note reminders (`reminderNotifications.ts`) |
| B4 | Priority in one tap with colour (Todoist, Evernote's High/Medium/Low chips) | ✅ | **MUST** |
| B5 | Today / Upcoming / Overdue views across every list (Todoist 14, Things) | ✅ `GET todos?completed=false` returns every pending task with `due_date`, `overdue` and `todo_group_id` | **MUST**, grouped on the phone |
| B6 | Swipe right to complete and left to delete, with Undo (Structured 18, MyFitnessPal 17, Mail) | ✅ | **MUST** |
| B7 | Undo after delete and after tick | ✅ by re-creating then reordering (delete is hard on the server) | **MUST** |
| B8 | Completed tasks folded away: "Done (3)" (Amie 05, Tiimo 15) | ✅ | **MUST** |
| B9 | Drag to reorder | ✅ | **MUST** (long-press drag; Move up/down for accessibility) |
| B10 | Search across tasks, not only list names | ✅ `GET todos?search=` (tasks and list names) | **MUST**: the search shows matching lists and matching tasks |
| B11 | Haptics on tick, delete and reorder | — | **MUST** (`expo-haptics`, as Home) |
| B12 | Works offline: what was loaded stays, writes retry | React Query | **MUST** (cache and `LoadFailure`, as every app here) |
| B13 | Subtasks / a checklist inside a task (Todoist 11) | ❌ | **LATER**: a new table and API; the web has none |
| B14 | A task that repeats (every Monday) | ❌ (templates repeat whole lists: A21) | **LATER**: per-task recurrence needs the server. Recurring lists are there now |
| B15 | Move a task to another list | ❌ refused on purpose (`todo_params`, the IDOR note) | **LATER**: needs its own endpoint checking both lists |
| B16 | Labels / tags on tasks | ❌ | **LATER** |
| B17 | A widget, Siri, share-to-Todo | — | **LATER** |
| B18 | Quick add from the Today view (choose the list) | ✅ | **SHOULD** |
| B19 | Sort a list by due date or priority | ✅ (client side) | **SHOULD** |
| B20 | Natural-language dates ("tomorrow 5pm") in quick add | — | **SHOULD** |

## C · References (Mobbin, 2026-11-16)

The images are in `references/` (gitignored: other companies' screenshots; this
repo is public). The links do not expire.

**Todo home and lists**
- 01 Amie, lists: <https://mobbin.com/screens/46131292-47a1-47fd-9072-6bcc876e5629>. **Take:** one calm row per list, a progress ring as the icon, the count in muted ink beside the name, rows on the page ground with generous height. **Not:** its floating black pill; we have our header.
- 02 Asana, home: <https://mobbin.com/screens/0181c618-16c6-4cfb-808e-fe2ba2207a4d>. **Take:** the Completed / Overdue / Due tiles, the overdue number in red. That becomes our Today / Upcoming / Overdue cards at the top.
- 03 Liven: <https://mobbin.com/screens/830acd26-9c41-4a51-a754-0ce158b73563>. **Take:** "3 of 4 completed" in words at the section's right, a strikethrough with a filled check. **Not:** emoji per task.

**Inside a list**
- 04 Amie, a list: <https://mobbin.com/screens/cc46020c-5386-4374-b00a-3b406c57ad63>. **Take:** square checkbox rows, the date chip at the right in a muted pill, notes as one muted line under the title.
- 05 Amie, dark, done folded: <https://mobbin.com/screens/b9163ae3-b642-4262-9c00-6d801ff5df19>. **Take:** "Hide 9 done" folding the completed tasks under the open ones, filled checks in the app colour. Proof the layout holds in dark.
- 06 Todoist, inbox: <https://mobbin.com/screens/5500be47-8364-4359-930a-482a5b93dade>. **Take:** a round check with the date under the title in colour (green today, purple later), and a FAB at the bottom right. We keep a square check (our Notes checklist is square), and the colour rule.
- 07 Attio, grouped: <https://mobbin.com/screens/24d97071-f951-4c50-b21a-cabe794fe10e>. **Take:** an overdue date in a red-tinted chip, an upcoming date in a neutral one, and section headers with a count ("Today 3").

**Quick add**
- 08 Todoist: <https://mobbin.com/screens/8bca895b-61a1-4602-9afc-94580cca3b00>. **Take:** a sheet on the keyboard with the title field and a row of chips (date, priority, reminder). The list it goes into is shown under it.
- 09 Evernote: <https://mobbin.com/screens/d3cd8b8b-34c1-4a60-8620-883f63b18589>. **Take:** "Due today" and "Due tomorrow" as one-tap chips above the keyboard.
- 10 Tiimo: <https://mobbin.com/screens/f25b2340-407a-4581-b29d-2705b2f377b7>. **Take:** a Done key that closes the keyboard without adding. **Not:** a full form for a quick add.

**Task detail**
- 11 Todoist: <https://mobbin.com/screens/0f0c1a8f-0c94-44b5-a08c-3004f047b82d>. **Take:** a sheet with the check and title on top, then rows with a leading icon: notes, list, date, priority, reminder. One row per property, 56 dp, the value in ink.
- 12 Evernote: <https://mobbin.com/screens/93fe731d-5dea-41d7-967b-dfa4fb0994a0>. **Take:** the High / Medium / Low chips in a row, and "Delete task" as a full-width danger button at the very bottom, away from the rest.
- 13 ClickUp: <https://mobbin.com/screens/84eb5561-df0d-4416-94bf-f5d5ba135874>. **Take:** the list's name small above the title, for context. **Not:** status and assignees (none here).

**Today / Upcoming / Overdue**
- 14 Todoist, Today: <https://mobbin.com/screens/7ff218cf-1ddd-47ee-9123-72535e5f9283>. **Take:** "Overdue 4" first with red dates, each task carrying its list's name, then Today.
- 15 Tiimo: <https://mobbin.com/screens/35186446-384e-4887-a73e-03e8bc79b58d>. **Take:** section pills with a count, "Done (1)" folded at the end, "1/8" progress at the top.
- 16 Superlist: <https://mobbin.com/screens/3e9c7d4b-c7cc-4251-bbb3-4aea6b29d40d>. **Take:** a big title, a collapsible group, and a quiet "New task" pill at the bottom.

**Swipe**
- 17 MyFitnessPal: <https://mobbin.com/screens/72032ea6-066e-4745-90a6-3b0c9ad9a885>. **Take:** the red Delete revealed under the row as it slides.
- 18 Structured: <https://mobbin.com/screens/dc6bace8-91e7-4ebc-8f7e-49c2e7ab38bf>. **Take:** swipe right means complete (green, a check) and swipe left means delete (red). The same direction in every app.

## D · The design

**One family with Notes, Contacts and SafeZone.** The header is the same: ‹,
a title, one or two icon buttons (`app/safezone/index.tsx`). It uses the same
`Screen`, `Text` variants, `LoadFailure`, `UnreadableNotice`, `ActionSheet`
(`src/screens/contacts/ActionSheet.tsx`), `NameDialog`
(`src/screens/pages/ItemSheet.tsx`), `ChoiceSheet` and `MonthGrid`
(`src/screens/calendar/`), and `KeyboardPadding` under every field. The FAB is
SafeZone's: 56 dp, the app colour, a `Plus`.

**Colour: no new colour.** Every colour comes from `src/theme/tokens.ts`.
- **The app colour (Home tile, FAB, ticks, progress):** the icon has eight
  colours and nine apps already use them (`appColors.ts`). Proposed: Todo takes
  **ORANGE `#e9ab4c`** (shared with Notifications) and Finance takes **GREEN
  `#77b87d`** (shared with Contacts; money reads as green). Owner's call, see
  the summary. The glyph on the badge is the shared `#04161a`; the contrast
  test (`appColors.test.ts`) covers both.
- **Priority:** low = BLUE `#49b4e4`, medium = ORANGE `#e9ab4c`, high =
  `colors.danger`. The same order as the web's sky / amber / red, from our
  tokens.
- **Dates:** overdue = `colors.danger` text on `danger` at 12%; today and
  within 2 days = ORANGE at 16%; later = `inkMuted` on `surface`.
- Ticked: the check filled in the app colour, the title in `inkMuted` with a
  strikethrough.

**Type:** `title` 26/32 for the screen; a list name in its row `body` 16 with
weight 600; a task title `body` 16; meta (date, list name, count) `caption`
13; section headers `label` 14 in `inkMuted`, upper case for the Today view's
groups.

**Space:** `metrics.space` only (xs 4, sm 8, md 12, lg 16, xl 24). Rows are at
least 56 dp; touch targets at least `metrics.touch` (44). The checkbox's hit
area is 44 even though the box is 22. 16 dp side gutter, as every screen here.

**Icons (lucide, through `src/components/icons.ts`):** `ListChecks` for the
app, `Circle`/`CircleCheck` for progress, `Square`/`SquareCheck` for the
check, `Flag` for priority, `Calendar` for the date, `Bell` for the reminder,
`LayoutTemplate` for templates, `Repeat`, `Copy`, `RotateCcw` for uncheck all,
`Eraser` for clear completed, `Trash2`, `GripVertical` for the drag handle.

**Screens**
1. **Todo home** (`app/todos/index.tsx`). Header: ‹ Todo, then Search and
   Templates. Three cards side by side: Today, Upcoming and Overdue, each with
   its count (Asana 02); Overdue's count is in `danger` when above 0. Then
   "My lists": one row per list with a progress ring, the name, "3 of 5" in
   muted ink and an overdue chip, newest first and paged (Amie 01). Pull to
   refresh. FAB: New list.
2. **Search** (inline on the home): the field slides in under the header.
   Results show Lists (matching names) and Tasks (matching titles and notes,
   each with its list's name).
3. **A list** (`app/todos/list.tsx?id=`). Header: ‹, the list name (tap to
   rename), ⋯ (Rename, Uncheck all, Clear completed, Duplicate, Save as
   template, Delete). A thin progress bar and "3 of 5 done". Open tasks in the
   list's order; "Done (n)" folded under them (Amie 05). The quick-add bar is
   pinned at the bottom: the title field, then chips for Today, Tomorrow, 📅
   and ⚑ (Todoist 08 + Evernote 09). Return adds and keeps the keyboard up for
   the next task.
4. **A task** (sheet over the list, Todoist 11): the list name small on top
   (ClickUp 13); the check and the title, editable; rows for Notes, Due date
   (Today / Tomorrow / Next week / pick a day / clear), Reminder (with the
   server PR), Priority (None / Low / Medium / High chips, Evernote 12), and
   Move up / Move down; Delete task at the bottom in `danger`.
5. **Today / Upcoming / Overdue** (`app/todos/due.tsx?view=`): every pending
   task across the lists, grouped (Overdue, Today, Tomorrow, then by day), each
   row with its list's name (Todoist 14). It has the same check, swipe and
   sheet as a list.
6. **Templates** (`app/todos/templates.tsx`) and a template form
   (`app/todos/template.tsx`, a modal like `contacts/edit`): name, tasks one
   per line, Repeat (ChoiceSheet: never / daily / weekly / monthly) and every
   N. A row's actions: Use (opens the new list), Edit, Delete.

**Empty states** (SafeZone's pattern: an 88 dp tinted circle, an icon, a
title and one line):
- no lists: "Make your first list", with a New list button;
- an empty list: "Nothing here yet", and the quick-add bar is already focused;
- every task done: "All done" with a check, and Done (n) below;
- Today empty: "Nothing due today";
- search with no match: "No list or task matches".

**Motion**
- Rows enter with `FadeInDown`, staggered 35 ms up to 10 (SafeZone).
- Reorder and fold/unfold use the `LinearTransition` layout animation.
- Delete uses `FadeOut` plus a height collapse, then the Undo bar slides up for 5 s.
- Tick: the box springs 0.85 → 1, the check draws, the title strikes through,
  `Haptics.notificationAsync(Success)`. The row waits 600 ms before folding
  into Done, so a mistaken tap can be undone where it is.
- Swipe: `ReanimatedSwipeable` from gesture-handler. Right reveals the app
  colour with a check, left reveals `danger` with a bin; a full swipe acts,
  with a selection haptic at the threshold.

**Light and dark:** tokens only, so both come from one set. Every screen is
checked in both on the device (§F).

## E · The server PR needed for a MUST (not merged; the owner decides)

**B3, due time and reminder.** `todo_app_todos` has only `due_date`. The PR on
a multi_magic branch would:
- add `remind_at :datetime` (null by default);
- permit it in `todo_params` and send it from `TodoSerializer`;
- add a request spec.

The web is untouched and nothing changes for it. The phone schedules a local
notification at `remind_at`, as `reminderNotifications.ts` does for notes, and
tapping it opens the list on that task. **Until the PR is deployed** the phone
reads the field's absence from the server's answer and hides the Reminder row,
so this branch works against today's production.

## F · How it is checked

- Test-first: the API (`src/api/__tests__/todos.test.ts`, 14) and every
  optimistic write both ways (`useTodoMutations.test.tsx`, 11) are green. Next
  come the screen tests (RNTL), the i18n key tests, and the a11y test covering
  the new screens.
- Gates: tsc, lint (with `api-in-effect`), `lint:vocabulary`, full jest, bundle.
- Device: every flow on the emulator against the QA server (invented data).
  Screenshots of every screen in light and dark, at 360, 411 and 800 dp, side
  by side with the references, in one contact sheet. Anything off is fixed
  before the owner sees it.

## Summary: MUST / SHOULD / LATER

- **MUST:** A1–A24 (full web parity), B1–B12.
  - B3 (due time and reminder) depends on the server PR. Until it is deployed, the Reminder row is hidden.
- **SHOULD:** B18 (quick add from Today), B19 (sort by date or priority), B20 (natural-language dates).
- **LATER:** B13 (subtasks), B14 (per-task repeat), B15 (move to another list), B16 (labels), B17 (widget/Siri).
  - Each needs new server work, and the web has none of them.
