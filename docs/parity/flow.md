# Flow (project board) — web → mobile parity audit

Date: 2026-11-20. Read-only audit. Web = `~/Apps/Personal/multi_magic` (paths below are relative to it unless prefixed `mobile:`). Mobile = `~/Apps/Personal/mm-parity-audit` @ `4dd5e8f` (release 1.3.0).

## Summary

- **Mobile has no Flow app.** No route, screen, API client or Home tile. The only traces:
  - `mobile:src/apps/registry.ts:10`: "FlowApp, Doc Tools and Tables have no mobile app (owner, 2026-11-17: LATER)". Flow is left out of Home, the app switcher and the Profile menu.
  - `mobile:src/lib/pageContext.ts:37`: `["/flow", "flow"]`, a page-context prefix only (it tells the assistant which web app a path belongs to).
  - `mobile:src/lib/inAppRoute.ts:29-32`: the `flow_project` / `flow_card` link keys return `null`, so a Flow link in chat or a notification opens the preview sheet and then the **web**.
  - **Indirect access already works:** the assistant can read and change boards server-side (`app/services/ai/records/flow.rb`, `app/services/ai/app_catalog.rb:68-72`; MCP `app/services/mcp_server/flow_tools.rb:53-175`). So on the phone a user can *ask* for a card today, but cannot *see* a board.
- **Web Flow is 5 routes, 7 pages/panels and 4 shared field pickers** (about 5,300 lines in `pages/flow_app/` plus about 1,100 in `components/core/`). The server is 8 controllers and 22 flow endpoints, plus 9 generic `core/*` endpoints for custom fields, labels and attachments.
- **Parity scope:** 9 screens and about 10 sheets/pickers on mobile. Honest estimate: **28–32 dev-days**, about 6 weeks for one developer, including i18n, tests, the Maestro flows and the 360/411/800 dp screenshots the DONE rule requires.
- **The hard part on a phone is the Kanban itself:** a multi-column horizontal board with drag between columns. Phone mapping: a one-column-at-a-time pager with column chips, a "Move to…" sheet as the primary move, and long-press drag for reordering inside a column (reuse `mobile:src/screens/todos/DragList.tsx`).
- **The server is mostly mobile-ready.** Gaps:
  1. Project search is ignored server-side.
  2. Neither client gets its own role.
  3. The board payload is unpaginated and, with no sprint selected, returns only cards that have no sprint.
  4. History never records field changes.
  5. The comment serializer's user shape breaks the web's author name.
  6. Project order is `updated_at desc`, against the owner's "newest first" rule (`created_at desc`).

  Details are in **API gaps**.
- **Web bugs found while reading.** Mobile should *not* copy these. They are listed so the mobile build fixes them and does not inherit them:
  - The Due Date shown on a card ≠ the Due Date you edit.
  - A comment's author shows as an id.
  - History shows raw event keys.
  - Changing a column's colour on the board does not refresh it (query-key type mismatch).
  - A card created on a sprint board lands outside the sprint.
  - English literals: field types, "Set column color".
  - No confirm before deleting a sprint, a field, a label or a member.
  - Projects and Backlog show only the first 20 projects.

---

## Web inventory by screen

