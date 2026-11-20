# Tables: the fifth full app (2026-11-20)

**Status: `IN PROGRESS`**: approved by Hello on 2026-11-20 (§G). Increment 1 (browse) is built: `app/tables/{index,table,record}.tsx`, `src/api/tables.ts`, `src/screens/tables/`, with its checklist in `inc-1/MANIFEST.md`. Outstanding: its device pass, then increments 2–9.

The owner, 2026-11-20 (relayed by Hello): the order is **Flow → Tables → Doc**, "attack". This session takes Tables. Session `multi-magic-mobile-e2` builds Flow, including the shared Core field editors, which Tables reuses.

**The owner's decision for this app:** *a filter changed on the phone stays personal; it does NOT change the shared view for others.*

Like Contacts and Calendar, this reverses the old rule "this app has no record screens, it composes a question" (`CLAUDE.md`, Design), on the owner's request. Each table keeps an **Ask about this table** action (the assistant with scope `tables`), so nothing that rule gave is lost.

The full web inventory, every feature with its web `file:line`, is [`docs/parity/tables.md`](../../parity/tables.md) (read-only audit of the web at `e9adf512`, identical on origin `f66f85ab`). This spec does not copy it. §F turns it into the build list, increment by increment, and every row there points back to it.

---

## A · What the web and the API have, and where it lands on the phone

| Web (`app/javascript/pages/table_app/`) | API (`/api/v1/table_app`) | Phone |
|---|---|---|
| Bases list (`Index.tsx`) | `GET bases` (`updated_at desc`) | `app/tables/index.tsx`: one card per base (colour square, name, description, table count), search on top |
| Table screen, tabs (`TableScreen.tsx`, `TableTabs.tsx`) | `GET tables/:id` (fields, relations, primary field, view, views) | `app/tables/[tableId].tsx`: header (base name ▾, search, ⋯), a table chip strip, the view's toolbar row, then the records |
| **The web's own phone mode** below 720 px: card list plus a full-screen record sheet (`CardList.tsx:34-39`, `RecordSheet.tsx:66-70`) | `GET tables/:id/records?offset&limit&search&filters&match&sorts&group_by` | **This is the design.** A FlatList of cards; a tap opens the record screen. The grid is the tablet/landscape extra, increment 9 |
| Record sheet (`RecordSheet.tsx`) | `GET/PATCH/DELETE records/:id`, `duplicate`, `relations`, `link`, `unlink` | `app/tables/record.tsx`: label above value, one scroll, prev/next, ⋯ menu |
| Kanban (`KanbanBoard.tsx`), Calendar (`CalendarView.tsx`, compact), Gallery (`GalleryView.tsx`) | `group_by`, `meta.groups`, `records/reorder` | increment 4 (kanban, calendar); gallery in increment 1 |
| Filter / sort / group / fields / row style (`TableToolbar.tsx`, `FilterBuilder.tsx`, `SortBuilder.tsx`, `GroupPicker.tsx`, `FieldsPanel.tsx`) | **query params on `records#index`**, and a saved copy in `PATCH views/:id` | bottom sheets. **On the phone they change the query only, never the view** (§C1) |

**Measured, not assumed:** `records_controller.rb:21-37` takes `search`, `filters`, `match`, `sorts` and `group_by` as request parameters, and the view's saved `config` is never read there. So a personal filter is the phone sending its own parameters. **No server change is needed for the owner's decision.**

---

## B · Sources (Rule Zero): 20 screens, images in `references/` (gitignored)

