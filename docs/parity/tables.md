# Parity audit: Tables (web → mobile)

Read-only audit, 2026-11-20. Web = `~/Apps/Personal/multi_magic` (paths below are relative to it; `TA/` = `app/javascript/pages/table_app/`). Mobile = `~/Apps/Personal/mm-parity-audit` at `4dd5e8f release(1.3.0)`.

## Summary

- **Mobile today has nothing for Tables.** No route in `app/`, no screen in `src/screens/`, no client in `src/api/`, no entry in `src/apps/registry.ts:45-58`. The only trace is `app/notifications.tsx:11`: a `table_app.*` notification (path `/tables/…`) has no screen, so tapping it writes a question for the assistant and does not send it. (`grep -ri table` in `app/ src/api` finds only notes tables, tablet and comments.)
- **The web is big.** `TA/` is 49 tsx/ts files and about 16.3k lines (TableScreen 1,783, FormBuilder 1,047, Grid 1,003). On top of that: about 640 lines of `tableApp.*` i18n and 166 of `tableForms.*` (en/fr), plus the public form's own ps/fa/ar strings (`app/javascript/i18n/locales/tableForms.public.{ps,fa,ar}.ts`). The server has 11 controllers (`app/controllers/api/v1/table_app/`, 1,205 lines), 1 public controller, 12 models, 26 services, 6 jobs and 3 serializers.
- **Tables runs on the Core field layer** (`app/models/core/field_definition.rb`, `field_value.rb`, `field_record_selection.rb`, `field_attachment.rb`; docs/TABLE_APP.md:73-91). Mobile has no Core field renderer or editor, because Tasks and Finance do not use Core. So the **16 field-type renderers and editors are new code on mobile** and the foundation of everything else. They can be reused later for Flow cards.
- **The web already designs for a phone.** Below 720 px wide (`TA/TableScreen.tsx:63,1080`) it swaps the grid for a **card list + full-screen record sheet** (`CardList.tsx:34-39`, `RecordSheet.tsx:66-70`). Filter & sort and Fields become sheets (`TableToolbar.tsx:23-31,73-77`, `FieldsPanel.tsx:25-30`). Kanban swipes one column per screen (`KanbanBoard.tsx:39-45,146,171`). Calendar becomes a small month with the chosen day's rows listed under it (`CalendarView.tsx:45-50,178`). Gallery uses one column (`GalleryView.tsx:31-35`). **The native app should copy the web's phone mode, not its grid.**
- **The server is already phone-ready.** Search, filter (every operator, AND/OR), multi-sort, group-by with real group counts, offset paging (default 200, max 500, `total_count` on the first page) and a summary endpoint all run in SQL (`records_controller.rb:5-37`).
  - **Main API gap: import type-guessing runs in the browser with SheetJS** (`ImportPanel.tsx:72-81`, `importGuess.ts`). Mobile needs a server preview/guess endpoint, or has to bundle `xlsx`.
- **AI:** the web has no Tables-specific AI button. Its AI is the global assistant plus the `tables_*` MCP/assistant tools (`app/services/ai/actions/tables_*.rb`) and the `tables` app scope (`app/services/ai/app_scope.rb:24`). The mobile assistant already talks to the same server, so the AI layer is mostly there already. What is missing is the entry points: "Ask about this table" with the scope set, and importing a file attached in chat (`tables_import_file`, chat only).
- **No realtime anywhere.** No ActionCable channel for Tables; the web refetches. Parity needs none.
- **Size:** 9 increments, about 25 phone screens and sheets, **about 65–85 dev-days** to full parity. The first shippable value (browse + edit rows) arrives after increments 1–2, about 15–18 days.

## Field types

`app/javascript/types/table_app.ts:160-177` (16 types, icons `TA/fieldTypes.ts:23-40`). Web renderer: `TA/components/cells.tsx` (`cellText` :46, `CellView` :97). Grid editor: `CellEditor` :258. Sheet/form editor: shared `components/core/DynamicField.tsx`. Filter kind: `TA/filters.ts:23-36`.

