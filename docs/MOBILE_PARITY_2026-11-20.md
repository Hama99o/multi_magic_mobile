# Mobile vs web parity, 2026-11-20 (Phase 1: the gap audit and the plan)

Brief: `docs/BRIEF_MISSING_APPS_2026-11-20.md` (owner: "Find all things, then we do").
Read-only audit. Nothing was built, run on a device or deployed.

**Baselines**
- Mobile: `origin/main` `4dd5e8f`, release 1.3.0.
- Web and server: `multi_magic` local `e9adf512`, checked against `origin/master` `f66f85ab`.
- Flow, Doc and Tables are identical on both. The only routes added on `origin/master` are the Notes archive and email change; the Notes/Pages/SafeZone audit read `origin/master` directly.

Every claim below comes from reading the code, with the file and line in the detailed inventories. Nothing here is device-measured.

**Detailed inventories, with every button, menu, state and endpoint at file:line:**

| App(s) | File |
|---|---|
| Flow | `docs/parity/flow.md` |
| Doc | `docs/parity/doc.md` |
| Tables | `docs/parity/tables.md` |
| Tasks + Finance | `docs/parity/todos-finance.md` |
| SafeZone, Notes, Pages | `docs/parity/safezone-notes-pages.md` |
| Contacts, Calendar, Chats, Assistant, Profile, Home/Workspace, cross-cutting | `docs/parity/contacts-calendar-chats-ai-profile-crosscutting.md` |

---

## 0. Correction to the brief

The brief said mobile `origin/main` has only calendar, contacts, notes, pages and chat, and no Todos, Finance or SafeZone. **That is out of date.** 1.3.0 (`4dd5e8f`) ships Tasks (`app/todos/*`) and Finance (`app/finance/*`), and SafeZone (`app/safezone/*`) is on main too. All three are near parity.

The apps truly missing are **Flow, Doc and Tables**. `src/apps/registry.ts:10` leaves them out on purpose: "owner, 2026-11-17: LATER". There are also no unmerged branches holding a missing app. Every `feat/*` branch is 0 commits ahead of main, except `origin/fix/media-kind-by-content`, a Pages bug fix (§3).

---

## 1. The 13 web apps: does mobile have each?

| # | Web app (route) | Mobile today | Web items, has / partial / missing | To close (dev-days) |
|---|---|---|---|---|
| 1 | Notes (`/notes`) | **Mostly** | 39: 28 / 5 / 6 | ~2.5 |
| 2 | Pages (`/pages`) | **Partly** | 57: 35 / 7 / 15 | 12–14 (≈8 without rich-page editing) |
| 3 | Contacts (`/contacts`) | **Mostly** | 27: 23 / 2 / 2 | ~2 |
| 4 | Calendar (`/calendar`) | **Fully** | 15: 15 / 0 / 0 | 0 |
| 5 | Conversations (`/conversations`) | **Fully, bar one button** | 17: 17 / 0 / 0, plus "ask the assistant" in a thread | ~0.25 |
| 6 | Assistant (`/ai`) | **Mostly** | 19: 18 / 0 / 1 (memory review card) | ~1 |
| 7 | Tasks / Todos (`/todos`) | **Fully** | 34: 33 / 1 / 0 (and mobile has more than the web) | ~0.5 |
| 8 | Finance (`/finance/*`) | **Mostly** | 69: 62 / 5 / 2 | ~4 |
| 9 | SafeZone (`/safezone/*`) | **Mostly** | 29: 24 / 3 / 1 (the PIN-on-phone gate is a decision, not a gap) | ~1 |
| 10 | **Flow** (`/flow/*`) | **None** | 9 surfaces, 34 flow routes | **28–32** |
| 11 | **Doc** (`/doc/:tab`) | **None** | 6 tools plus the hub | **30–37** (server ~5–6 of that) |
| 12 | **Tables** (`/tables/*`) | **None** | 4 views, 16 field types, forms, about 60 endpoints | **66–86** |
| 13 | Workspace (`/workspace`) | **None** | split-screen of two apps | 4–6, tablet only; the owner's call (§6) |

