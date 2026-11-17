# App shell — one header everywhere, the app switcher, Home — SPEC

**Status: IN PROGRESS** (2026-11-17). The owner OK'd the design ("ok design"), then
reversed one decision: **AI is in the header** ("add AI also in topbar, it's
important, same as we have in web"), mockup 4. He also added **reopening
where he left it, never Home** (§J). Built on this branch; device QA to come. Branch `feat/app-shell-header`, off
`feat/todo-finance-apps` (so Tasks and Finance are in the switcher).

The owner's words (via Hello, 2026-11-17, cleaned up):

- *One shared top header on EVERY app, the same as the web: Chats,
  Notifications, Home (all apps grid) and Profile. Below the header each app
  keeps its own tabs and design, but the top must be identical everywhere.*
- *Fast app switching without going back to Home:* (a) an apps-grid button in
  the header that opens a sheet of ALL apps (the main switcher), and (b) the
  Profile menu's app list made complete and collapsible.
- *Improve the Home page to match the web's Home, in a mobile style.*

---

## A · What the web does (read from multi_magic `master`)

| # | Web | File | Mobile mirrors it as |
|---|---|---|---|
| A1 | One `TopNav` above every app route; 56 px; sticky | `components/layout/MainLayout.tsx`, `components/layout/TopNav.tsx:60-451` | `AppHeader`, 56 dp, on every app screen (§C) |
| A2 | Logo + "MultiMagic" (hidden under `sm`) → `/` | `TopNav.tsx:128-142` | The mark at the far left → Home |
| A3 | Search, Ctrl K → global search | `TopNav.tsx:148-160`, `useGlobalSearch.ts:15` | **LATER**: in the switcher sheet the search field finds apps; global search stays in the assistant (see §F) |
| A4 | Workspace (desktop only; a tile on phones) | `TopNav.tsx:163-181` | Not on mobile (the web hides it on phones too) |
| A5 | Chats `MessageSquare`, red badge, cap "9+", count = conversations with unread | `ChatLauncher.tsx`; `GET /api/v1/conversations/unread_messages_count`, stale 30 s | Chats button → `/chats`, badge `unreadConversations`, cap 9+ |
| A6 | Bell, red badge, cap "99+" | `NotificationBell.tsx`; `GET /api/v1/notifications/unread_count`, refetch 5 min | Bell → `/notifications`, cap 99+ |
| A7 | AI `Sparkles` toggles the assistant window | `TopNav.tsx:200-234` | **The header's AI button** (owner's reversal, 2026-11-17), plus the switcher's first row and the Home Ask box (§C2) |
| A8 | Apps grid `LayoutGrid`, "Apps"/"Applications": 3 columns on phones, 4 from `sm`; active app ringed; no groups | `TopNav.tsx:237-328`, `lib/apps.ts APP_REGISTRY` | The switcher sheet (§D) |
| A9 | Avatar → Profile, Logout, Theme, Language | `TopNav.tsx:331-421` | Avatar → the existing `ProfileSheet`, plus the Apps section (§E) |
| A10 | App order: SafeZone, Notes, Tasks, Pages, Finance, FlowApp, Chat, Doc Tools, Contacts, Calendar, Tables, (Workspace), AI | `lib/apps.ts` | Same order, mobile apps only (§D3) |
| A11 | Home: Coming up (5 events, 30 days), hero, promos, 11 app tiles with a one-line description, What's new | `pages/Home.tsx`, `UpcomingCard.tsx` | Home in a mobile style (§G): greeting, Ask box, Coming up, every app as a tile with its line |
| A12 | No global back: detail screens have their own `ArrowLeft` to a fixed parent | `Board.tsx:165`, `TableScreen.tsx:1472` | A back chevron in the header's left slot on a sub-screen (§C3) |

## B · Mobbin references (best-app expectations)

Mobbin's search returns iOS and web only. Android follows the same layout as a
Material top app bar.