| # | Type | Web display (cells.tsx) | Web editor | Read-only? | Default value? (`types/table_app.ts:191`) | Phone renderer → editor |
|---|---|---|---|---|---|---|
| 1 | `text` | text, more lines in taller rows (`rowStyle.ts:25`) | input (`DynamicField.tsx:87`) | no | yes | Text → TextInput |
| 2 | `long_text` | wraps; "expand" | textarea (`DynamicField.tsx:100`), Shift+Enter in grid (`cells.tsx:301`) | no | yes | 3-line clamp → full-screen multiline editor |
| 3 | `decimal` | locale number (`cells.tsx:83,156`) | number input (`DynamicField.tsx:162`) | no | yes | right-aligned → `keyboardType="decimal-pad"`, locale parse (fr comma) |
| 4 | `phone` | text + green WhatsApp button `wa.me` (`cells.tsx:175-198`) | tel input (`DynamicField.tsx:113-144`) | no | yes | text + WhatsApp/call buttons (`Linking`) → `phone-pad` |
| 5 | `email` | text + mailto (`cells.tsx:176`) | email input | no | yes | mailto → `email-address` keyboard |
| 6 | `url` | text + open link (`cells.tsx:177`) | url input | no | yes | open in browser → `url` keyboard |
| 7 | `single_select` | coloured chip (`cells.tsx:101`) | searchable combobox, "+ Create «X»" (`SelectCellEditor.tsx`, `OptionPicker.tsx`; docs/TABLE_APP.md:182) | no | yes | chip → bottom-sheet list with search + create option (managers) |
| 8 | `multi_select` | chips (`cells.tsx:105`) | `MultiSelectCellEditor.tsx` / `MultiSelectPicker.tsx` | no | yes | chips → multi-check sheet |
| 9 | `date` | medium date (`cells.tsx:56`) | date input (`DynamicField.tsx:200`) | no | yes ("today") | → native date picker + Clear |
| 10 | `boolean` | ✓ / checkbox, Space toggles (`Grid.tsx:630`) | checkbox (`DynamicField.tsx:185`) | no | yes | Switch/checkbox, one tap |
| 11 | `created_time` | date-time (`cells.tsx:122`) | — | **yes** (`types/table_app.ts:179`) | no | muted text |
| 12 | `last_modified_time` | date-time | — | **yes** | no | muted text |
| 13 | `attachments` | names, or thumbnails 40/64/112 px in taller rows (`cells.tsx:127-136`, `AttachmentThumbs.tsx`) | `components/core/AttachmentPicker.tsx:52,66` → `POST/DELETE /core/field_attachments` | no | no | thumbnails strip → image/document picker + camera, upload with progress, delete; quota error sentence |
| 14 | `multi_record` (link) | chips with a hover preview card (`LinkChip.tsx:19-24`, `cells.tsx:204`) | `LinkPicker.tsx` (card per match, create + link, "N of M") | no | no | chips → tap opens a preview sheet → open the row; full-screen picker with server search |
| 15 | `lookup` | chips of the linked rows' values (`cells.tsx:160`) | — | **yes** (computed, `types/table_app.ts:181`) | no | chips, read-only |
| 16 | `rollup` | number; count/sum/avg/min/max (`types/table_app.ts:185`) | — | **yes** | no | number, read-only |

Field settings (`TA/components/FieldEditor.tsx`):
- name and description, shown in the sheet (:232-240)
- type picker with search by everyday words, e.g. "whatsapp" finds Phone (:148)
- coloured options, reorderable, from a 9-colour palette (:286, `fieldTypes.ts:47`)
- default value (:334, `DefaultValueInput.tsx`, `defaultValue.ts`)
- link target table and **relation type** 1–N / N–1 / 1–1 / N–N, shown as cards with a small diagram (:387-447)
- lookup / rollup: link column + target column + function (:345-369)
- "Use as title" with an impact confirm (`TableScreen.tsx:1029`; docs/TABLE_APP.md:186)
- duplicate with or without values (`fields#duplicate`)
- delete to a 30-day trash with Undo (`useColumnDelete.tsx:22-28`), restore (`DeletedFieldsPanel.tsx:22-26`)

Not built on the web, so no mobile work: formulas, autonumber, rating, currency, user/collaborator, barcode.

## Views

Types: `grid | kanban | calendar | gallery` (`app/models/table_app/view.rb:14`, `types/table_app.ts:81`). **Form is not a view type.** Forms are a separate resource; see the Forms section.

| View | Web | Phone mapping (proposal) | Phone-hard? |
|---|---|---|---|
| **Grid** | Own table rendering, windowed, frozen first column + row number (`Grid.tsx:127-136,356-423,782-791`), summary bar (:870-907), keyboard and clipboard (:587-630,917-931), resize (:823-840), group headers | **Default: the card list** like the web's own phone mode (`CardList.tsx`): title, coloured selects, 2–3 fields, row-colour bar, long press to select. **Later:** an optional landscape/tablet grid with horizontal scroll, sticky title column and tap-to-edit cell (no ranges, no keyboard). | Yes for the real grid |
| **Kanban** | One column per option + "Empty" with counts (`meta.groups`), SortableJS drag between and within columns, fold, "+ Add" (`KanbanBoard.tsx:39-45`); phone = 85vw snap columns, touch delay 180 ms (:111-113,146,171) | Horizontal pager, one column per screen, with a column-chip strip at the top. Move a card with **long press → "Move to…" sheet** (drag across pages is unreliable) and optionally drag within a column. "+" per column. Fold = hide from the strip. | Drag across columns |
| **Calendar** | Month grid on a date column, drag to another day or from "No date", "+N more", `?month=`, fetches only the 6 visible weeks (`CalendarView.tsx:39-50`, `TableScreen.tsx:221-231`), separate "No date" list (`TableScreen.tsx:923-929`); compact mode turns drag off (`CalendarView.tsx:98`) | Small month with dot markers + the chosen day's rows under it (exactly the web's `compact`, :178-235). Change a date in the sheet's date field; "+" adds a row on the chosen day; "No date" as a chip/section. | No (drag not needed) |
| **Gallery** | Cover = first image of an attachment column, title + 4 values, 1–4 columns, infinite load (`GalleryView.tsx:31-68`) | 1 column on a phone (2 on a tablet), FlashList with a fixed card height and cover image (opacity fade only: no layout animations on recycled cells, per the global rule) | No |