Profile, account and auth is not one of the 13 apps but is a web area: 30 items, 24 / 0 / 6, about 3.25 days (§3).

---

## 2. The missing apps, by priority

The owner's rule is full parity, so almost everything is MUST. LATER is used only where the web itself has no surface, or where a phone cannot sensibly do it.

### 2.1 Flow: a project board (Jira/Trello-like). Full list: `docs/parity/flow.md`

**What it is.** Projects, each with a board of columns. Cards carry 13 custom-field types, labels, attachments, rich-text description, comments and history. The web also has sprints (create, activate, complete), a cross-project Backlog, members with roles (owner, admin, member, viewer), Manage columns and Project fields.

**MUST for v1.**
- Projects list and the project form: create, edit and delete.
- Members: invite, change role, remove.
- Board: one column per page, a strip of column chips, and filters and search.
- Card detail with every field editor, labels, attachments and description.
- Comments and history.
- Move a card: a "Move to…" sheet, plus long-press drag inside a column.
- Sprints: create, activate and complete, with the sprint switcher on the board.
- Backlog.
- Columns: add, rename, colour, reorder and delete.
- Project fields: add, edit and delete, all 13 types.
- Role-aware controls, so a viewer sees no edit buttons.
- Empty, loading and error states.

**LATER (the web has no surface for these either).** Edit a sprint, edit a comment, reorder fields, leave a board, reset a sprint's end date, the project icon, keyboard shortcuts.

**Endpoints.** 34 flow routes (`config/routes.rb:428-454`), plus about 12 shared field, label and attachment routes and the user search. There is no realtime.

**Server work needed, about 1 day:**
- The server ignores `?search=` on the projects list.
- No response says what the current user's role is, so add `current_role`.
- The board returns all its cards unpaged.
- With no sprint selected, the board shows only cards that have no sprint.
- Projects are ordered by `updated_at`; the owner's rule wants newest first.
- Card history never records field changes or drag moves.
- A card has two due dates: one the AI writes, one users edit.
- Global search misses cards on boards that have no members besides the owner.

**Web bugs mobile must not copy.**
- The due date on a board card is not the one users edit.
- Comment authors show as an id.
- History shows raw event names.
- A card added while a sprint is selected lands outside that sprint.
- No confirmation before deleting a sprint, field, label or member.
- Only the first 20 projects ever load.
- Field types are in English only.

**Reuse from mobile.**
- The rich-text editor (Notes engine).
- The document picker and the contact-documents pieces.
- The Tasks drag list.
- The custom-field editor, built once as `src/components/fields/` and reused by Tables.

**Size.** 9 screens and about 10 sheets: **28–32 dev-days**, including tests, en+fr, flows and screenshots at 360, 411 and 800 dp.

### 2.2 Doc: a PDF and image toolkit. Full list: `docs/parity/doc.md`

**What it is.** It is *not* a document editor and has no AI. It has six tools:
- **Sign**: saved signatures, drawn or typed, placed on a PDF or an image.
- **Merge** several PDFs or images.
- **Pages**: rotate, delete, reorder, extract and split.
- **Text**: edit the existing words of a PDF in place, on the server.
- **Convert**: image ↔ PDF and image ↔ image.
- **Compress.**

The only thing stored on the server is your signatures. Results are downloaded, never filed into Pages.

**The blocker.** On the web, Merge, Pages, the signature stamping, image→PDF, PDF→images and every thumbnail run in the browser with pdf-lib, pdf.js and canvas. A phone has none of that, so parity needs new server endpoints. The server already has HexaPDF, poppler and libvips.

**The server endpoints to add:**
- G1: merge.
- G2: page operations and split.
- G3: stamp a signature onto a PDF or an image.
- G4b: PDF → images.
- G5: thumbnails in one call, or an upload-once token, so 30 thumbnails are not 30 uploads.
- G6: tell a locked PDF from a broken one.
- G7: the server draws the signature PNG.
- G9: Compress returns raw bytes instead of base64.

