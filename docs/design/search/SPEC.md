# Global search — one field for every app (2026-11-21)

Status: **IN PROGRESS**

The web has a search palette in its top bar (`components/search/SearchDialog.tsx`,
⌘K) over one server endpoint, `GET /api/v1/search?q=` (`search_controller.rb`,
`services/search/{global,sources}.rb`). The phone had no caller of it: search
lived inside each app only (re-audit `docs/parity/contacts-calendar-chats-ai-profile-crosscutting.md`,
"Global search: MISSING", 2–3 d).

## A · What the web and the server have

| Web (multi_magic `feat/mobile-server-gaps` 26ce8e01, multi-magic-83) | Phone |
|---|---|
| Search button first in TopNav (`TopNav.tsx:147`), before Workspace, Chats, Notifications, AI, Apps | **Tablets (≥ `SPLIT_AT`):** the same key, first and icon only, in `AppHeader`. **Phones:** a search field at the top of Home, and "Search everything" first in the Apps sheet (header › Apps), which carries what was typed. See §C 0 |
| One request per debounced query, `q` of 2+ characters (`MIN_SERVER_QUERY`, `Search::Global::MIN_QUERY_LENGTH`) | Same: 300 ms debounce, 2 characters, the previous request aborted |
| Records: 19 kinds in 11 groups, each with `title`, `subtitle`, `to` (a web path) and `score`; ranked by the server, 5 per source, 40 in all | Same rows, in the server's order, under group headings |
| Pages (static screens) matched locally with the same score tiers (`rank.ts`) | The phone's apps from `APP_REGISTRY`, matched locally with the same tiers |
| Commands ("New expense", "New contact"…) | The ones with a phone screen: new expense, new income, new contact, new event, new password |
| Recents: the last 6 things opened, per browser (`useRecentSearches.ts`) | The last 6, per user on this phone (AsyncStorage), with Clear |
| Selecting a row navigates to `to` | `routeForWebPath(to)` (`src/lib/inAppRoute.ts`); a path the phone has no screen for asks the assistant about the row instead (the app's rule: no dead end, no web hop) |

Server paths since 26ce8e01: a Pages hit is `/pages/:space?node|preview|folder=:id`
(no more `/explorer`), which `routeForWebPath` already reads. To add here:
`/finance/expenses?expense=`, `/finance/income?income=`, `/finance/loans?loan=`,
`/safezone/passwords?password=`, `/safezone/payment-cards?card=`,
`/safezone/identities?identity=`. Flow (`/flow/:id?card=`) is mapped on the
Flow branch, which owns those screens; until it merges, a Flow hit asks the
assistant. Doc and AI documents have no phone screen: they ask the assistant.

## B · Sources (Rule Zero; images in `references/`, gitignored)

- Notion, search: field at the bottom, "Ask AI anything" as the first row, recents by day — https://mobbin.com/screens/c119cf0c-6553-47b2-aead-63d060159283
- Raycast: Recent (with Clear), then Commands, the field on top with Cancel — https://mobbin.com/screens/f6a52c1a-70a0-4d9f-8d9f-129a39e8e738
- Evernote: Recent searches, "Go to…", filters — https://mobbin.com/screens/bdc7e0b5-08fc-4b75-aec3-1fe81026de9d
- ClickUp: a sheet with recents and type tabs — https://mobbin.com/screens/a905bdb5-5be5-4d75-9e27-d91a83f6ec1a
- Shelf and Binance: results under plain section headings by type — https://mobbin.com/screens/0732d1f4-f61a-4ea0-b84e-6be1f8a48f63, https://mobbin.com/screens/55c7c16d-3c4c-4c88-afef-b3474f9e9dbd

## C · Decisions

0. **Where search opens: NEEDS HAMMA9900 to confirm (decided by Hello for
   him, 2026-11-21, to be overruled on Tuesday if he wants).** The shell rule
   says the header follows the web's TopNav, and TopNav's first key is
   Search. But a sixth key at 360 dp takes `titleRoom` from 104 to 68 dp, and
   French "Notifications" needs about 91 dp even at the 75 % floor: it would
   break the other shell rule, "an app's name is never cut on a phone". So:
   the header key on tablets only (`header-search`, icon only as on the web);
   on phones, Home's search field (`home-search`) and the Apps sheet's
   "Search everything" (`switcher-global-search`), one tap from every screen.
   Rejected: 32 dp buttons for six keys (360 dp would leave ~92 dp, but 340 dp
   only 72).
1. **A screen, not a sheet** (`app/search.tsx`, a modal route like `/chat`):
   the field on top with Cancel (Raycast, ClickUp), the keyboard up at once.
   It opens over the current screen, so Cancel returns exactly there.
2. **Before typing:** Recents (Clear), then "Go to" with every app. An empty
   search is never a dead end (the web's own rule, `SearchDialog.tsx:248`).
3. **While typing:** "Ask the assistant about “…”" first (Notion), then Apps
   and Commands that match, then the server's records under their group
   headings, in the server's order. Each row: kind icon, title, subtitle,
   and a small kind badge ("Note", "Expense").
4. **One character:** only local rows (apps, commands); the server is not
   asked (it answers nothing below 2).
5. **States:** searching (a thin line, the last rows kept: stale beats
   empty), nothing found (says so, offers Ask), offline or failed (LoadFailure
   with Try again), unreadable rows counted (`readableRows`).
6. **SafeZone:** a hit is a title and a link, never a secret (the server's
   own rule). Opening it goes through the SafeZone PIN gate as usual.
7. **No new endpoint.** Everything above exists on the server today.

## D · How we code it

- `src/api/search.ts`: `searchApi.all(q, signal)`, parsed with `parse.ts`
  (`readableRows`), groups and kinds as closed unions.
- `src/lib/inAppRoute.ts`: the finance and SafeZone paths above.
- `src/screens/search/rank.ts`: the web's tiers (`EXACT 100 … SUBSEQUENCE 20`), ported with its tests.
- `src/stores/searchRecents.ts`: AsyncStorage `mm.search.recents.<userId>`, 6, newest first, deduped by `to`.
- `src/screens/search/useGlobalSearch.ts`: debounce, `useQuery` keyed by the query with `placeholderData: keepPreviousData` and the abort signal.
- `app/search.tsx`: the screen. `AppHeader` gains `header-search` first on the right.
- i18n: `search.*` in en and fr.

## E · Checks

| Criterion | Check |
|---|---|
| The API is read as the server sends it, bad rows counted | `src/api/__tests__/search.test.ts` |
| Every server `to` opens a phone screen or asks | `inAppRoute.test.ts` + `search.test.tsx` |
| Debounce, 2-character floor, one request per pause | `app/__tests__/search.test.tsx` (fake timers) |
| Recents: remembered, deduped, capped, cleared, per user | same |
| Header: the search key on every app, labels still fit at 340/360 dp in en and fr | `appShell.test.tsx` |
| Pixels: 360/411/800, light/dark, en/fr | device, `ours/` |