### View settings (`TA/filters.ts:69-89` `readViewConfig`; server allow-list `views_controller.rb:109-116`)

| Setting | Web | Phone |
|---|---|---|
| Quick search | debounced, server `search` param over text columns (`TableToolbar.tsx:41,112,140`) | search bar in the header |
| Filters | builder, one AND/OR level, removable chips (`FilterBuilder.tsx:23-29`, `TableToolbar.tsx:73-77`); "Filter by this column" from the header (`TableScreen.tsx:1430`) | "Filter & sort" bottom sheet → condition rows; value picker per type |
| Operators per type (`filters.ts:38-49`) | text: contains, not_contains, is, is_not, empty, not_empty · number/rollup: is, is_not, gt, gte, lt, lte, empty, not_empty · date: is, before, after, on_or_before, on_or_after, empty, not_empty · datetime: is, before, after, on_or_before, on_or_after · boolean: is · single_select: any_of, is_not, empty, not_empty · multi_select: any_of, all_of, none_of, empty, not_empty · attachments / link: empty, not_empty · lookup: contains, not_contains, empty, not_empty | the same list (server `TableApp::RecordQuery::OPERATORS`, `record_query.rb:22`) |
| Sorts | multi-sort, direction labels by type (A→Z, 1→9, oldest→newest, option order, unchecked→checked) (`SortBuilder.tsx:15`, `filters.ts:96-108`) | same sheet, reorder by drag handle |
| Group by | one select column, folding groups with real counts (`GroupPicker.tsx:12`, `grouping.ts:22-27`, `meta.groups` at `records_controller.rb:36`) | section headers in the card list (sticky), folding |
| Hidden fields + order | `FieldsPanel.tsx:25-32` (drag, switch, show/hide all, open the trash, add a column) | sheet with drag handles; also decides which fields a card shows |
| Row height | short/medium/tall/extra (`rowStyle.ts:3-21`, `RowStylePicker.tsx:24-29`) | card lines 1/2/3/4 (or n/a) |
| Row colour | by a single select (`rowStyle.ts:27-43`) | coloured bar on each card (the web phone already does this) |
| Column widths, wrap headers | `Grid.tsx:823-840`, `filters.ts:84,87` | n/a on a card list; only for the later grid |
| Frozen column | the first visible column always (`Grid.tsx:476,782`) | the later grid only |
| Kanban column, folded columns, calendar column, cover column | `ViewSwitcher.tsx:9`, `filters.ts:82-83` | chosen when the view is created |
| Saved views | create (from the open view) / rename / duplicate / delete (never the last), `?view=` in the URL, keepalive save (`ViewSwitcher.tsx:42-47`, `table_app.api.ts:243-290`) | view switcher in the header (dropdown sheet) |

## Web inventory by screen

`M` = MUST, `L` = LATER, at the increment number given. Everything ends at parity; L only means "after the first increments".

### Bases list (`/tables`, `TA/Index.tsx`)

| Feature | Web file:line | Mobile today | Phone mapping | M/L |
|---|---|---|---|---|
| Base cards: colour, description, date, table count | `Index.tsx:165-172` | none | FlashList of cards; order from the server (`bases_controller.rb:7`, `updated_at desc`) | M1 |
| New base (name, colour, description) | `BaseForm.tsx:27-28`, `Index.tsx:88,140` | none | sheet form | M6 |
| Edit base | `BaseForm.tsx` | none | same sheet | M6 |
| Delete base by typing its exact name (`confirmName`, checked by the server) | `Index.tsx:151`, `table_app.api.ts:53` | none | type-to-confirm dialog | M6 |
| New base from a file or a paste | `Index.tsx:84,112,125-135` | none | → import flow | L7 |
| Empty / loading / error states | `Index.tsx` | none | shared `LoadFailure`, skeleton | M1 |

### Table screen (`/tables/:baseId/:tableId`, `TA/TableScreen.tsx`)