Legend: **Mobile today** = what exists on mobile at 1.3.0 ("none" unless stated). **MUST** = v1 parity (the owner's default). **LATER** only where truly secondary.

### 0. Entry, shell, routing, cross-app

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| Routes `/flow`, `/flow/backlog`, `/flow/:projectId`, `/flow/:projectId/fields`, `/flow/:projectId/columns`, `/flow/:projectId/cards/:cardId` | `app/javascript/routes/AppRoutes.tsx:220-227` | none | `app/flow/index.tsx`, `app/flow/[projectId]/index.tsx`, `…/columns.tsx`, `…/fields.tsx`, `…/cards/[cardId].tsx` | MUST |
| App header: Kanban icon + "Flow" title; tabs **Projects / Backlog** (NavLink underline) | `pages/flow_app/Layout.tsx:7-46` | none | Segmented control at the top of Flow home | MUST |
| App registry entry (Home tile, switcher, profile menu) | web `lib/apps.ts` APP_REGISTRY; mobile excludes it at `mobile:src/apps/registry.ts:10` | **excluded** | Add a `flow` entry, colour in `mobile:src/theme/appColors` | MUST |
| Command-palette entries: "Flow", "Backlog", quick action "New project" (`/flow?project=new`) | `components/search/registry.ts:165-168,186` | none | App switcher search line, plus a Flow home "+" | MUST |
| Global search returns Flow projects and cards | `app/services/search/sources.rb:162-185` | mobile has no Flow results route | Route `flow_project` / `flow_card` keys in `inAppRoute.ts` once the screens exist | MUST |
| In-app links (`flow_project`, `flow_card`) from assistant sources and notifications | `app/services/frontend_routes.rb:40-41`, `app/services/ai/source_links.rb:28,127-128` | return `null` → preview sheet → web (`mobile:src/lib/inAppRoute.ts:29-32`) | Map both keys to the new screens | MUST |
| URL-driven drawers (`?project=new|<id>`, `?card=<id>`), deep-linkable | `lib/useDrawerParam.ts:5-8`; `Index.tsx:85`; `Board.tsx:49` | none | Expo Router params (`?card=`) plus deep links | MUST |
| AI: the assistant reads and changes boards (projects, columns, cards, sprints, comments, members) | `app/services/mcp_server/flow_tools.rb:53-175`; `app/services/ai/records/flow.rb:15-20`; `app/services/ai/rag_chat.rb:239-241` | **works through chat already** (server-side) | Nothing new to build; the "Ask AI" button on the board/card composes a question (the app's architecture rule) | MUST (AiButton on board and card) |
| Cards are AI-indexed (title, description) for RAG | `app/models/flow_app/card.rb:20-22` | works via chat | none | n/a |
| Realtime / websocket | none: `app/channels/` has no Flow channel | n/a | Pull-to-refresh plus refetch on focus | n/a (no web parity needed) |
| Notifications emitted | Email only: `FlowAppMailer.member_added`, `member_invitation` (`app/mailers/flow_app_mailer.rb:6-27`). No in-app notification, no push | n/a | none | n/a |

### 1. Projects list (`/flow`, Index)

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| Sub-header "Projects" + **New project** button | `pages/flow_app/Index.tsx:65-75` | none | Header "+" | MUST |
| Search field, debounced 400 ms (**the server ignores it**, see gaps) | `Index.tsx:27-28,77-89` | none | Search bar; needs the server fix | MUST |
| Loading skeleton (6 tiles) | `Index.tsx:91-96` | none | Skeleton rows | MUST |
| Error state with Retry (`LoadError`) | `Index.tsx:97-98` | none | `LoadFailure` component | MUST |
| Empty state: icon, "No projects", **Create your first** | `Index.tsx:99-106` | none | Same | MUST |
| Keep rows while a new search loads (dimmed, `keepRows`) | `Index.tsx:31-37,108` | none | `placeholderData: keepPreviousData` | MUST |
| Project card: colour chip, title, 2-line description, stats (cards, sprints, members) | `components/ProjectCard.tsx:30-118` | none | List row | MUST |
| Tap a card → board | `ProjectCard.tsx:39` | none | Row press | MUST |
| ⋯ menu: Edit, Manage members, Project fields, Manage columns, Delete (danger) | `ProjectCard.tsx:52-94` | none | Long-press / ⋯ action sheet | MUST |
| Delete: `window.confirm` with the title, toast | `Index.tsx:45-58` | none | Destructive confirm sheet that names the project | MUST |
| Pagination: server 20/page, **the web never pages** | `projects_controller.rb:11`; `Index.tsx:33` | none | Infinite scroll (`page` param) | MUST |
| Order: `updated_at desc` (owner rule says `created_at desc`) | `projects_controller.rb:8` | none | Ask the server for `created_at desc` (see gaps) | MUST |
| Role gating: none on web, every menu item shows to everyone and the server answers 403 | `ProjectCard.tsx:61-91` | none | Hide what the role cannot do (needs `my_role`, see gaps) | MUST |

### 2. Project form (create / edit drawer)

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| Title (required, inline error) | `components/ProjectDrawer.tsx:120-128` | none | Form sheet | MUST |
| Description (textarea) | `ProjectDrawer.tsx:130-138` | none | Multiline input | MUST |
| Colour swatches: blue, green, red, yellow, purple, pink, orange | `ProjectDrawer.tsx:18-27,140-157` | none | Swatch row (theme tokens) | MUST |
| `icon` field accepted by the API, **no UI** | `projects_controller.rb:59`; `ProjectDrawer.tsx:159-161` (hidden) | none | Skip, as on web | LATER |
| Cancel / Save, disabled while pending; toasts created/updated | `ProjectDrawer.tsx:61-110` | none | Same | MUST |
| New project auto-seeds 6 columns and 6 fields, plus a Labels category with 4 tags | `models/flow_app/project.rb:61-92`; `project/default_fields.rb:1-76` | n/a | Server does it | n/a |

### 3. Members panel

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| Owner row with crown | `components/ProjectMembersDrawer.tsx:169-185` | none | Sheet section | MUST |
| Members list: avatar initial, name or pending email, "Invite pending" | `ProjectMembersDrawer.tsx:187-217` | none | List | MUST |
| Change role per member (Viewer / Member / Admin select) | `ProjectMembersDrawer.tsx:218-238,109-117` | none | Role picker sheet | MUST |
| Resend invite (pending only) | `ProjectMembersDrawer.tsx:239-250,96-107` | none | Row action | MUST |
| Remove member / Cancel invite (**no confirm**) | `ProjectMembersDrawer.tsx:251-259,119-127` | none | Confirm sheet (better than web) | MUST |
| Add: search users (global, ≥2 chars, 6 results, excludes owner and existing members) | `ProjectMembersDrawer.tsx:66-72,129-135,340-371` | none | Search field + results | MUST |
| Add by email: invite a typed address (no account → email invite) | `ProjectMembersDrawer.tsx:137-152,323-339` | none | "Invite <email>" row | MUST |
| Selected person + role picker + Add / cancel | `ProjectMembersDrawer.tsx:271-314` | none | Same | MUST |
| Toasts: added / added by email / invite sent / role updated / server refusal text | `ProjectMembersDrawer.tsx:81-93` | none | Same | MUST |
| Loading skeleton, empty "No members yet" | `ProjectMembersDrawer.tsx:192-199` | none | Same | MUST |
| Leave a board (self-remove allowed by policy) | `policies/flow_app/project_member_policy.rb` `destroy?` (`owner_or_admin? || own`) | none, **no web UI** | "Leave board" row for non-owners | LATER (no web UI) |
| Roles: owner (everything); admin (project edit, members, columns, sprints, fields); member (cards create, edit, move); viewer (read + comment) | `policies/flow_app/*.rb` (project 302-312, card 90-107, column 151-165, sprint 347-369, comment 202-212, member 247-257 in the cat order); `core/field_definition_policy.rb` | none | Gate every control client-side | MUST |

### 4. Board (`/flow/:projectId`)

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| Header: back, project colour chip, title (skeleton while loading) | `pages/flow_app/Board.tsx:160-181` | none | Stack header | MUST |
| ⋯ menu: Project fields, Manage columns | `Board.tsx:183-208` | none | Header ⋯ sheet (also add Members, Sprints, Edit) | MUST |
| **Sprint selector** chip (shows the selected sprint title, or "Sprints") → Sprint manager | `Board.tsx:213-227` | none | Chip → sprint sheet | MUST |
| No sprint selected = **only cards without a sprint** (server `for_board` → `backlog`) | `projects_controller.rb:76`; `models/flow_app/card.rb:73-75` | n/a | Label it honestly ("No sprint") or add an "All" mode (gap) | MUST |
| **Priority filter** chips: All, None, Low, Medium, High, Critical, coloured, toggle | `Board.tsx:229-264,131-135` | none | Horizontal chip row | MUST |
| Sort inside a column: priority rank, then position (client-side) | `Board.tsx:118-144` | none | Same rule client-side | MUST |
| Columns side by side, horizontal scroll, full height | `Board.tsx:276-291` | none | **Pager**: one column per page, column-chip strip with counts | MUST |
| Loading: 4 column skeletons | `Board.tsx:269-274` | none | Skeleton | MUST |
| Error: "Error" + Back to projects | `Board.tsx:146-156` | none | `LoadFailure` + back | MUST |
| Column header: colour dot, title, count, + add card | `components/BoardColumn.tsx:168-190` | none | Page header | MUST |
| Inline column colour picker (7 colours + clear), tap the dot | `BoardColumn.tsx:170-176,192-222,54-63` (**bug**: invalidates `String(projectId)`, the board key is a number, so no refresh) | none | Colour sheet (admin only) | MUST |
| Column accent: top border + tinted background (column colour or project colour) | `BoardColumn.tsx:156-166` | none | Page tint | MUST |
| **Drag cards** within and across columns (SortableJS, touch delay 180 ms) → `PUT cards/reorder` with ordered ids for both columns | `BoardColumn.tsx:65-136`; `Board.tsx:65-91` | none | Long-press drag inside a column (DragList); across columns via **Move to… sheet** (column + position top/bottom), or drag to a chip | MUST |
| Quick add card: textarea, Enter submits, Shift+Enter newline, Esc cancels, Add / ✕ | `BoardColumn.tsx:242-287,138-154` | none | "+ Add card" at the end of the page, keyboard-aware | MUST |
| New card on board: `sprint_id: null` even while a sprint is selected (**bug**: it disappears from the sprint view) | `Board.tsx:74-87` | none | Create in the selected sprint | MUST |
| Card tile: labels (≤3), priority badge (hidden when none), title, due date (red when overdue), assignee initials (≤3), comment count | `components/BoardCard.tsx:89-187` | none | Same tile, fixed height, no layout animations (owner's recycled-list rule) | MUST |
| Overdue rule: due < today, local date | `BoardCard.tsx:20-28` | none | Same | MUST |
| Due date shown = `card.due_date` column, which the UI never edits (**bug**: the editable date is the "Due Date" custom field) | `BoardCard.tsx:62`; see §6 | none | Show the `due_date` field value (fallback: the column), as `Backlog.tsx:133-139` does | MUST |
| Delete card from the tile (hover trash, ConfirmDialog with the title) | `BoardCard.tsx:80-113` | none | Long-press action sheet → Delete (confirm) | MUST |
| Tap / Enter on a card → card drawer (`?card=id`) | `BoardCard.tsx:98-102`; `Board.tsx:97-109` | none | Push the card screen | MUST |
| Keyboard: Enter opens a card; Enter / Esc in quick add | `BoardCard.tsx:102`; `BoardColumn.tsx:247-253` | none | n/a (hardware keyboard optional) | LATER |

### 5. Sprint manager (drawer from the board)

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| List of sprints: title (tap = select / deselect for the board), status badge (planning / active / completed), goal, dates "start — end" | `components/SprintManagerDrawer.tsx:213-279` | none | Sheet list | MUST |
| New sprint form: title (required), goal, start date, end date | `SprintManagerDrawer.tsx:105-193,59-74` | none | Form sheet with native date pickers | MUST |
| Server validation: end ≥ start | `models/flow_app/sprint.rb:40-44` | n/a | Show the server error | MUST |
| Activate (planning → active; the server demotes other active sprints to planning) | `SprintManagerDrawer.tsx:256-265`; `sprints_controller.rb:41-50` | none | Button | MUST |
| Complete (active → completed) | `SprintManagerDrawer.tsx:267-276`; `sprints_controller.rb:52-60` | none | Button | MUST |
| Delete sprint (**no confirm, no aria-label**); cards are nullified to backlog | `SprintManagerDrawer.tsx:235-241,94-102`; `sprint.rb:23-27` | none | Confirm sheet stating the cards return to backlog | MUST |
| Edit sprint (title, goal, dates): API exists, **no web UI** | `sprints_controller.rb:28-34` | none | Edit form | LATER (no web UI; cheap with the create form) |
| Reset end date: API exists, **unused by web** | `sprints_controller.rb:62-70`; routes | none | Skip | LATER |
| Loading skeleton, empty "No sprints" | `SprintManagerDrawer.tsx:196-210` | none | Same | MUST |

### 6. Card detail (drawer `CardDetailDrawer` + full page `CardShow`)

Both web surfaces show the same data. Mobile needs **one** full-screen card screen.

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| Tabs: Detail / Comments / Linked notes / History (drawer); page: Comments / Notes / History plus a properties sidebar | `components/CardDetailDrawer.tsx:42,266-271,359-377`; `CardShow.tsx:53,477-500` | none | One scroll: properties, description, then a segmented control for Comments / Notes / History | MUST |
| Header actions: Delete (confirm), Expand to full page | `CardDetailDrawer.tsx:310-331`; `CardShow.tsx:332-339` | none | Header ⋯ → Delete | MUST |
| Breadcrumb Flow / Project / Card | `CardShow.tsx:314-331` | none | Header subtitle | MUST |
| Title edit (pencil or click → input → Save/Cancel; required) | `CardDetailDrawer.tsx:383-411,332-357`; `CardShow.tsx:347-402` | none | Tap the title → inline edit | MUST |
| **Column** select (auto-save, with colour dots) | `CardDetailDrawer.tsx:416-461`; `CardShow.tsx:658-690` | none | Picker sheet (this is also the "Move to" answer) | MUST |
| Creator (read-only) | `CardDetailDrawer.tsx:463-471` (comment wrongly says "Due Date"); `CardShow.tsx:691-698` | none | Row | MUST |
| **Sprint** select (none + sprints, auto-save) | `CardDetailDrawer.tsx:473-513`; `CardShow.tsx:699-728` | none | Picker sheet | MUST |
| **Custom fields** (`DynamicField` for every field definition): auto-save, 400 ms debounce for scalars via `PATCH core/field_values/batch_update`; record fields save immediately per selection | `CardDetailDrawer.tsx:275-303,516-534`; `CardShow.tsx:246-274,730-748` | none | A field row per definition, by type (next rows) | MUST |
| · text / long_text / phone / email / url (with open / WhatsApp link) | `components/core/DynamicField.tsx:87-148` | none | TextInput (+ link button) | MUST |
| · rich_text | `DynamicField.tsx:150-160` | mobile has a rich-text editor route (`mobile:app/rich-text.tsx`) | Reuse `useRichTextSession` | MUST |
| · integer / decimal (min / max from config; Story Points 0–999) | `DynamicField.tsx:161-184`; `default_fields.rb:431-436` | none | Numeric input | MUST |
| · boolean | `DynamicField.tsx:185-199` | none | Switch | MUST |
| · date / datetime | `DynamicField.tsx:200-212` | none | Native date picker | MUST |
| · single_select (Priority: options with colours) | `DynamicField.tsx:213-244`; `default_fields.rb:414-429` | none | Option sheet | MUST |
| · multi_select | `DynamicField.tsx:245-256`; `components/core/MultiSelectPicker.tsx` | none | Multi-check sheet | MUST |
| · single_record / multi_record: Users (Assignees, Senior Reviewer, Reporter), Tags (Labels), Cards, Sprints; search via `core/record_options` (20/page, Load more) merged with local members / tags / sprints | `components/core/RecordPicker.tsx:97-175,203-262` | none | Searchable picker sheet with paging | MUST |
| · attachment / attachments (upload, delete, server refusal text) | `components/core/AttachmentPicker.tsx:52-104` | mobile has `expo-document-picker` and contact documents (`mobile:src/screens/contacts/ContactDocuments.tsx`) | Document / image picker → multipart upload | MUST |
| Reporter defaults to the creator; Priority defaults to the first option (server seed on create) | `cards_controller.rb:124-148` | n/a | Server does it | n/a |
| Description: read-only rich render, ✎ → RichTextEditor, Save / Cancel; "Add a description" when empty | `CardDetailDrawer.tsx:536-605`; `CardShow.tsx:405-475` | `mobile:src/components/RichText.tsx` renders; `app/rich-text.tsx` edits | Reuse both | MUST |
| Unsaved-changes guard on close / back: Save / Discard / Keep editing; `beforeunload` on the page | `CardDetailDrawer.tsx:86-101,804-868`; `CardShow.tsx:94-102,760-825` | none | Back-gesture guard (`usePreventRemove`) with the same 3 choices | MUST |
| Loading skeleton / error | `CardShow.tsx:276-294` | none | Same | MUST |
| **Comments**: add (single-line input, Send), list (author, date, text), delete (hover ✕, **no confirm**) | `CardDetailDrawer.tsx:199-220,611-666`; `CardShow.tsx:502-550` | none | Composer at the bottom + list; delete via long-press (confirm) | MUST |
| Comment author shows `user.username ?? user.email ?? id`, but the serializer sends `{id, name}` (**bug**: shows the id) | `CardDetailDrawer.tsx:646`; `CardShow.tsx:529`; `serializers/flow_app/comment_serializer.rb` | none | Show `user.name` | MUST |
| Edit own comment: API exists, **no web UI** | `comments_controller.rb:31-37`; policy `update?` = author | none | Long-press → Edit | LATER (no web UI) |
| **Linked notes**: search the user's notes (debounced), link (already-linked rows disabled), list (title, date), open the note, unlink | `CardDetailDrawer.tsx:222-264,669-767`; `CardShow.tsx:552-623` | mobile has Notes (`mobile:src/api/notes.ts`, `app/notes/note.tsx`) | Search sheet → link; row → open the mobile note screen | MUST |
| **History**: user (or "System"), **raw `event_type` key**, timestamp; first page of 30 only | `CardDetailDrawer.tsx:770-795`; `CardShow.tsx:625-652`; `card_histories_controller.rb:10-11` | none | Translated sentence per event (created / moved column X→Y / sprint X→Y / commented), infinite scroll | MUST |
| Card due-date input: **none** (`viewDueDate` is never set by the UI); the editable due date is the custom field `due_date` | `CardDetailDrawer.tsx:68,116`; `CardShow.tsx:69,115` | none | Use the custom field only | MUST |

### 7. Backlog (`/flow/backlog`)

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| Header + description line | `pages/flow_app/Backlog.tsx:233-238` | none | Flow home segment | MUST |
| One accordion per project (first page of 20 only): chevron, title, card count, open-board button | `Backlog.tsx:66-97,221-258` | none | Section list, collapsible | MUST |
| Expanded: loads the board (no sprint), groups backlog cards by column with colour dot and count | `Backlog.tsx:21-29,99-129` | none | Same | MUST |
| Card row: title + due date (field value, fallback to the column); tap → **the board, not the card** | `Backlog.tsx:131-157` | none | Tap → the card screen (better) | MUST |
| Empty per column "No backlog cards" | `Backlog.tsx:160-164` | none | Same | MUST |
| Inline add card per column (Enter / Esc), toast "Card created" | `Backlog.tsx:31-64,166-207` | none | "+ Add" per section | MUST |
| Loading skeleton; empty "No projects"; **no error state** | `Backlog.tsx:241-251` | none | Add an error state | MUST |

### 8. Manage columns (`/flow/:projectId/columns`)

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| Header: back, "Manage columns", project subtitle; hint text | `pages/flow_app/ProjectColumns.tsx:315-341` | none | Screen | MUST |
| Column row: colour dot → 10-colour picker | `ProjectColumns.tsx:70-93,11-22,367-375` | none | Colour sheet | MUST |
| Rename inline (Enter / Esc, ✓ / ✕; blank cancels) | `ProjectColumns.tsx:95-133,257-279` | none | Inline edit | MUST |
| **Final** toggle ("cards here count as finished") | `ProjectColumns.tsx:135-147,281-283` | none | Switch | MUST |
| Reorder by ▲ / ▼ (`PUT columns/reorder`) | `ProjectColumns.tsx:149-169,285-299` | none | Long-press drag (DragList) + ▲ / ▼ for accessibility | MUST |
| Delete column (`window.confirm`); the server moves its cards to the first other column and refuses for the last column with cards | `ProjectColumns.tsx:171-179,379-383`; `models/flow_app/column.rb:35-53` | none | Confirm sheet saying where the cards go; show the server error text | MUST |
| Add column: colour, title (Enter), Add | `ProjectColumns.tsx:389-452,301-311` | none | Form row | MUST |
| Loading text, empty "No columns" | `ProjectColumns.tsx:344-349` | none | Same | MUST |

### 9. Project fields (`/flow/:projectId/fields`)

| Feature | Web file:line | Mobile today | Phone mapping | |
|---|---|---|---|---|
| Header: back, title, project subtitle | `pages/flow_app/ProjectFields.tsx:212-224` | none | Screen | MUST |
| Field cards list (type label, delete with **no confirm**) | `ProjectFields.tsx:228-287,377-388` | none | List → field editor sheet; confirm delete | MUST |
| Edit: name, type (13 types, **English literals**), record class (User / Tag / Card / Sprint), tag category, required | `ProjectFields.tsx:27-41,390-443` | none | Editor sheet, translated type names | MUST |
| Select options editor: label, colour (`<input type=color>`), remove, add (key from the label, duplicates refused) | `ProjectFields.tsx:445-501` | none | Option rows + colour swatch sheet | MUST |
| Tag (label) editor: chips with remove, add label + colour | `ProjectFields.tsx:503-551,187-204` | none | Same; confirm remove | MUST |
| Save: auto-creates or reuses a tag category for tag-record fields | `ProjectFields.tsx:234-275` | none | Same logic client-side | MUST |
| Add field panel: name, type, record class, required, Add (key from the name; tag category auto-created) | `ProjectFields.tsx:290-338,111-166` | none | "+ Field" sheet | MUST |
| Server error message surfaced (`message: string[]`) | `ProjectFields.tsx:18-25` | none | Same | MUST |
| Reorder fields: API `PUT core/field_definitions/reorder` exists, **no web UI** | `core.api.ts:119-131` | none | Skip | LATER |
| Who: owner / admin only (`FieldDefinitionPolicy` → project `update?`) | `policies/core/field_definition_policy.rb` | none | Hide for member / viewer | MUST |

---

## API endpoints mobile needs

All are under `/api/v1`. Responses are camelized by the web's http layer. Mobile's `src/api/parse.ts` must accept the server's snake_case or camelCase, whichever the mobile http layer receives.

### Flow (`config/routes.rb:428-454`)

| Verb | Path | Controller#action | Used for |
|---|---|---|---|
| GET | `/flow_app/projects?page=` | `flow_app/projects#index` (20/page, counts) | Projects list, Backlog |
| POST | `/flow_app/projects` | `projects#create` | New project |
| GET | `/flow_app/projects/:id` | `projects#show` | Edit form, members owner |
| PATCH | `/flow_app/projects/:id` | `projects#update` | Edit |
| DELETE | `/flow_app/projects/:id` | `projects#destroy` (owner) | Delete |
| GET | `/flow_app/projects/:id/board?sprint_id=` | `projects#board` | Board payload (project, sprints, columns, field_definitions, tags_by_category, project_members, cards) |
| GET | `/flow_app/projects/:pid/sprints` | `sprints#index` | Sprint sheet, card sprint picker |
| POST | `/flow_app/projects/:pid/sprints` | `sprints#create` | New sprint |
| PATCH | `/flow_app/projects/:pid/sprints/:id` | `sprints#update` | Edit sprint (LATER) |
| DELETE | `/flow_app/projects/:pid/sprints/:id` | `sprints#destroy` | Delete sprint |
| PUT | `/flow_app/projects/:pid/sprints/:id/activate` | `sprints#activate` | Activate |
| PUT | `/flow_app/projects/:pid/sprints/:id/complete` | `sprints#complete` | Complete |
| GET | `/flow_app/projects/:pid/columns` | `columns#index` | Columns screen, column picker |
| POST | `/flow_app/projects/:pid/columns` | `columns#create` | Add column |
| PATCH | `/flow_app/projects/:pid/columns/:id` | `columns#update` | Rename, colour, final |
| DELETE | `/flow_app/projects/:pid/columns/:id` | `columns#destroy` | Delete column |
| PUT | `/flow_app/projects/:pid/columns/reorder` `{positions:[{id,position}]}` | `columns#reorder` | Reorder |
| GET | `/flow_app/projects/:pid/cards/:id` | `cards#show` | Card screen |
| POST | `/flow_app/projects/:pid/cards` | `cards#create` | Quick add |
| PATCH | `/flow_app/projects/:pid/cards/:id` | `cards#update` | Title, description, column, sprint |
| DELETE | `/flow_app/projects/:pid/cards/:id` | `cards#destroy` (owner / admin / creator) | Delete |
| PUT | `/flow_app/projects/:pid/cards/:id/move` `{card:{flow_app_column_id, flow_app_sprint_id, position}}` | `cards#move` (writes history) | "Move to…" sheet |
| PUT | `/flow_app/projects/:pid/cards/reorder` `{columns:[{column_id, ordered_ids}]}` | `cards#reorder` (**no history**) | Drag reorder |
| GET | `/flow_app/projects/:pid/cards?sprint_id=&filters=&page=` | `cards#index` (50/page, `RecordFilterService`) | Not used by web; candidate for paging (see gaps) |
| GET / POST | `/flow_app/projects/:pid/cards/:cid/comments` | `comments#index` / `#create` | Comments |
| PATCH / DELETE | `/flow_app/projects/:pid/cards/:cid/comments/:id` | `comments#update` / `#destroy` | Edit (LATER) / delete |
| GET | `/flow_app/projects/:pid/cards/:cid/histories?page=` | `card_histories#index` (30/page, newest first) | History |
| GET / POST | `/flow_app/projects/:pid/cards/:cid/note_links` | `card_note_links#index` / `#create` | Linked notes |
| DELETE | `/flow_app/projects/:pid/cards/:cid/note_links/:id` | `card_note_links#destroy` | Unlink |
| GET | `/flow_app/projects/:pid/members` | `project_members#index` | Members |
| POST | `/flow_app/projects/:pid/members` `{member:{user_id|email, role}}` | `project_members#create` → state added / invited / updated | Add / invite |
| PATCH | `/flow_app/projects/:pid/members/:id` | `project_members#update` | Role |
| DELETE | `/flow_app/projects/:pid/members/:id` | `project_members#destroy` | Remove / cancel invite |
| POST | `/flow_app/projects/:pid/members/:id/resend` | `project_members#resend` | Resend invite |

### Shared (`config/routes.rb:382-395`, `306-316`)

| Verb | Path | Controller#action | Used for |
|---|---|---|---|
| PATCH | `/core/field_values/batch_update` | `core/field_values#batch_update` | Scalar custom fields |
| POST / DELETE | `/core/field_record_selections[/:id]` | `core/field_record_selections#create` / `#destroy` | Users / tags / cards / sprints fields |
| POST (multipart) / DELETE | `/core/field_attachments[/:id]` | `core/field_attachments#create` / `#destroy` | Attachment fields |
| GET | `/core/record_options?field_definition_id=&search=&page=&per_page=` | `core/record_options#index` | Record picker search |
| GET / POST / PATCH / DELETE | `/core/field_definitions[?owner_type=FlowApp::Project&owner_id=]` | `core/field_definitions#*` | Fields screen |
| PUT | `/core/field_definitions/reorder` | `core/field_definitions#reorder` | (LATER) |
| GET / POST | `/core/tag_categories[?owner_type&owner_id]` | `core/tag_categories#index` / `#create` | Tag fields |
| GET / POST / DELETE | `/core/tag_categories/:id/tags[/:id]` | `core/tags#*` | Labels editor |
| GET | `/users/global_users?search=` | `users#global_users` | Member search |
| GET | notes list `?search=` (mobile already has `src/api/notes.ts`) | `note_app/notes#index` | Link-note search |

---

## API gaps

1. **Project search is ignored.** The web sends `?search=` (`api/flow_app.api.ts:24-25`); `projects#index` never reads it (`projects_controller.rb:7-13`, `paginate_render` does no search, `application_controller.rb:105-126`). The web search box is cosmetic. **Fix server-side** (title / description ILIKE) before shipping mobile search.
2. **No "my role" anywhere.** `ProjectSerializer` has `owner` and counts but not the caller's role (`serializers/flow_app/project_serializer.rb`). The web shows every control and relies on 403s. Mobile could derive the role (`owner.id == me` or `members` → `user_id == me`), but that costs an extra call per board. **Add `current_role` (owner | admin | member | viewer) to the project and board payloads.**
3. **Board payload is unpaginated and "no sprint" means backlog only.** `projects#board` returns *every* card for the sprint (or every sprint-less card) with field values (`projects_controller.rb:73-118`). That is fine for small boards, heavy on 3G for big ones, and there is no "all cards" view. `cards#index` has paging (50) and `filters`, but no board metadata. Acceptable for v1; flag it for boards with more than a few hundred cards. Option: `board?column_id=&page=` or a `cards#index?column_id=` (the web client already declares `column_id`, `api/flow_app.api.ts:122`, but the server ignores it).
4. **Projects list order is `updated_at desc`** (`projects_controller.rb:8`). The owner's rule is newest-created first by default. Needs the owner's decision or a `sort=` param.
5. **History is incomplete.** `field_updated` is in `CardHistory::EVENTS` (`models/flow_app/card_history.rb:16-22`), but nothing writes it: custom fields change through `core/*`, which knows nothing about cards. `cards#reorder` moves cards between columns **without** a history row (`cards_controller/reorder_action.rb:18-26`), unlike `#move`. Title, description and comment edits and deletes are not recorded either. Mobile should use `#move` for cross-column moves so the history stays right.
6. **Comment serializer user shape.** It sends `{id, name}` (`serializers/flow_app/comment_serializer.rb`); the web reads `username` / `email`, so authors show as ids. Mobile should read `name`. Server is fine; web bug.
7. **Card `due_date` column vs the "Due Date" custom field.** Two sources of truth. The board tile shows the column, users edit the field, the AI / MCP writes the column (`flow_tools.rb` `flow_update_card`). Decide one (recommend: mirror the field into the column, or drop the column from the UI).
8. **Board card count includes nothing about history or notes**, so tiles cannot show a "linked notes" badge. Not needed for parity.
9. **No realtime.** Two people on one board see stale data until refetch. Web parity does not need it; mobile should refetch on focus and on pull.
10. **Global search card scope uses an inner join on members** (`search/sources.rb:176-180` `joins(project: :project_members)`). Cards on a board whose owner has no members never appear in search. Server bug, affects both clients.
11. **Permission mismatch, AI vs app:** the assistant may delete a card only as owner / admin (`ai/records/flow.rb:18-19`), while the app policy also lets the card's creator delete it (`policies/flow_app/card_policy.rb` `destroy?`). Not a mobile blocker; worth aligning.
12. **Comments, note links and sprints are unpaginated.** Fine at realistic sizes.

## Phone-hard items and the phone equivalent

| Web interaction | Why hard on a phone | Phone equivalent |
|---|---|---|
| Multi-column Kanban, horizontal scroll | 6+ columns × 256 px do not fit a 360 dp screen; horizontal scroll fights vertical card scroll | Horizontal **pager** (one column per page) + sticky column-chip strip with counts; optional compact "list" mode grouped by column |
| Drag a card across columns (SortableJS) | Cross-page drag in a pager is fragile; RN has no gesture-handler root in this app (`DragList.tsx:6-7` header) | **"Move to…" sheet** (column + sprint + top / bottom) as the primary path, via `cards#move`; long-press drag only **within** a column (reuse `DragList`); edge-drag to the next page is LATER |
| Hover-only controls (tile trash, comment ✕) | No hover | Long-press action sheet: Open, Move to…, Delete |
| Native `<input type=color>` for options and labels | No colour input | Fixed swatch palette (theme tokens), as the project colour does |
| Two-pane card page (content + properties sidebar) | Width | Single scroll: properties block first, then description, then tabs |
| Inline column colour popover on the board header | Tiny target | Column ⋯ → Colour sheet (≥44 dp targets) |
| Rich-text description editing | Heavy editor | Existing mobile rich-text route (`mobile:app/rich-text.tsx`) |
| Keyboard shortcuts (Enter / Esc / Shift+Enter) | No hardware keyboard | Return key = submit on single-line, a Done button; Esc → back |
| `window.confirm` / `beforeunload` | n/a | Confirm sheets; `usePreventRemove` back-guard |
| Record picker "Load more" dropdown | Small popover | Full-height searchable sheet with infinite scroll |

## Size

**Screens (9):**

1. Flow home (Projects | Backlog segments)
2. Board
3. Card
4. Columns
5. Fields
6. Field editor (could be a sheet)
7. Members (sheet-sized)
8. Sprints (sheet-sized)
9. Project form (sheet)

**Pickers / sheets (~10):** move-to, column, sprint, role, colour, option (single / multi), record picker (users / tags / cards / sprints), date, note-link search, attachment, confirm / unsaved guard.

| Work | Dev-days |
|---|---|
| `src/api/flow.ts` + `src/api/core.ts` (parsers, types, query keys) + Jest | 2 |
| Flow home: projects list (search, paging, ⋯ sheet, delete), project form, registry / Home tile / inAppRoute keys | 2.5 |
| Backlog segment | 1 |
| Members sheet (search, invite by email, roles, resend, remove) | 1.5 |
| Board: pager, column chips, tiles, priority filter + sort, quick add, sprint chip, move-to sheet, in-column drag, column colour | 5 |
| Sprints sheet (list, create, activate, complete, delete) | 1.5 |
| Card screen: title, column / sprint, description via rich-text route, unsaved guard, delete | 2 |
| DynamicField for mobile: 13 types incl. record picker with server search / paging and attachments | 4 |
| Comments, linked notes, history (translated events, paging) | 2 |
| Columns screen (rename, colour, final, reorder, delete, add) | 1.5 |
| Fields screen + editor (types, options, labels, required, add / delete) | 3 |
| Role gating everywhere + i18n EN / FR (~150 keys; the web has ~155 under `flowApp`, `i18n/locales/en.ts:2160`) + a11y labels | 1.5 |
| Design SPEC (Mobbin first), Maestro flows, 360 / 411 / 800 dp screenshots (DONE rule) | 3 |
| Server gaps 1, 2, (4), 7: small Rails changes + specs | 1 |
| **Total** | **≈ 31.5 dev-days (range 28–32; LATER items excluded)** |

DynamicField (types plus the record picker) is the piece with the most reuse value. Tables (`table_app`) uses the same `core/*` field system, so building it as a shared mobile component pays for itself again when Tables is ported.