**Already usable as they are (10 routes, `routes.rb:280-291`):** signatures (CRUD), image convert, compress, and `pdf/text`, `pdf/page` and `pdf/edit`.

**Possible web bug (G10), read from the code, not reproduced:** Compress shows the target-size field for images, but the server ignores it.

**MUST for v1.**
- The hub, and all six tools.
- Manage signatures: draw, type, delete (with a confirmation, unlike the web).
- Share or save each result: the share sheet, Save to Files, or save to Pages.

**Where the phone does better than the web: a native document scanner.** Edge detection and several pages at once, feeding Sign, Merge, Convert and Compress. The web has no scanning. It needs a native module, so it goes in the next native build and is not EAS-free (§6).

**LATER.** Signature-pad zoom and custom colour, the full-page preview in Merge, Compress's full-screen before/after view, "From Pages" intake, and share-in.

**Size.** About 11 screens and about 209 `doc.*` strings to translate: **30–37 dev-days**.
- Server: 5–6.
- Shared mobile pieces: 4–5.
- Sign: 6–7.
- Text editor: 5–7.
- Merge: 2–3.
- Pages: 2.
- Convert: 1–1.5.
- Compress: 1.5–2.
- Device QA: 3–4.

A useful first slice is about **12–14 days**: hub, Sign, Compress and Convert.

### 2.3 Tables: Airtable-style, built on Core fields. Full list: `docs/parity/tables.md`

**What it is.**
- Bases, tables, 16 field types: text, long text, number, phone/WhatsApp, email, URL, single and multi select, date, checkbox, created time, modified time, attachments, link, lookup, rollup.
- Four views: grid, kanban, calendar and gallery.
- Per-view settings: search, filters with every operator by type and AND/OR, multi-sort, group-by, hidden and ordered fields, row height, row colour, column widths.
- A record sheet with comments and history.
- Bulk actions; copy and paste; import (CSV/XLSX with type guessing) and export.
- Forms: a builder, publishing, and the public `/f/:slug` page.
- Sharing, and AI through the assistant's Tables tools.

**Good news for a phone.**
- Below 720 px the web already switches to cards plus a full-screen row sheet (`TableScreen.tsx:63,1080`), and kanban becomes one column per screen. The native app copies that phone mode, not the desktop grid.
- The server already does search, filter, sort, group counts, summaries and offset paging (200 rows by default, 500 at most).

**API gaps.**
- Import type-guessing runs in the browser with SheetJS. Mobile needs a server preview endpoint, or must bundle the library.
- The records list cannot be asked for only some columns.
- Paging is by offset, so the phone must drop duplicate rows itself.
- Nothing updates live, on the web or the phone.

**Hard on a phone.** The grid at 360 dp, range selection, block copy and paste, drag on kanban and calendar, hover previews, the form builder's side-by-side preview, and tables of 20,000+ rows.

**Increments.** Each ships on its own, and together they reach full parity. About 25 screens and **66–86 dev-days** in all.

| Inc | Content | Ships as |
|---|---|---|
| 1 | Browse: bases, tables, record cards, the record sheet read-only, search | 1.4 |
| 2 | Edit: add, edit and delete rows; every field editor (shared with Flow) | 1.4 |
| 3 | Filters, sorts, group-by, hidden fields, saved views | 1.5 |
| 4 | Kanban and calendar views (plus gallery) | 1.5 |
| 5 | Bulk select and bulk actions, sharing, comments and history | 1.6 |
| 6 | Columns, and table and base settings | 1.6 |
| 7 | Import and export | 1.7 |
| 8 | Forms: builder, publish, submissions | 1.7 |
| 9 | (optional) a real grid for tablets and landscape | later |

Increments 1 and 2 together come to about 15–19 days.