| Feature | Web file:line | Mobile today | Phone mapping | M/L |
|---|---|---|---|---|
| Table tabs (Flow-style underline), drag to reorder, Move left/right | `TableTabs.tsx:25-31` | none | horizontal chip strip; reorder in a "Manage tables" list | M1 (switch) / M6 (reorder) |
| Tab menu: rename, describe, duplicate (± rows), clear data to trash + Undo, delete with an impact dialog that names links | `TableMenuPanels.tsx:13-35`, `TableScreen.tsx:118-121,1726-1745`, `tables#impact` | none | ⋯ action sheet | M6 |
| Table description under the tabs | `TableMenuPanels.tsx` | none | collapsible line | M1 (show) |
| New table: blank, or from a file/paste | `TableTabs.tsx` (`onAdd`, `onAddFromFile`) | none | "+" in the strip | M6 / L7 |
| Toolbar collapsing in 6 levels; phone gets one "View settings" sheet | `TableToolbar.tsx:23-33,61` | none | header: view switcher, search, filter, ⋯ | M1 |
| View switcher | `ViewSwitcher.tsx:42-47`, `TableScreen.tsx:1121` | none | sheet | M3 |
| Search / filter / sort / group / fields / row style | see View settings | none | sheets | M3 |
| Card list (phone mode), long press selects | `CardList.tsx:15-39,108-120`, `TableScreen.tsx:1380-1400` | none | FlashList, fixed measured height | M1 |
| Infinite load + "loading more" + Retry on a failed page | `TableScreen.tsx:60,1392-1399,1753-1783` | none | `onEndReached`, footer spinner, retry row | M1 |
| Row count line | `TableScreen.tsx:1381` (`meta.totalCount`) | none | header subtitle | M1 |
| Grid (desktop) | `Grid.tsx` | none | the later optional grid | L9 |
| Summary bar (filled, sum, avg over the whole view) | `Grid.tsx:870-907`, `records#summary` | none | "Summary" sheet per column | L9 |
| Add row (sticky "+ New record"); the new row opens in the sheet | `TableScreen.tsx:478-483` (`reveal`, `focusNew`), `newRows.ts` | none | FAB → create → open the sheet straight away | M2 |
| Empty table (shows its columns, offers add row / add column / import) | `EmptyTable.tsx:16-20`, `TableScreen.tsx:1371` | none | empty state | M1 (add row M2) |
| "No match" + Clear filters | `TableScreen.tsx:1360-1369` | none | empty state | M3 |
| Full screen (grid and sheet) | `TableScreen.tsx:111,1065-1071,1224-1284,1464` | n/a | a native screen is already full screen; the later grid goes landscape | n/a (L9 landscape) |
| Bulk select → BulkBar (count, edit, delete, clear) | `BulkBar.tsx:13-18`, `TableScreen.tsx:405,1524` | none | long press → select mode, bottom action bar | M5 |
| Bulk edit (set one column for all, one Undo; links excluded) | `BulkEditPanel.tsx:21-26`, `records#bulk_write` | none | sheet: column + value | M5 |
| Bulk delete → 30-day row trash, Undo restores rows with their links/comments/history | `TableScreen.tsx:571-591`, `records#bulk_destroy`, `records#restore` | none | `UndoToast` (exists in mobile `src/components/UndoToast.tsx`) | M5 |
| Undo (toast + Ctrl+Z) for cell writes, moves, deletes | `TableScreen.tsx:446-457` (`lastUndo`) | none | Undo toast after every destructive or move action | M2 |
| Copy / cut / paste a block (TSV from Excel, Sheets, WhatsApp); adds rows past the end | `Grid.tsx:132-136,917-931`, `clipboard.ts`, `selection.ts` | none | **phone-hard**; covered by "Paste data to import" (L7) + "Copy row as text" in the sheet | L9 |
| Keyboard navigation, range select, F2/Enter edit, Delete clears | `Grid.tsx:132-136,587-630` | n/a | n/a (hardware keyboard on a tablet: L9) | L9 |
| Column header menu: edit, move, hide, delete, use as title, duplicate, sort A→Z/Z→A, filter by this column | `ColumnHeader.tsx:41-47` | none | Fields sheet row ⋯ menu | M6 |
| Add / edit column | `FieldEditor.tsx`, `TableScreen.tsx:112` | none | full-screen sheet | M6 |
| Deleted fields trash (30 days, restore) | `DeletedFieldsPanel.tsx:22-26`, `fields#trashed`, `fields#restore` | none | list in the Fields sheet | M6 |
| Import panel + banner + history | `ImportPanel.tsx`, `ImportBanner.tsx`, `TableScreen.tsx:1510,1643-1670` | none | see the Import section | L7 |
| Export CSV / XLSX of the view (big ones in the background, the bell rings) | `ExportMenu.tsx:33-36`, `exports#create/show/download` | none | ⋯ → Export → share sheet (`expo-file-system` + `expo-sharing` are already deps) | L7 |
| Forms menu (forms with answer counts, "New form") | `forms/FormsMenu.tsx:14-19`, `TableScreen.tsx:1212` | none | ⋯ → Forms | L8 |
| Share base (email + role Editor/Viewer, pending invites, resend, remove; owner only) | `ShareDialog.tsx:27-33`, `TableScreen.tsx:1712` | none | sheet | M5 |
| Activity panel: Comments + History tabs, `?activity=` deep link | `ActivityPanel.tsx:23-45`, `TableScreen.tsx:1621` | none | full-screen tabs | M5 |
| Comments: @mentions (ring the bell), edit/delete, up to 5 files of 10 MB each | `CommentsFeed.tsx:28-29,176-198,381-386`, `comments#*` | none | chat-like thread + mention picker + attach | M5 |
| History: by day, filter by kind and person, restore a deleted column, assistant badge | `HistoryFeed.tsx:66-67,240`, `activities#index` | none | list with filter chips | M5 |
| Roles: owner / editor / viewer drive what is shown (`canEdit`, `canManage`) | `base_serializer.rb:12-14`; checked across TableScreen | none | the same gating | M1 |
| "Use as title" confirm (where the title shows, affected link columns, rows left "Untitled") | `TableScreen.tsx:1029`, `fields#usage`, `fields#primary` | none | confirm dialog | M6 |
| Realtime | none (no channel) | none | refetch on focus/pull | n/a |