| App | Screen | What we TAKE | What we REJECT |
|---|---|---|---|
| Airtable | [Cards, list view](https://mobbin.com/screens/ce940df6-fe49-4fb5-afc9-f54211a77393) | the card: **title on top**, then each field as a small **icon + LABEL above value**, a few fields per card | the always-visible coloured app bar (our header is the shared shell, `app-shell/SPEC.md`) |
| Airtable | [Customize cards sheet](https://mobbin.com/screens/fd8e32a0-e1ca-4b99-b046-dff88a593a3c) | **one sheet decides which fields a card shows** and the cover field (Crop/Fit) | iOS-blue "Done" text button; we use our `Button` |
| Airtable | [List with hidden fields](https://mobbin.com/screens/9b67b282-2590-442d-b09b-10e454509519) | the **toolbar row under the header**: view name ▾, Hidden fields, Filter, Group, Sort; an active setting is **tinted** | the horizontal mini-grid header (it scrolls off-screen at 360 dp) |
| Airtable | [Grouped + Undo](https://mobbin.com/screens/a3fcb908-0dee-48fb-98be-df0e251de28b) | **group header with its count** ("Days 5 · Count 1"); "Filtered" and "Grouped" chips tinted when on; **"Table deleted · UNDO" toast** | — |
| Airtable | [Summary row](https://mobbin.com/screens/7981a528-8fe5-4974-92d6-c3eec6934c76) | the column summary ("26 sum"); confirms it belongs to the later grid (increment 9), not the cards | — |
| Airtable | [Gallery](https://mobbin.com/screens/77df1d20-27f8-47d0-9b51-b2f36ddfa7b1) | gallery = **one column, cover image on top**, then the card body | — |
| Airtable | [Applicant tracker](https://mobbin.com/screens/90ce7de5-49ad-4dad-aa01-3fb64cd62703) | a single select as a **coloured chip** on the card; the attachment as a **thumbnail with "+1"** | the read-only "Add this base" bar |
| Airtable | [Bases](https://mobbin.com/screens/0d66c9f4-57fb-4dd3-bd97-9c2287c3b7fa), [search](https://mobbin.com/screens/ec29737d-9ce0-40fa-9cb7-d7ba1695209f) | bases as a **plain list: a coloured square icon + name**, "+ New base" as the last row; search across bases | workspaces (the web has none), video tutorials |
| Airtable | (same screens) | the **table switcher as a bottom strip** of chips, with "+" to add | **rejected the position**: our chip strip goes at the TOP, under the header, because the bottom is the shell's and the keyboard's, and the web puts its tabs on top |
| Notion | [Item page](https://mobbin.com/screens/dd06bc90-912a-4c12-aa35-c53fed682cad), [another](https://mobbin.com/screens/16ddd22c-d559-4bd7-ab48-9557843441f9) | the record as a **page**: big title, then **property rows (icon + name · value)**, an empty value shown as a muted "Empty", "+ Add a property" at the end, comments under | the free page body (our rows have no body) |
| Notion | [Database table](https://mobbin.com/screens/6494c048-3824-413c-a5ca-3f3b0c8f21ee) | view switcher as a **pill with the view's icon and name ▾**, search/filter/sort icons beside it | the horizontal grid as the phone default |
| Notion | [Board](https://mobbin.com/screens/71f9dba2-130f-406e-b4fe-781f227f51b8) | kanban column header = **coloured status chip + count**, "+ New" at the column foot, the next column peeking at the edge | — |
| Jira | [Board](https://mobbin.com/screens/6a847e41-d3f0-446b-bb98-09faf22c2f8e) | **one column per screen with the next one peeking**, **page dots** under it, filter chips (Assignee ▾, Status ▾) above | — |
| Asana | [Grouped list](https://mobbin.com/screens/547a8796-f76d-479c-80c0-3a5c362f9df6) | **foldable group headers** (▾ To do) | the grid columns on a phone |
| Beli | [Filter sheet](https://mobbin.com/screens/b8c7e8ab-c828-4e6c-9e70-df9044759a99) | one sheet: a **"Sort by" segmented row on top, filters under**, each active filter shows its count and a clear ×; **"Clear all" + "Apply (3)"** at the foot | — |
| Insight Timer | [Sort & filter](https://mobbin.com/screens/9d3d375b-ccb7-45a2-8366-7f3cafe63be5) | **"Show 4"**: the apply button says how many results it will give | — |
| Fresha | [Filters](https://mobbin.com/screens/95f307d6-cfed-4784-b500-b6fa2f81d91b) | "Clear all" as an outline button beside a filled "Apply" | the price slider (our values come from the field type) |
| Beli | [Detail](https://mobbin.com/screens/eb9f1de7-3a17-459f-9adc-afb00fdda8ca) | **tap a row to edit it**: one row per field, a chevron where a picker opens, chips shown under their row | — |
| Fi | [Edit details](https://mobbin.com/screens/109a7879-53ee-4e40-a7e9-a560d8cd3da0) | **floating-label** inputs (label inside the box, above the value) for text, date and amount | a "Save" button: we save as the web does (§C5) |
| Shopify | [Entry](https://mobbin.com/screens/a795687d-3c12-467e-91e3-c1012b55e15a) | **References** section listing the rows that link here, each a tappable row with its table's name | — |

---

## C · Decisions

**C1. A phone filter is personal (the owner, 2026-11-20).**
- **What it covers:** filter, sort, search, group, hidden fields and card lines changed on the phone live in a **personal layer over the shared view**. They are sent as `records#index` parameters and **never** sent to `PATCH views/:id`.
- **Where it is kept:** on the device, under the user id and view id (`AsyncStorage`, `tables.view.<userId>.<viewId>`), so it survives a restart. Same per-viewer state as the web's `localStorage`; nothing goes to the server.
- **What the user sees:** the toolbar chip turns tinted, with a dot: *"Your filter: only you see it"*. In the sheet, a row reads **"Back to the shared view"**, which drops the layer.
- **To share a change** there is one explicit action, **"Save as a new view…"**. It creates a view everyone sees, and the sheet says so in words. Changing the shared view itself stays on the web.
- *Why the whole layer and not only the filter:* a phone that hides fields or regroups for one person would otherwise change everyone's grid. The owner's rule is about not surprising others, and the same reasoning covers every view setting. **Hello: say if the owner meant the filter only.**

**C2. The card list is the table (the web's own phone mode).**
- **Card body:** title (the primary field), then **at most 3 fields**, each with a **small label above its value**. The 3 are the view's first visible fields, and the personal layer can change them (Airtable's "Customize cards").
- **Single and multi selects** are coloured chips. **Attachments** are one thumbnail plus "+N". **Links** are chips with the linked row's title.
- **Row colour** (the view's colour-by setting) is a 4 dp bar on the card's leading edge, as the web phone already does.
- **Height is fixed per view**, computed from the number of card lines (1–4, the web's row height). It is measured once, so `getItemLayout` holds and a recycled cell never changes size. **No Reanimated on cells** (the owner's rule, `.eslintrc.js` `list-cell-animation`).

**C3. Newest first (server change live since 2026-11-20, `API_ASKS.md` §6).**
- **Rows:** when the view has **no sort of its own**, the personal layer starts on **Newest first**, sending `sort=-created_at`: the row's own creation time, no column needed. **"Table order"** is one tap away and drops it. With `group_by`, the groups come first and newest first applies inside each.
- **Before that deploy lands:** where the table has a `created_time` field, the phone sorts by it. Otherwise the view's order stays, and a created row **opens at once** and is **pinned at the top** until the next refresh.
- **The new row always opens at once** (the web's `reveal`), whatever the order.
- **Bases:** the server's default is now `created_at desc`. The sort chip offers Newest · Recently changed (`updated_at_desc`) · A–Z (`name_asc`).
- **Tables inside a base** keep the user's tab order, on purpose, as the server does.

**C4. Record screen, not a sheet.**
- **Layout:** a pushed full-screen route (`app/tables/record.tsx`) with a big title, then one row per field: **label above value**, the field's description under its label, Notion's "Empty" for a blank.
- **Editing:** a tap on a row opens that type's editor sheet. This is e2's `FieldRow` (C9): text, number, phone, email and url in `TextSheet`; date in `DateSheet`; options in `SelectSheet`; links in `RecordPickerSheet`; files in `FilesSheet`; a boolean is a Switch. Flow and Tables then behave the same way.
- **Prev / next:** "3 / 25" with chevrons in the header, plus a horizontal swipe. Any pending text is saved before moving (`RecordSheet.tsx:129-135`).
- **⋯ menu:** Copy link · Duplicate · Delete (with Undo) · Ask about this row.

**C5. Saving.**
- **When:** a pick saves at once. Text saves when its sheet's Save is pressed (e2's `TextSheet`), not after each pause in typing as on the web. One behaviour across Flow and Tables matters more than matching the web here, and a sheet with Save cannot lose half a word to a swipe to the next row. Writes are optimistic through `useFieldWrites` (upload excepted), and a failed write rolls back with the server's sentence.
- **On a 422** (`TableApp::Cell::InvalidValue`): the field shows the server's sentence and keeps the typed value.
- **On a link cardinality conflict:** the server answers `code: 'cardinality'` with the conflicting row, and the phone offers **"Replace"**, as the web does.

**C6. Views on the phone.**
- **Switching** the view is everyone's (a view is shared). Changing one is personal (C1).
- **Grid** → the card list. **Gallery** → one column with the cover on top, a fixed height and the cover image's plain opacity fade (increment 1). **Kanban** → one column per screen, the next one peeking, page dots, a coloured header chip + count, "+" at the foot. A card moves by **long press → "Move to…"** sheet (increment 4). **Calendar** → a small month with dots and the chosen day's cards under it (increment 4).

**C7. Toolbar: one row, four controls**
- **Left:** a pill with the view's icon + name ▾ (switch, and "Save as a new view…").
- **Right:** Search (it expands into the header), Filter & sort (one sheet, Beli's layout, an apply button saying *"Show 42"*), Fields (one sheet: shown/hidden with drag order, the card lines, the colour field) and ⋯.
- **Tint:** a control that differs from the shared view is tinted with a dot (C1).

**C8. Roles.** `canEdit` / `canManage` from the base serializer (`base_serializer.rb:12-14`). A viewer gets no FAB, no editing and no ⋯ actions that write. The screen never shows a control that would answer 403.

**C9. Field types: shared with Flow (agreed with e2, 2026-11-20).**
- **Where they live:** e2's field layer is reused as it is, never forked. It sits on `feat/flow-app` in `mm-flow`, not gated yet; Tables increment 1 bases on it once e2 says it is committed and green.
- **`src/api/fields.ts`, the wire layer:**
  - `FieldDefinition` (`fieldType`, `config.options`…), all 21 server types in `FIELD_TYPES`;
  - `FieldValue` is `scalar | records | files`, and `parseFieldValues(raw)` reads a row's `field_values`;
  - `fieldsApi.setValues / addSelection / removeSelection / upload / removeFile / recordOptions`, each taking `record = {type: "TableApp::Record", id}`.
- **`src/components/fields/useFieldWrites.ts`:** optimistic writes. Tables supplies its `FieldTarget`: the record, the query keys it touches (`tablesKeys.records(...)`, `tablesKeys.record(id)`), and how to patch a row's values in those caches.
- **`src/components/fields/FieldRow.tsx`:** `<FieldRow field value editable writes known testID />`, one property row: icon, name, value; a tap opens the editor.
- **`src/components/fields/display.ts`:** `displayValue(field, value, known, lang)`, `isEmpty`, `optionsFor`, `linkedRecords`.
- **`src/components/BottomSheet.tsx`:** the keyboard-safe sheet, used for Filter & sort and Fields too.
- **This app adds, in the same files, and asks e2 first before changing a `FieldRow` prop:**
  - `FieldValue variant="card"`, the compact, fixed-height renderer, built on `display.ts`;
  - lookup and rollup rendering (today `String(value)`);
  - `TableApp::Record` labels through `known` (the linked table's rows).

**C10. Big tables.**
- **Paging:** 100 rows a page on the phone (the server's default is 200), `onEndReached`, de-duplicated by id. Offset paging shifts when someone else adds a row, as the parity audit notes (gap 3).
- **Footer:** "Loading more…", then a **Retry** row on a failed page; the rows already shown stay.
- **Count:** the header subtitle reads "1,204 rows", or "42 of 1,204" when filtered.
- **List component:** FlatList with `getItemLayout`, as the other apps do. `@shopify/flash-list` is a dependency but no screen uses it, and this app does not open that second list engine without a measured need.

**C11. No realtime.** Refetch on focus and on pull, as the web does.

**C12. Entry points.**
- the app registry (`src/apps/registry.ts`), key `tables`, icon `Table2`;
- notification deep links in `src/lib/inAppRoute.ts`: `/tables/:b/:t`, `?view=`, `?record=`, `?activity=`;
- the "Ask about this table" header action with session scope `tables`.

---

## D · Not taken (and why)

- **The grid as the phone default.** It fails at 360 dp: Airtable's own phone list scrolls its columns off-screen, and the web chose cards under 720 px. The grid is increment 9, tablet and landscape only.
- **Drag between kanban columns.** Unreliable across pages on a touch screen (the parity audit's phone-hard item 4). Long press → "Move to…" instead.
- **Block copy and paste, keyboard navigation and ranges.** There is no touch equivalent. "Paste data to import" (increment 7) and "Copy row as text" cover the need.
- **Editing the shared view from the phone.** The owner's decision (C1). The one sharing action is "Save as a new view".
- **The public form inside the app.** It opens `/f/:slug` in the browser at first (forms are increment 8; parity audit decision c).

---

## E · How we code it (increment 1, read-only browse)

| Piece | Identifier |
|---|---|
| API client | `src/api/tables.ts`, its keys `tablesKeys` in `src/api/keys.ts`: `bases()`, `base(id)`, `table(id)`, `records(tableId, query)` where `query` is the **effective** query (shared view + personal layer), so a personal change is its own cache entry |
| Types | `src/api/fields.ts` (e2's, C9) · `src/api/tables.ts` `Base`, `Table`, `View`, `RecordRow` (its `values: FieldValues`), `RecordsPage` |
| Personal layer | `src/screens/tables/personalView.ts`: `readLayer(userId, viewId)`, `writeLayer`, `effectiveQuery(view, layer)` (pure, unit-tested), `differsFromShared(view, layer)` for the tint |
| Routes | `app/tables/index.tsx` (bases) · `app/tables/[tableId].tsx` (table) · `app/tables/record.tsx` (record) |
| Card | `src/screens/tables/RecordCard.tsx` over `FieldValue variant="card"` (C9): fixed height from `cardHeight(lines)`; `testID="tables-card-<index>"` (by position, never by database id, per `flow_lint.py` DBID) |
| States | `LoadFailure` (offline / 5xx / 429 sentences), the skeleton from `reusables/skeleton.tsx`, the empty table (its columns + "Add a row"), "No match" + "Clear filters" (increment 3) |
| Strings | `tables.*` in `src/i18n/locales/{en,fr}.ts`; `keys.test` and `locales.test` run before every commit that touches them (`CLAUDE.md`, i18n) |
| Flows | `qa/flows/31-tables-browse.yaml`: arrive from the switcher, open a base, switch tables, open a card, prev/next, back. QA account only, on a base it owns |

---

## F · The build list (from `docs/parity/tables.md`), increment by increment

Each increment ships on its own: en+fr, light+dark, 360/411/800 dp, its flows run, and its manifest in `docs/design/tables/inc-<n>/MANIFEST.md`. Estimates are the audit's, **not measured**.

| # | Increment | What it covers (the audit's M/L rows) | Days |
|---|---|---|---|
| 1 | **Browse** | bases list (cards, search, states); table screen (chip strip, description line, row count, card list, paging + Retry, gallery, quick search, view switch, roles); record screen read-only (16 renderers; WhatsApp/mailto/url; attachment thumbnails; link chips open the linked row); registry entry; notification deep links; Ask about this table | 7–9 |
| 2 | **Edit rows** | the record screen edits (10 editable types), autosave, add row (FAB → the new row opens at once, C3), duplicate, delete + Undo, prev/next + swipe, relations section (link, unlink, create-and-link, Replace), attachments (upload, delete, quota sentence), copy link | 8–10 |
| 3 | **Find + personal views** | Filter & sort sheet (every operator family, AND/OR), multi-sort with typed labels, group with counts and folding, Fields sheet (hide, order, card lines, colour), the personal layer and its tint (C1), "Save as a new view…", "No match" | 6–8 |
| 4 | **Kanban + Calendar** | C6 | 6–8 |
| 5 | **Collaborate** | long-press select + bulk edit/delete + Undo; share (invite, role, resend, remove); comments with @mentions and files; history with filters + restore a column; row activity | 7–9 |
| 6 | **Schema + admin** | field editor (types, options, relation types, lookup/rollup, default, description), duplicate / delete / restore a column, use as title (+ impact), table rename / describe / duplicate / clear / delete (+ impact) / reorder, base create / edit / delete (type the name) | 9–11 |
| 7 | **Import / export** | paste import first; file import (needs the server preview endpoint, parity gap 1); upsert; banner, cancel, refused rows; new table or base from a file; export → share sheet | 8–10 (+1–2 server) |
| 8 | **Forms** | builder tabs, invites, cover, answers → record; the public form in the browser | 9–12 |
| 9 | **Grid (tablet/landscape)** | horizontal grid with a sticky title column, tap-to-edit, widths, summary bar, hardware keyboard | 6–9 |

**Ship points (the audit's):** 1.4 = 1+2 · 1.5 = 3+4 · 1.6 = 5+6 · 1.7 = 7+8 · 9 last.

**Hidden criteria, every increment:**
- dark and light;
- en and fr at 360 dp;
- tablet at 800 dp;
- offline and slow network (keep what is shown, Retry);
- empty, loading and error;
- double tap (create and delete disabled while running);
- roles (viewer);
- recycled cells (fixed height, no layout animation);
- newest first (C3);
- QA account only, every throwaway record deleted and listed.

---

## G · Decided by Hello, 2026-11-20

1. **C1:** the whole personal layer: filter, sort, group, hidden fields and card lines. "That's the spirit of the owner's rule."
2. **C3:** as written. The two server asks were built by multi-magic-9c on `feat/flow-rest-paging` @ `8358b961` (`docs/API_ASKS.md` §6). Deployed (`9730a4f7`).
3. **Design and increments:** approved. **Forms (8), relations (2) and AI (1, "Ask about this table"; import through chat in 7) stay in the plan.** They are the owner's vision for Tables.
4. **Order:** increment 1 starts when e2's field layer is committed and gated. Step 0's device QA takes priority over increment 1 the moment the emulator is free.
5. **Still to decide when increments 7 and 8 come:** parity decisions (c) and (d), with defaults: public form in the browser; a server import preview.