**AI.** Mostly there already, because the assistant on the phone uses the same Tables tools. An "Ask about this table" button is about half a day.

---

## 3. Gaps in apps that already exist on mobile

| App | Missing or partial | Size |
|---|---|---|
| Pages | Storage view (`GET /api/v1/storage`) · ZIP export and import (`/page_app/transfers`) · make a copy and copy-to (`nodes/:id/duplicate`) · replace a file and its versions (`nodes/:id/versions`) · show location · link notes (`nodes/:id/note_links`) · **New page and rich-page editing** (today a read-only WebView, `view.tsx:291-299`) · Markdown edit · Select all · copy link | 12–14 d |
| Pages bug | The owner's iOS bug: a video titled without ".mp4" cannot be saved to Photos. The fix is on **`origin/fix/media-kind-by-content`, 3 commits, unmerged**, and main still names the cache file without an extension (`src/api/pages.ts:417-420`). | merge |
| Notes | Label colour and order · "Linked in Pages" (`GET note_app/notes/:id/note_links`) · send a reminder to a collaborator (`POST notes/:id/send_reminder`) · restore and delete forever from the read view (`note.tsx`) · dictation | ~2.5 d |
| Finance | **Active loans on the Overview** (web `Dashboard.tsx:444-475`, promised in SPEC F7, not built) · links to an expense, income or loan don't open in the app (`src/lib/inAppRoute.ts`) · no "All years" option · no future months or years · an entry's date cannot be empty · budgets are listed oldest first | ~4 d |
| Tasks | The "All done" label on a finished list's card (`GroupCard.tsx:89-97`) | 0.5 d |
| SafeZone | Card rows lack credit/debit, expiry and the expired badge (the data is already in `src/api/safezone.ts:257`) · password strength shows only "weak" · rows have no dates | ~1 d |
| SafeZone (native) | Biometric unlock, password autofill, native clipboard expiry: MISSING_FEATURES #4, waiting on the owner | native build |
| Contacts | The "My Family" tab (`GET contact_app/contacts/family_members`) · search in the relative picker · search fetches only page 1 | ~2 d |
| Chats | "Ask the assistant" inside a thread | 0.25 d |
| Assistant | Memory review card (`GET/PATCH/DELETE /api/v1/ai/memory_review`) | ~1 d |
| Profile and auth | Bio · another person's profile (follow, message, block) · block and unblock (`/api/v1/blocks/*`) · search in the follows lists · the morning-brief toggle · **in-app password reset** (needs universal links) | ~3.25 d |

**Fixed since the 2026-11-16 audit (re-verified, not copied):**
- **Pages:** creating spaces, permissions, sharing, editing spaces, the viewer's header actions, Move paging, spaces newest first, bulk trash.
- **Notes:** Insert Image, sharing.
- **SafeZone:** delete, change or turn off the PIN, forgot PIN, password health.
- **Chats:** starting a chat, search, members.
- **Notifications:** route by path.
- **Assistant:** sends `context`; Clear drops the cached transcript.
- **Profile:** 2FA, devices, keys, MCP.
- **Contacts:** the fields, the family roles, the tablet split, documents.

---

## 4. Other things missing, across apps

| Gap | Web | Mobile | Size |
|---|---|---|---|
| **Global search across apps** | `components/search`, `GET /api/v1/search` | Nothing calls it. `routeForWebPath` can already open the results. | 2–3 d |
| **Remote push notifications** | The bell, plus email | No device-token model or endpoint on the server. The `withoutPushEntitlement` plugin removes push on iOS on purpose. | 4–6 d, server + **native build** |
| **Universal links** (email links open the app: reset, invites, shares) | n/a | Only the `multimagic://` scheme | 1.5–2 d, **native build** |
| Share-to-MultiMagic | n/a | Files go to Pages and a vCard goes to Contacts; **shared plain text and URLs are dropped**, though they could go to a note | 0.5–1 d |
| Storage meter | Yes | No | 0.5 d |
| Workspace split-screen | `/workspace` | No, and `app.json` locks portrait | 4–6 d, tablet only |
| Quick actions, home-screen widgets | n/a | No | native |
| Offline | No cache kept | No cache kept (React Query is not persisted) | parity today; an offline mode would be new on both sides |
| Realtime | Chat and notifications | Chat and notifications | parity |
| i18n | en + fr | en + fr | parity |
| Public table form `/f/:slug` | Web | Not needed: it is for people without an account | — |