### Record sheet (`TA/components/RecordSheet.tsx`)

| Feature | Web file:line | Phone mapping | M/L |
|---|---|---|---|
| Every column editable through `DynamicField`; typing saves after a pause, a pick saves at once | `RecordSheet.tsx:62-70,184,359` | full-screen modal, field list | M2 (read M1) |
| Previous / Next ("3 / 25"), ↑↓ / J/K, **swipe on a phone**, pending typing saved before moving | `RecordSheet.tsx:40,102,129-135,224-238` | horizontal swipe + chevrons | M2 |
| Enter = next field (`enterkeyhint`) | `RecordSheet.tsx:53,155` | `returnKeyType="next"` | M2 |
| Copy the row's link | `RecordSheet.tsx:198,259` | Share / copy deep link | M2 |
| Duplicate row (cells and links) | `RecordSheet.tsx:288`, `records#duplicate` | ⋯ menu | M2 |
| Delete row (confirm → trash, Undo) | `RecordSheet.tsx:397`, `records#destroy` | ⋯ menu + Undo toast | M2 |
| Column description under its label | docs/TABLE_APP.md:178 | helper text | M2 |
| "+ Add a column" from the sheet | docs/TABLE_APP.md:208 | footer button (managers) | M6 |
| Relations section: every link on both sides as cards, "+ Link" (search or create), unlink with Undo; relation limit "Replace" offer | `RelationsSection.tsx:21-27,31-58`, `records#relations/link/unlink` | section with cards; picker full screen | M2 |
| Row activity (comments + history for this row) | `RowActivity.tsx:16-20`, `RecordSheet.tsx:390` | tabs at the bottom | M5 |
| WhatsApp button on phone columns | `DynamicField.tsx:137-144` | `Linking.openURL('https://wa.me/…')` | M1 |

## Forms

Web: builder `/tables/:baseId/:tableId/forms/:formId` (`AppRoutes.tsx:233`, `forms/FormBuilder.tsx`); public `/f/:slug` (`AppRoutes.tsx:110`, `forms/PublicForm.tsx`). Server: `forms_controller.rb` (152 lines), `public/forms_controller.rb`, `TableApp::FormSubmitter`, `FormGuard`, `FormInvites`, `FormPresenter`; mailer `TableAppMailer#form_invitation`. Rate limit: 10/min and 60/h per IP.

| Feature | Web file:line | Phone mapping | M/L |
|---|---|---|---|
| Forms list per table with answer counts; "New form" asks every column | `FormsMenu.tsx:14-19` | list screen | L8 |
| Builder tabs Questions · Design · Access · Options · Answers; editor + live preview side by side, taking turns when narrow | `FormBuilder.tsx:39,50-64,95` | one screen per tab (segmented control); Preview = render the public form component read-only | L8 |
| Optimistic edits saved after a pause, one request at a time | `FormBuilder.tsx:177-187` | same pattern with React Query | L8 |
| Questions: drag to reorder, label, help, placeholder/example, required (locked when the column requires it), hidden; fold to one line; "+ Add a question" from the unused columns | `FormBuilder.tsx:364-369,462-537,553-563` | reorderable list; edit sheet per question | L8 |
| Design: cover colour or uploaded image, title, intro, language (auto/en/fr/ps/fa/ar), success message | `FormBuilder.tsx:598-710`, `forms#upload_cover/remove_cover` | form fields + image picker | L8 |
| Access: public / signed-in / only me / invited by email; invite list (pending/joined/answered), resend, remove; copy link | `FormBuilder.tsx:816+` (keys `whoCanAnswer`, `invite*`, `resend`, `removeInvite`), `forms#invite/uninvite/resend` | radio list + emails field + share sheet for the link | L8 |
| Options: accepting answers, allow several per person, close date, max submissions | `FormBuilder.tsx` (keys `accepting`, `allowMultiple`, `closesAt`, `maxSubmissions`) | switches + date picker + number | L8 |
| Answers: newest first, each opens its row; export CSV | `FormBuilder.tsx:717-740`, `forms#submissions` (offset paging) | list → opens the record sheet | L8 |
| Delete form | `FormBuilder.tsx:257` | ⋯ confirm | L8 |
| **Public form**: phone-first single column, validation the same as the server's, prefill from `?f[Label]=…`, hidden private fields, RTL by language or script, its own language, honeypot `hp_f7` + signed opened-at token (`too_fast` 422), file uploads (≤10 files, 10 MB, 25 MB per submission), success / closed / sign-in / not-found cards | `PublicForm.tsx:25-78`, `formLogic.ts:3-95`, `FormQuestion.tsx` | **Decision:** (a) open `/f/:slug` in the browser (zero cost, public visitors are on the web anyway), or (b) render in-app for signed-in and invited forms via a deep link. Recommend (a) at first, (b) in L8 | L8 |
| Owner's bell on an answer; invite notifications | `table_app.form_submission`, `table_app.form_invite` kinds | map to the answers screen via `src/lib/inAppRoute.ts` | L8 |