| Ref | What we take |
|---|---|
| Notion (iOS) home header — [screen](https://mobbin.com/screens/d120561c-525c-42e5-a177-c5bfa948a721) | Chat, inbox and home together in one compact row; a dot on the inbox |
| Revolut (iOS) — [screen](https://mobbin.com/screens/62272aa1-883e-4c36-b853-7a0706983d62) | One header that never changes while the tabs below do; round 36–40 dp buttons |
| Deel Hub (iOS) — [screen](https://mobbin.com/screens/f0d9a998-845e-438b-8d22-7d8df3ca106e) | Bell with a red number; initials avatar at the far right; typing in the app search turns the grid into a list (icon, name, one line) |
| ClickUp (iOS) — [screen](https://mobbin.com/screens/8e82f4aa-d143-4614-85fc-76db9a369efd) | The current place's name sits in the header, at the left |
| Grab (iOS) — [screen](https://mobbin.com/screens/5913ee73-d562-4dbf-aaeb-15dc9d123e7f) | Avatar on the right; a red dot for messages |
| Notion accounts sheet — [screen](https://mobbin.com/screens/27dfe1df-5eea-4e4f-9272-cb3ec0b265e3) | A bottom sheet with a grabber; the current one has a check; switch in one tap without leaving the page |
| Slack workspaces — [screen](https://mobbin.com/screens/e4fa504c-e639-497e-a270-f34b305dc437) | The active one is ringed; others carry their unread badge |
| Binance Services — [screen](https://mobbin.com/screens/14177385-fb7a-44fd-b8ca-2e307526f642) | Search on top, then a 4-column grid with labels |
| Discord apps sheet — [screen](https://mobbin.com/screens/2bfac55e-30df-4838-add1-f691b459cf89) | Search and a featured row before the grid |
| Gojek — [screen](https://mobbin.com/screens/a74293bd-f572-4c6a-a3dc-4d2d826efb63) | Home: a 4-column app grid under one hero card |
| Jira Cloud — [screen](https://mobbin.com/screens/496fadb6-04ab-41e1-ad9d-b5834ccb761b) | Home: "Hello …" plus search, then quick access, then recents grouped by day |
| monday.com — [screen](https://mobbin.com/screens/6da40a82-36a6-4c09-9929-0277e9f95dc0) | Home cards with "see all"; relative times |

**Decided against:** the avatar at the far LEFT (Revolut, Notion). The web puts
it far right, and the owner asked for "the same as the web". The left belongs
to the mark, or to back on a sub-screen.

---

## C · The header (`AppHeader`)

### C1 · Layout (phone, 360–430 dp)

```
┌ safe area (status bar) ─────────────────────────────────┐
│ [◆ or ‹]  App name ………  [💬•3] [🔔•12] [✦] [▦] [(AM)]    │  56 dp, full width
├─────────────────────────────────────────────────────────┤  hairline `border`
│ the app's own row: search / tabs / ⋮ (unchanged design) │
```

- **Left slot, 40 dp**:
  - On an app's root screen: the MultiMagic mark (the app's own colour badge,
    28 dp, `tileColors(app).badge` with the app's glyph). Tap → Home, like the
    web's logo.
  - On a sub-screen (a list, a loan, an event): a back chevron instead (§C3).
- **Title**: the app's name ("Tasks", "Finance"), or the sub-screen's name;
  17 sp/600, one line, ellipsized. Never a second big title below it: the
  apps' current 26 sp title rows go away, and their actions move into the
  app's own row.
- **Right cluster**: 5 buttons, in the web's order. Each is 40 × 40, 4 dp
  apart, or 36 × 36, 2 dp apart, under 400 dp (§C2). The vertical `hitSlop`
  brings the touch target to 48.
  1. **Chats** (`MessageSquare`) → `/chats`. Badge `unreadConversations`, cap
     "9+".
  2. **Notifications** (`Bell`) → `/notifications`. Badge, cap "99+".
  3. **AI** (`Sparkles`, always accent-tinted like the web's pill) → `/chat`
     over the screen. Read aloud as "Ask the assistant".
  4. **Apps** (`LayoutGrid`) → the switcher sheet (§D).
  5. **Avatar**: the photo or initials → `ProfileSheet` (§E).
- **On the screen a button leads to** (Chats, Notifications), that button is
  shown pressed (accent tint) and tapping it does nothing. The header does not
  change shape.
- **Badge**: a red pill (`danger`), 16 dp high, 11 sp/700 white, at the top
  right of the icon, ringed 2 dp in `ground` so it reads on any surface.
  `accessibilityLabel` reads "Chats, 3 waiting" / "Notifications, 12 unread"
  (the web's own strings).
- **Width check at 360 dp**: 360 − 2 × 16 gutter = 328. The right cluster is
  4 × 36 + 30 (avatar) + 4 × 2 = 182. The left slot is 32 + 8 gap. That leaves
  about 100 dp for the title, so "Notifications" and "Calendar" ellipsize.
  Under 340 dp the title gives way to the badge (§C2, mockup 4).

### C2 · Five buttons, the web's order (decision reversed 2026-11-17)

The first design left AI out to make room at 360 dp. The owner reversed it:
*"add AI also in topbar, it's important, same as we have in web"*. The right
side is now **Chats, Notifications, AI, Apps, Avatar**. The rule is written in
`src/components/shell/CLAUDE.md`. Room is made by shrinking, never by dropping
a control:

| Width | Buttons | Title |
|---|---|---|
| ≥ 400 dp | 40 dp, 4 dp apart | full, ellipsized if long |
| 340–399 dp | 36 dp, 2 dp apart | about 96 dp at 360: "Calen…", "Notific…" |
| < 340 dp | 36 dp | badge only; the name is read aloud with it |
| ≥ 800 dp | labelled pills | full |

The AI button pushes `/chat`, a modal, so the screen stays underneath, as the
web's assistant window floats over the page. Search and Workspace stay off
phones; the web hides Workspace there too.

### C3 · Back behaviour

- **An app's root screen** (Notes, Tasks, Finance…): no back arrow. The mark
  goes Home. Android's back key goes back in history, otherwise to Home: the
  existing `useBackToHome` (`src/hooks/useBackToHome.ts`) moves into
  `AppHeader`, and the copies in `app/notes/index.tsx:181` and
  `src/screens/pages/drive/ui.tsx:166` are deleted.
- **A sub-screen inside an app** (a Tasks list, a loan, an event, a contact): a
  chevron in the left slot. Tap → `router.back()`, or the app's root when there
  is no history (a deep link). The same applies to the Android key.
- **Switching apps from the sheet** uses `router.replace` to the new app's
  root when the current screen is an app root, and `router.push` from a
  sub-screen. So back never cycles through every app visited, and Home stays at
  the bottom of the stack (`unstable_settings.initialRouteName = "home"`).
- **No shell** on full-screen focused surfaces:
  - the note editor;
  - a chat thread;
  - the assistant conversation;
  - modals (entry, editors);
  - sign-in, lock screens.

  These keep their own back/close. This is the web's rule too: pages outside
  `MainLayout` and workspace panes draw their own chrome.
- **Selection modes** (Notes, Contacts) keep replacing the app's own row, not
  the shell row.

### C4 · Platforms, safe area, dark, RTL, tablet

- **Safe area**: `AppHeader` sits inside `Screen`. It does not add its own top
  inset, because `Screen` and `OfflineBanner` already own it
  (`ScreenContainer.tsx:438`). The header background is `ground` and the status
  bar stays as today.
- **iOS / Android**: same layout. Android gets `android_ripple` (borderless, 20
  dp); iOS uses opacity 0.6 on press. No Pressable function style (lint rule).
- **Dark**: tokens only (`ground`, `ink`, `inkMuted`, `border`, `accent`,
  `danger`); no new colours.
- **RTL**: a `flexDirection: "row"` row flips by itself. The chevron and the
  switcher's arrow mirror on `I18nManager.isRTL`, as `MonthGrid.tsx:43` already
  does. There is no RTL language yet, so it is checked with a jest render under
  `isRTL`.
- **Tablet (≥ 800 dp, `SPLIT_AT`)**: the header spans the full width (not the
  640 measure). The buttons get text labels next to the icons ("Chats",
  "Notifications", "Apps"), as the web shows labels from `lg`. The switcher
  becomes a centred card 560 dp wide with 5 columns.

## D · The switcher sheet

1. A bottom sheet at about 70 % of the height, with a grabber; drag down or tap
   outside to close. On tablet it is a centred card.
2. In order:
   - a search field "Find an app" / "Trouver une app". Typing turns the grid
     into a list: icon, name, one line.
   - "Ask the assistant" as a wide row in the assistant's gradient (kept with the header's AI button).
   - the grid: 4 columns on phones, 5 on tablets. Each tile is the app's colour
     badge (`tileColors`), its label, and its unread badge (Chats,
     Notifications). The current app gets a ring in its colour, as on the web
     and in Slack.
   - "Home" as the first tile, so Home is one tap away too.
3. **Every mobile app, in the web's order**: Home, SafeZone, Notes, Tasks,
   Pages, Finance, Chats, Contacts, Calendar, Assistant, plus the mobile-only
   ones: Notifications and Conversations (past questions). FlowApp, Doc Tools
   and Tables have no mobile app; they are **LATER**: an "On the web" row that
   opens them in the browser, if the owner wants it.
4. **One registry for all three lists**: `src/apps/registry.ts` (key, route,
   icon, i18n label, line, colour) replaces the hand-written lists in
   `app/home.tsx:150-162` and the Pages row in `ProfileSheet`. Home, the sheet
   and Profile cannot disagree.

## E · Profile menu: the complete, collapsible Apps section

`ProfileSheet` gets an "Apps" / "Applications" row with a chevron, collapsed by
default. Open, it shows every app from the registry as a compact list (badge,
name), the current one checked. Whether it is open is remembered per device
(AsyncStorage, wrapped in try/catch). The lone "Pages" row
(`profile-open-pages`) goes, because Pages is in the list.

## F · Data

- `useShellBadges()` in `src/hooks/`, the one source for the header, the sheet
  and Home. It reads the existing keys:
  - `conversationKeys.unreadCount()`: stale 30 s, as the web;
  - `notificationKeys.unreadCount()`: refetch every 5 min, as the web.

  Both refetch when the app comes to the foreground. No new keys and no new
  endpoint. The optimistic mark-read in `useMarkNotificationRead` already
  updates the same key.
- Global search (the web's Ctrl K) is **LATER**: there is no mobile search
  endpoint wrapper yet; the assistant already answers across apps.

## G · Home, in a mobile style

The web's Home is a landing page (hero, promos). On mobile the shell already
says what the app is, so Home keeps the web's useful parts in this order:

1. The shell header, with the title "MultiMagic" and the mark.
2. Greeting: "Hello {name}. What do you need today?" (the existing
   `home.greetingName`).
3. **Ask box**: a wide field in the assistant's gradient border, "Ask about
   anything you keep here" → `/chat`.
4. **Coming up** (the web's `UpcomingCard`): the next 5 events in 30 days,
   "Today"/"Tomorrow" chips, "Open the calendar". Hidden when there is nothing
   coming. Read from the existing calendar API.
5. **All apps**: the registry as tiles. 3 columns on phones (each tile has the
   web's one-line description), 4 from 600 dp, 6 on tablets. The last-used ring
   stays. Badges come from `useShellBadges`.
6. **LATER**: "What's new" and recent activity across apps (no endpoint).

## H · MUST / SHOULD / LATER

- **MUST**:
  - `AppHeader` on every app root and sub-screen listed in §C3;
  - the switcher sheet;
  - the registry;
  - the Profile Apps section;
  - the Home redesign;
  - the badges;
  - back and Android back;
  - light and dark;
  - tablet;
  - en/fr;
  - the RTL render test.
- **SHOULD**: tablet labels; the search in the sheet.
- **LATER**: the "On the web" apps; global search; What's new and recents on
  Home.

## I · How it is tested

Test-first, in jest:
- every app root renders `app-header` with the same four testIDs
  (`header-chats`, `header-notifications`, `header-apps`, `header-profile`);
- the sheet lists every registry app and navigates with replace or push;
- badges cap at 9+ and 99+;
- the Profile section collapses and remembers its state;
- back on a sub-screen versus an app root;
- an RTL render.

Then the full gates. Device QA on one emulator (slot from Hello): every app,
the same header; jumping between all apps; back; badges; light/dark; phone and
tablet. A contact sheet goes beside these Mobbin refs.

## J · Reopening where he left it (owner, 2026-11-17)

His words: *"a cache system: if I close the app while in one app, when I open
it again it should open in the same app"*, then *"not home page, it's very
important"*. The rules are in the repo `CLAUDE.md`, "Reopening the app".

- **What is saved.** `src/apps/lastPlace.ts` `placeFor()` saves an app root,
  with Finance's tab (`/finance?tab=loans`, which Finance now writes with
  `router.setParams`). It can add one screen to re-open over the root:
  - a record: a Tasks list, a loan or an event;
  - one of Finance's own lists.

  `PlaceRecorder` (`app/_layout.tsx`) writes it to AsyncStorage
  (`mm-last-place`) as the person moves. Home, the assistant and the account
  screens are not places, so they never erase the last app.
- **The cold start.** `_layout` reads the saved place with the theme and the
  language, before the first paint. `app/index.tsx` then redirects to the
  app's root. `restoreSub()` fetches the saved record into its query cache
  and pushes the record's screen only on success. When the record is gone,
  forbidden or offline, the app's root stays on screen. Never Home.
- **Deep links win** because they never reach `index.tsx`. A notification
  tap pushes over whatever was restored.
- **SafeZone** reopens on its PIN gate, and its items are never saved.
- **Forms, editors and modals** save their app's root instead.
- **Sign-out** clears the saved place, and so does another account signing
  in. A save from another account is ignored.
- **An older or partial save** still reopens its app (`parsePlace`). Only an
  unknown app is no place.