### A rule the owner would reject, live in 1.3.0 (not parity, but a defect)

**The owner's 2026-11-17 recycled-list rule is broken.** Reanimated `entering={FadeInDown…}` animations sit on cells of `FlatList`/`SectionList`. I confirmed this with a grep, in:
- **Tasks:** `app/todos/index.tsx:239`, `list.tsx:231`, `due.tsx:117`, `templates.tsx:85`.
- **Finance:** `src/screens/finance/Ledger.tsx:196`, `tabs/Loans.tsx:192`, `tabs/Budgets.tsx:49`, `app/finance/categories.tsx:111`, `recurring.tsx:130`, `trash.tsx:114`.
- **SafeZone:** `app/safezone/index.tsx:256`, plus a scale transform at `:275`.

That is 11 row sites, all confirmed by grep. The expense/income list also swipes rows sideways with a transform (`Ledger.tsx:228-257`). **Fix before the next release**: about 0.75 day plus a device check.

---

## 5. Build order: recommended, the owner picks

Hello suggested Flow → Todos → Docs → Tables → Finance → SafeZone. Todos, Finance and SafeZone already exist, so they become small parity sweeps rather than builds. My recommendation:

| Step | What | Days | Why here |
|---|---|---|---|
| 0 | **Hygiene release**: the recycled-list fix (§4), merge `fix/media-kind-by-content`, the Tasks, Finance and SafeZone sweeps, Contacts' My Family, the assistant's memory card, "ask the assistant" in a thread | ~8 | Fixes owner-rule breaks in shipped code and closes three apps to 100% before a new one opens. It is cheap and needs no server work. |
| 1 | **Flow** | 28–32 | The owner uses it every day. It builds the **shared field editors** that Tables reuses. Its server changes are about a day and low risk. |
| 2 | **Tables** inc 1–2, then 3–8 | 66–86 | The biggest app, and it starts with the field kit from Flow already done. Each increment ships on its own. |
| 3 | **Doc** | 30–37 | It needs about 6 days of new server endpoints first, and the scanner needs a native build. Batch it with push and universal links into **one EAS build**, since builds are scarce. |
| 4 | **Pages** rest | 12–14 | Rich-page editing reuses the Notes engine. |
| 5 | Cross-cutting: global search (any time, no native build), then universal links, the in-app reset and push (in the native build of step 3) | 8–11 | |
| — | Workspace split-screen | 4–6 | Only if the owner wants landscape and tablet; today the app locks portrait. |

Why not Doc before Tables: Doc blocks on server work and a native module. Tables runs on a server that is already ready for a phone (it filters, sorts and pages on the server) and reuses Flow's field editors.

**Total to full parity:** about 165–205 dev-days. Tables is roughly 40% of it.

---

## 6. Owner decisions this plan needs

1. **The order** (§5).
2. **Flow, Tables: newest first.** Flow lists projects by last update. Table rows are in manual order and a new row lands at the end. Both conflict with "lists are newest first".
   - Proposal for Flow: projects by `created_at desc`.
   - Proposal for Tables: keep manual order as a sort option, but default the **phone** to newest first.
3. **Tables: a filter changed on the phone.** Does it change the shared view for everyone, as on the web, or stay on this phone only?
4. **Tables import.** A server preview endpoint (recommended), or bundle SheetJS (about +1 MB)?
5. **The public table form.** Open it in the browser or in the app?
6. **Doc.** May the server get the 8 new PDF endpoints (G1–G9)? And may the scanner go into the next native build?
7. **Native build contents** (one EAS build): the scanner, universal links, push, and optionally biometrics from MISSING_FEATURES #4.
8. **Workspace on tablets**, which means unlocking landscape: yes or no?
9. **Finance sorts.** Recurring rules are sorted by next date and categories A–Z. Keep those as the default, or switch to newest first with those as options?