Not built on the web: conditional logic, multi-page forms, edit after submit, saving the submitter on the row (docs/TABLE_APP.md:114-115).

## Import / export

| Feature | Web file:line | Phone mapping | M/L |
|---|---|---|---|
| CSV/TSV/TXT/XLSX file pick | `ImportPanel.tsx:278` | `expo-document-picker` | L7 |
| **Header + sample read and type-guessing in the browser (SheetJS over the WHOLE file)** | `ImportPanel.tsx:62-81`, `importGuess.ts:3-92` (mirrors `TableApp::Cell`) | **needs a server preview endpoint** (see API gaps) or bundling `xlsx` (about 400 KB+, slow on big files on a phone) | L7 |
| Per-column mapping: skip / existing column / new column of a type; mostly empty columns start as skip; unique names | `ImportPanel.tsx:36,59,68` | one row per file column, pick sheet | L7 |
| Preview of the first 5 rows, refused values in red, "N values would be refused (first: X)" over the whole file | `ImportPreview.tsx:23-32,90-91` | horizontal-scroll mini table or per-column cards | L7 |
| Upsert on a key column | `ImportPanel.tsx:122,209-213,399` | picker | L7 |
| Idempotency key | `ImportPanel.tsx:103` | hash of file uri + mapping | L7 |
| Background job, live progress banner, dismissed once (stored on the server), cancel, refused-rows CSV, history | `ImportBanner.tsx`, `imports#latest/cancel/dismiss/errors/index` | banner on the table screen with polling | L7 |
| Paste data (Excel/Sheets TSV, CSV with `,`/`;`, WhatsApp list), header guess | `pasteImport.ts`, docs/TABLE_APP.md:198 | big TextInput → same pipeline (no file parsing needed; this is the cheap first step) | L7 |
| New table / new base from a file | docs/TABLE_APP.md:199-200 | entry from the "+" and the bases list | L7 |
| Export CSV/XLSX of the view (fields = visible, query = current) | `ExportMenu.tsx`, `table_app.api.ts:354-380` | download with the auth header → `expo-sharing` | L7 |
| Import via the assistant (file attached in chat) | `app/services/ai/actions/tables_import_file.rb` | mobile chat attachments, if they exist, already reach it; check | L7 |

## API endpoints mobile needs

All under `/api/v1/table_app` unless noted (`config/routes.rb:454-534`). Client reference: `TA/api/table_app.api.ts`, `TA/api/forms.api.ts`.

**Bases and sharing**
- `GET /bases` index · `GET /bases/:id` show (role) · `POST /bases` create (`base: {name, description, color, first_table_name, empty}`) · `PATCH /bases/:id` update · `DELETE /bases/:id` destroy (`confirm_name`)
- `GET /bases/:base_id/members` · `POST /bases/:base_id/members` (`email, role`) · `PATCH /bases/:base_id/members/:id` · `DELETE /bases/:base_id/members/:id` · `POST /bases/:base_id/members/:id/resend`

**Tables**
- `POST /bases/:base_id/tables` create (`table: {name, fields?}`) · `POST /bases/:base_id/tables/reorder` (`ids`)
- `GET /tables/:id` show (fields, relations, primary_field_id, view, views) · `PATCH /tables/:id` (name, description) · `DELETE /tables/:id`
- `GET /tables/:id/impact` · `POST /tables/:id/duplicate` (`name, with_rows`) · `POST /tables/:id/clear`

**Fields**
- `POST /tables/:table_id/fields` create · `GET /tables/:table_id/fields/trashed`
- `PATCH /fields/:id` update/retype/options/relation/default · `DELETE /fields/:id` (to trash)
- `POST /fields/:id/duplicate` (`with_values`) · `GET /fields/:id/usage` · `POST /fields/:id/restore` · `POST /fields/:id/primary`

**Records**
- `GET /tables/:table_id/records` index — `offset, limit (≤500, default 200), search, filters (JSON), match, sorts (JSON), group_by` → `records, meta {offset, limit, has_more, total_count*, table_total*, groups*}` (*first page only)
- `GET /tables/:table_id/records/summary` (same query params)
- `POST /tables/:table_id/records` create (`record: {values}`) · `GET /records/:id` · `PATCH /records/:id` (`record: {values}`) · `DELETE /records/:id`
- `POST /tables/:table_id/records/bulk_write` (`rows`) · `POST /tables/:table_id/records/bulk_destroy` (`ids`) · `POST /tables/:table_id/records/restore` (`ids` or `trashed_at`) · `POST /tables/:table_id/records/reorder` (`ids`, kanban order)
- `POST /records/:id/duplicate` · `POST /records/:id/link` (`field_id, linked_id, replace`) · `POST /records/:id/unlink` · `GET /records/:id/relations` · `GET /records/:id/preview`

**Views**
- `POST /tables/:table_id/views` (`view: {name, view_type, config}`) · `PATCH /views/:id` (`view: {name?, config?}`) · `POST /views/:id/duplicate` · `DELETE /views/:id`

**Activity and comments**
- `GET /tables/:table_id/activities` (`before, kind, user_id, record_id`; id cursor)
- `GET /tables/:table_id/comments` (`before, record_id`) · `POST /tables/:table_id/comments` (JSON, or multipart with files; `body, mention_ids, record_id`) · `PATCH /comments/:id` · `DELETE /comments/:id`

**Imports and exports**
- `POST /tables/:table_id/imports` (multipart: file, columns, upsert_on, idempotency_key) · `GET /tables/:table_id/imports` · `GET /tables/:table_id/imports/latest` · `GET /imports/:id` · `POST /imports/:id/cancel` · `POST /imports/:id/dismiss` · `GET /imports/:id/errors` (CSV)
- `POST /tables/:table_id/exports` (`format, query, field_ids`) · `GET /exports/:id` · `GET /exports/:id/download`

**Forms (builder)**
- `GET /tables/:table_id/forms` · `POST /tables/:table_id/forms` · `GET /forms/:id` · `PATCH /forms/:id` · `DELETE /forms/:id`
- `GET /forms/:id/submissions` (`offset`) · `POST /forms/:id/invites` (`emails`) · `DELETE /forms/:id/invites/:invite_id` · `POST /forms/:id/invites/:invite_id/resend`
- `PUT /forms/:id/cover` (multipart) · `DELETE /forms/:id/cover`

**Public forms** (no auth): `GET /api/v1/public/forms/:slug` (`invite`) · `POST /api/v1/public/forms/:slug/submissions` (JSON or multipart)

**Core** (`/api/v1/core`): `POST /field_attachments` (multipart: definition, record type `TableApp::Record`, record id, file) · `DELETE /field_attachments/:id`

**Elsewhere:** notifications (already in mobile) for the `table_app.share|mention|comment|form_submission|form_invite` kinds, plus export-ready and import-done; the AI session scope `tables` (`app_scope.rb:24`).

## API gaps

1. **No server import preview or type guess.** The web reads the file with SheetJS and guesses types in the browser (`ImportPanel.tsx:72-81`, `importGuess.ts`, which mirrors `TableApp::Cell`). Proposal: `POST /tables/:id/imports/preview` (multipart file, or pasted text) → `{header, sample[5], guesses[], misfits{col:{count, first}}}`, built from `TableApp::Spreadsheet` + `TableApp::Cell`. That gives one source of truth and no 400 KB library on the phone. *Inferred, not measured:* how slow SheetJS is on a phone for a 20k-row XLSX.
2. **No field projection on `records#index`.** Every page carries every column's value; a phone card shows 3–4. Proposal: an optional `field_ids[]`. Lower priority, since link titles are already capped at 12 (`record_presenter.rb:31-35`).
3. **Paging is offset-based** (`records_controller.rb:26-33`). A row added or deleted while scrolling shifts pages (duplicate or skipped cards). This is acceptable (the web lives with it); the client should de-dupe by id. `total_count` comes only with `offset=0`.
4. **No realtime.** No channel for table changes: refetch on focus and pull-to-refresh, the same as the web.
5. **Views are shared per table** (`views_controller.rb:109-116`; no personal views). A filter changed on the phone rewrites the view for every member, as it does on the web. **Owner decision:** keep shared, or add "temporary" phone-only filters that are not saved.
6. **Order of new rows.** Rows sort by `position ASC, id ASC` (`record_query.rb:388`), so a new row lands at the end of what may be 20k cards. Bases sort by `updated_at desc`, not `created_at desc`. This **conflicts with the owner's invariant "lists are newest first"**, but Airtable semantics want manual position. Mobile should open the sheet straight after creating a row (as the web does with `reveal`). **Owner decision.**
7. **Downloads need the auth header** (`exports#download`, `imports#errors`, attachment URLs). On mobile: `FileSystem.downloadAsync(url, {headers})`. Check whether attachment `url`s are signed public Active Storage URLs (they render in `<img>` on the web, so probably yes; not verified).
8. **Public form RTL languages (ps/fa/ar)** exist only in web locale files. Mobile is en/fr. Showing the public form in-app means porting those strings, or using the browser (gap 0 if the browser is used).
9. **Notification deep links:** `src/lib/inAppRoute.ts` has to learn `/tables/:b/:t?view=&record=`, `?activity=` and `/tables/…/forms/:id`.
10. **No endpoint for "row N of the view".** Prev/next works from loaded pages only (the web does the same). Fine.

## Phone-hard items