---

## 7. Mobbin references (RULE ZERO; screens cited, images not linked)

The receipts go into each app's `docs/design/<app>/SPEC.md` when that app starts.

**Flow:**
- Trello board: one list per column, with "+ Add card" — `mobbin.com/screens/fbe9187e-cfce-4b77-8d78-19974fe884df`
- Trello drag-to-archive — `mobbin.com/screens/e2192719-32c5-4038-a35c-5e2575eb88e5`
- Trello card detail with quick actions and a comment bar — `mobbin.com/screens/ecdcf34c-a486-47f4-907d-1edad830558c`
- Trello board menu: members, custom fields, activity — `mobbin.com/screens/faa42e01-4127-4d54-b397-040c2d1273d2`
- GitHub Projects view switcher (Backlog, board, …) and grouped, collapsible columns — `mobbin.com/screens/7d35dba1-4695-4d82-9d6e-cc648bf9ad73`

**Tables:**
- Airtable bases list with search — `mobbin.com/screens/ec29737d-9ce0-40fa-9cb7-d7ba1695209f`
- Records as cards, with a toolbar for view, hidden fields, filter and group, and a filter builder — `mobbin.com/screens/e8395017-72f7-4c04-8a45-dba11c084413`
- Per-type filter operators — `mobbin.com/screens/f9cc819f-a8a1-4428-b197-740008f305c0`
- Record menu: activity, copy URL, duplicate, customize fields, delete — `mobbin.com/screens/ecc8c0c5-3cde-4066-8682-607a67636702`
- Edit table — `mobbin.com/screens/f12dd735-5632-4ca2-a039-6260c892e61c`

**Doc:**
- Fresha "Add a signature" with Type/Draw tabs (the simplest one found) — `mobbin.com/screens/d6becd9c-f79e-4e33-8fa9-0f4921b1777b`
- Docusign landscape draw pad with colours — `mobbin.com/screens/92cf1389-8540-4331-a781-ba0078aff7d8`
- Freeform signature picker on a PDF — `mobbin.com/screens/0f1b692a-fc42-44fb-b6a3-2b4ea9e1f4e6`
- Craft PDF export preview — `mobbin.com/screens/dc41dccc-0c44-4553-bee9-94157e35f6f4`

**Still to search when each app starts:** the Doc tool hub, page thumbnails and reorder, a document scanner, and Tables kanban and calendar.

---

## 8. Done means, per app (the checks that prove it)

The same contract for each app, on top of the CLAUDE.md gates:

1. **Every MUST row** in that app's `docs/parity/<app>.md` is marked HAS with a mobile file:line, or carries a named, owner-approved exception.
2. **Red first, then green.** A Jest test for each action, planted break shown. Then `npm run lint`, `typecheck`, `test` and `bundle` (after `nvm use`).
3. **Hidden criteria:** dark and light, en and fr (no French string cut at 360 dp), phone 360 and 411 plus tablet 800 dp, empty, loading and error states, slow network, double taps, permissions and roles (a viewer sees no edit control), lists newest first, no layout or transform animations on recycled cells, stable cell height.
4. **Maestro flows**, arriving the way a user arrives (Home tile → app), with destructive paths opened and cancelled, and a register row that says what each flow does NOT cover.
5. **Device QA on ONE emulator**, in a slot Hello gives. `docs/design/<app>/ours/` holds 360, 411 and 800 dp shots, and the contact sheet is uploaded to MultiMagic Pages.
6. **The SPEC is updated** in the same commit; the board row goes to DONE.
7. **No** EAS build, store build, deploy or push to main without the owner's yes.