1. **The grid at 360 dp.** Cards plus a sheet replace it (the web made the same choice). A real grid with horizontal scroll and a frozen title column is an L9 extra for tablets and landscape.
2. **Keyboard spreadsheet:** range select, Ctrl+arrows, F2, Delete-clears (`Grid.tsx:132-136,587-630`). No equivalent on a touch phone; tablet with a hardware keyboard only (L9).
3. **Block copy/paste** (`clipboard.ts`, `Grid.tsx:917-931`). Replaced by Paste-to-import (L7) and copying a row as text.
4. **Kanban drag between columns** (`KanbanBoard.tsx:111-113`). Long press → "Move to…" sheet; drag within a column is optional.
5. **Calendar drag to another day.** The web's own compact mode turns it off (`CalendarView.tsx:98`); change the date in the sheet.
6. **Column resize, wrap headers, drag column order on headers.** Ordering moves to the Fields sheet with drag handles; widths n/a.
7. **Hover previews** (`LinkChip.tsx:16-22`). Tap → preview sheet.
8. **File import type-guessing** (SheetJS in the browser). Needs a server endpoint (API gap 1).
9. **Form builder side-by-side preview and question drag.** Use tabs plus a Preview tab; reorder list with handles.
10. **Big tables on a phone** (20k+ rows, offset paging 200/page). FlashList with a **fixed measured card height** and no layout animations on recycled cells (global mobile-lists rule). Paging 50–100 per page on cellular.
11. **Summary bar** (`Grid.tsx:870-907`). A "Summary" sheet.
12. **Long text and multi-select editing inside a sheet over the keyboard.** Edge-to-edge Android does not resize for the IME (mobile CLAUDE.md, TESTING §5); use the repo's `KeyboardPadding`.

## Increments + size

Each increment ships on its own, en+fr, light+dark, 360/411/800 dp, with Maestro flows. It runs signed in as the QA account and never on the owner's bases (the backend is his real data). "Days" = focused dev-days including tests and device QA. *These are estimates, not measured.*

| # | Increment | Screens / sheets | Contents | Days |
|---|---|---|---|---|
| **1** | **Browse (read-only)** | Bases list, Table screen (tabs + card list), Record sheet (read), view switcher (switch only) | API client + types; 16 read-only renderers (WhatsApp/mailto/url, attachment thumbs, link chips → open the linked row); gallery view; quick search; paging + retry; roles; empty/loading/error; app registry entry + notification deep links | 7–9 |
| **2** | **Edit rows** | Record sheet (edit), Link picker, Option picker, Date picker, Attachment picker | 10 editable editors; autosave with debounce; add row (FAB → sheet); duplicate; delete + Undo; prev/next + swipe; relations section (link/unlink/create-and-link, relation limits); attachment upload/delete with the quota error | 8–10 |
| **3** | **Find + views** | Filter & sort sheet, Fields sheet, Group/Row-style sheet, View manage sheet | full filter builder (every operator family, AND/OR), multi-sort with type labels, group-by sections with counts and folding, hidden/order fields, row colour bar, create/rename/duplicate/delete views | 6–8 |
| **4** | **Kanban + Calendar** | Kanban pager, Calendar (compact month + day list) | move card via sheet + Undo, reorder within a column, "+" per column/day, fold columns, "No date" list, month navigation | 6–8 |
| **5** | **Collaborate** | Bulk bar + bulk edit sheet, Share sheet, Activity (comments/history), Row activity | long-press select, bulk edit/delete + Undo (row trash restore), sharing (invite, role, resend, remove), comments with @mentions + files, history with filters + restore column | 7–9 |
| **6** | **Schema + table admin** | Field editor (full screen), Fields trash, Table menu, Base form, type-to-confirm | add/edit/retype columns with options, relation types, lookup/rollup, defaults, description; duplicate/delete/restore column; use as title (+ impact); table rename/describe/duplicate/clear/delete (+ impact), reorder tables; base CRUD | 9–11 |
| **7** | **Import / export** | Import flow (pick → map → preview → progress), Paste import, Imports history, Export | paste import first (no parser), then file import (**needs the server preview endpoint, about 1–2 extra server days**), upsert, banner/cancel/errors CSV, new table/base from a file; export CSV/XLSX → share sheet | 8–10 (+1–2 server) |
| **8** | **Forms** | Forms list, Builder (Questions / Design / Access / Options / Answers / Preview) | builder parity, invites, cover upload, answers → record sheet; the public form opens in the browser at first, then in-app for signed-in/invited forms (+ ps/fa/ar RTL strings if in-app) | 9–12 |
| **9** | **Power grid (tablet/landscape)** | Grid screen, Summary sheet | horizontal-scroll grid with sticky title column + row numbers, tap-to-edit cell, column widths honoured, summary bar, hardware-keyboard nav on a tablet, copy a row/cell | 6–9 |

**Total: about 66–86 dev-days, about 25 screens/sheets.**

- **Sensible ship points:**
  - 1.4 = increments 1+2 (useful: browse and edit his tables on the phone)
  - 1.5 = 3+4 (all four view types, Airtable-style filtering)
  - 1.6 = 5+6 (collaboration + schema)
  - 1.7 = 7+8 (import/export + forms)
  - 9 is the last, optional-feeling, parity extra.
- **AI** rides along at no extra cost:
  - The existing assistant already has `tables_*` tools.
  - Add an "Ask about this table" header action with session scope `tables` in increment 1 (about 0.5 day).
- **Reuse dividend:** the Core field renderers and editors from increments 1–2 are exactly what Flow cards need later.

**Owner decisions** needed before building:
- (a) Shared views vs phone-only temporary filters (gap 5).
- (b) Row order and new rows vs the newest-first invariant (gap 6).
- (c) Public form in the browser vs in-app (Forms section).
- (d) Server import-preview endpoint vs bundling SheetJS (gap 1).
