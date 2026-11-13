# Calendar — the second full app (2026-11-11)

**Status: `DONE`** — 2026-11-11. `ours/` holds 360, 411 and 800 dp
(light/dark, en/fr), `08-calendar` and `24-calendar-write` pass on a
device, and `docs/QA_REPORT_2026-11-11.md` says what was NOT measured (RTL
on a device, guests on a device, the assistant's real write). Server fix
`calendar-dst` written, not deployed.

The owner, 2026-11-11 (relayed by the supervisor session): *make Calendar the
second full app inside MultiMagic mobile, after Pages: create, edit and delete
events (all-day, time, recurrence, reminders, location, notes), shared events,
the web's views adapted to a phone; the assistant creating an event still
refreshes the list.*

**This supersedes "the important view only" below** (§0–§6, 2026-09-18). That
section is kept because its §0 is still the rule every read here obeys:
occurrences come from the server, already expanded, never from `/events`.
What it decided *against* (no month grid, no writes, no event screen, a tap
composes a question) was right for a four-screen assistant and is reversed
on purpose now.

## A · What the web has, and where each piece lands on the phone

Read from `multi_magic/app/javascript/pages/calendar/` and the controllers,
2026-11-11. **No server change is needed**: every call below already exists
with request specs (`events_controller.rb`, `event_shares_controller.rb`).

| Web | API | Phone |
|---|---|---|
| Agenda (phone default on the web, 60 days) | `GET events/upcoming?days=` | **Agenda** view, `app/calendar/index.tsx`, 7 days first (the assistant's suggestions read the same key, `["calendar","upcoming",7]`), "Show more" widens by 30 |
| Month grid + day sheet | `GET events/occurrences?from=&to=` | **Month** view: `MonthGrid` + the picked day's list under it |
| Drawer, view mode | `GET events/:id` | `app/calendar/event.tsx` |
| Drawer, edit / create | `POST events`, `PUT events/:id` (+ `reminders: [min]`) | `app/calendar/edit.tsx` |
| Delete (owner only) → trash | `DELETE events/:id`, `PUT events/:id/restore` | Delete asks first, then an **Undo** that restores |
| Guests section | `event_shares` index/create/update/destroy, `respond` | `GuestsSection` on the detail page; a guest may also leave (`destroy` of their own share, which the policy allows) |

Not taken: the web has no trash screen for events, so neither does the phone
(Undo covers the mistake that matters, a delete a second ago).

## B · Sources (Rule Zero) — 14 screens, images in `references/` (gitignored)

| App | Screen | What we TAKE | What we REJECT |
|---|---|---|---|
| Todoist | [Upcoming](https://mobbin.com/screens/7e96cc10-7c91-4c3d-adf3-ef64e3231467) | month grid on top, the picked day's list under it, a round **+** bottom right | its pull-down sheet over the grid |
| Binance | [Calendar](https://mobbin.com/screens/58844abc-3595-41b2-b1b0-35f6f4c13c6d) | **dots under a date** say "something here" without text in a 48 dp cell | "No more events today" under every day (same reason as §2.1 below) |
| Weverse | [Calendar](https://mobbin.com/screens/5d94bb1b-51b2-4765-b836-b9a3ff2f4148) | `‹ Feb, 2026 ›` + a **Today** pill; an empty picked day says so in one line | the filter dropdown |
| Amazon Alexa | [Calendar](https://mobbin.com/screens/98f123a2-d39b-4254-9f78-80b4faa497bc) | the **list ⇄ grid** two-icon toggle in the header | the full-width "Add Event" bar (our + does it) |
| Outlook | [Month](https://mobbin.com/screens/5df44b2c-c249-49a6-989e-25f34a8267c9) | today as a filled circle in the accent | the 3-day timeline (a week of hours does not fit 360 dp legibly) |
| Apple Invites | [New event](https://mobbin.com/screens/d27f0859-2096-4ed2-a084-9d42c208ae1f) | **Cancel · title · Save** header; `Starts [date][time]` / `Ends [date][time]` as two pills per row | travel time, show-as |
| Saturn | [New event](https://mobbin.com/screens/ea3ab0e7-ae3b-46e8-9784-0fec6ed90c8b) | grouped rounded sections on a dark ground: when / repeat / guests / location / notes | "Guests can invite others" (no such permission on the server) |
| Outlook | [New event](https://mobbin.com/screens/ab63469a-202d-4e0e-a954-f681b8f18376) | "Repeats daily until …" spelled out under Repeat; **Remind me** as a row | time zone row (the server owns the zone, §3 below) |
| WhatsApp | [Create event](https://mobbin.com/screens/db5d5c9d-da95-4a58-967b-2bd86fe750a6) | the time **wheel opens inline under the row tapped**, no keyboard, no modal | — |
| Evernote | [Time wheel](https://mobbin.com/screens/ac3007c1-4196-4f37-828a-b46c3d465677) | hour · minute · AM/PM columns when the locale is 12 h; two columns when 24 h | — |
| Pangea | [When](https://mobbin.com/screens/7e2ca119-e688-41e1-a54b-a3864baab510) | the **date** opens as an inline month (the same `MonthGrid`), not a wheel of years | duration chips |
| Joi | [Event](https://mobbin.com/screens/91561e9e-aa39-426f-b774-557819a529e6) | detail first: date · time → title, then two buttons **Edit** / **Delete** (delete in the danger tone) | the countdown pill |
| Amie | [Event](https://mobbin.com/screens/c62cb2e7-3743-4105-a1ef-68f9c9ef5749) | labelled rows (GUESTS, LOCATION, DESCRIPTION) and RSVP at the bottom | per-row Edit links |
| Strava | [Repeats](https://mobbin.com/screens/3156d7b7-d71d-4990-b6ad-860ce750f666) | repeat choices as a **sheet of radio rows** | weekday multi-select (the server's rule has none) |

## C · Decisions

1. **Two views, one toggle, the last one remembered.** Agenda stays the
   default (the owner's 2026-09-18 "what is next", and the web's phone
   default); Month is one tap away and the choice is kept per device
   (`calendarView.store.ts`, AsyncStorage). Both read occurrences; neither
   re-sorts what the server ordered.
2. **A tap opens the event**, not the assistant. The old tap-to-ask moves to
   an "Ask the assistant" button on the detail page, so nothing is lost.
3. **Show before edit** (the web's three modes, `CALENDAR_APP.md`): detail is
   read-only; Edit opens the form filled in; Save returns to the detail.
4. **One form for every kind.** Picking *Birthday* or *Anniversary* turns on
   all-day and yearly for you (web `pickKind`). Moving the start moves the end
   with it (web `setStartTime`). An end before the start is dropped, not sent.
5. **Pickers are ours, behind one boundary.** `src/screens/calendar/pickers/`
   exports `DateField` and `TimeField`; nothing else in the app knows how a
   date is picked, so the native `@react-native-community/datetimepicker` can
   replace the inside at the next native build without touching a screen
   (supervisor, 2026-11-11). Date = inline `MonthGrid`; time = inline wheel,
   5-minute steps, 24 h or 12 h from the app language (`uses12h`), each column
   an `adjustable` accessibility element (swipe up/down with a screen reader).
   **The keyboard is never involved.**
6. **Colour is the web's key** (`blue green amber red grey`), mapped to the
   icon's accents in `eventColor()`; an unknown key falls back by kind as the
   web's `colorKeyFor` does. (Until now the phone dropped every non-hex colour,
   so every web colour was ignored.)
7. **Permissions come from the server** (`current_user_permission`): Edit only
   for owner/editor, Delete and guest management only for the owner, Accept /
   Decline / Leave only for a guest. A control the server would refuse is not
   drawn.
8. **The assistant still refreshes it**: `useAssistantEcho(CALENDAR_KEYS)`
   now invalidates every `["calendar", …]` read, month and detail included.
9. **Offline**: a write that fails says so in the form and keeps the draft;
   nothing is queued (a queued calendar write that lands later at the wrong
   time is worse than a clear "not saved").

## D · How we code it

| Thing | Where |
|---|---|
| API (all reads and writes, strict parsing) | `src/api/calendar.ts` |
| date arithmetic, grid days, week start, 12/24 h | `src/screens/calendar/dates.ts` |
| draft ⇄ event ⇄ payload (pure, the form's brain) | `src/screens/calendar/draft.ts` |
| colours | `src/screens/calendar/colors.ts` `eventColor()` |
| month grid (view and date picker) | `src/screens/calendar/MonthGrid.tsx` |
| pickers | `src/screens/calendar/pickers/{DateField,TimeField,Wheel}.tsx` |
| main screen | `app/calendar/index.tsx` |
| detail | `app/calendar/event.tsx` + `src/screens/calendar/GuestsSection.tsx` |
| form | `app/calendar/edit.tsx` + `src/screens/calendar/EventForm.tsx` |
| choice sheet (repeat) | `src/screens/calendar/ChoiceSheet.tsx` |

---

# (History) Calendar — the important view only


**Status: `DONE`** — six references pulled and read, 2026-09-18. And the
endpoint named in the earlier draft was **the wrong one**; §0 is why, and it is
not a style disagreement — the draft's endpoint would have shown a birthday on
its 1990 date.

His instruction: *"calendar app should show its important view only."*

## What "important view only" means here

MultiMagic's web calendar has month grids, repeats, shares and reminders
(`docs/CALENDAR_APP.md`). **None of that belongs in a four-screen assistant
app.** The important view is the one a person actually opens a phone for:
**what is next.**

---

## §0 · THE CORRECTION — `upcoming`, not `index`

The earlier draft named the API as *"`api/v1/calendar_app/events`"*. That is
`EventsController#index` — the flat list of event **rows**
(`events_controller.rb:10-17`). An agenda built on it is wrong in a way that
would survive a demo and fail on his real data, because **recurrence in this
system is arithmetic, not rows**:

> *"Recurrence is arithmetic, not rows: an event stores a rule and this expands
> it over the window being asked about. 'Every birthday forever' costs one row
> and one loop bounded by the window."* — `calendar_app/occurrences.rb:5-8`

So a yearly birthday is **one row with `starts_on` in 1990**. Sorted into an
agenda by `starts_on`, it never appears — or appears 36 years ago. The
controller says so itself, at `events_controller.rb:21-22`: *"What the month
grid and the agenda read: events expanded over a window, so a birthday from 1990
arrives as this year's date."*

**The endpoint is `GET /api/v1/calendar_app/events/upcoming?days=N`**
(`events_controller.rb:36`), which returns `{ occurrences: [...] }` —
already expanded, already ordered, already including events **shared with** him
and not only his own (`calendar_app/upcoming.rb:21-27`). `days` clamps to
1–365 and defaults to 30; the service caps at **`MAX_RESULTS = 100`**
(`upcoming.rb:13`), which for a seven-day window is not a limit we can hit.

Four consequences worth writing down:

- **An occurrence's `id` is a STRING**, `"#{event.id}:#{on}"`
  (`occurrences.rb:16`). `src/api/parse.ts`'s `id()` is deliberately strict about
  numbers and would throw on it — correctly, because this is not a record id.
  It is parsed with `str()` and used as the `FlatList` key, which is exactly
  what a composite key is good for.
- **The shape is `{ id, on, starts_at, ends_at, all_day, event }`**
  (`occurrence_serializer.rb`) — the day it falls on, plus the whole event
  nested. `starts_at`/`ends_at` are **null for an all-day event**; `on` is
  always there. So `on` drives the grouping and `starts_at` only the time label.
- **The server has already sorted it**, all-day first within a day
  (`occurrences.rb:19` — `sort_key`). The client must not re-sort; it would have
  to re-derive a rule it can read off the response order for free.
- **`event.color` is on the wire** (`event_serializer.rb:7`). So a coloured bar
  on a row is *data*, which is the only kind of colour `IDENTITY.md` §1 allows:
  *"used ONLY where a category exists — never decoration."*

## §1 · Sources — six screens

| App | Reference | What we TAKE | What we REJECT |
|---|---|---|---|
| **Microsoft Teams** — [calendar](https://mobbin.com/screens/06c0b6dd-cc73-428a-9ce3-5299e3ca8e0b) | day headings `Oct 24 Tuesday`; a **coloured left bar** on each row; a **repeat glyph ↻**; and a dark ground that is already ours | the `Join` button; the week strip above the list (§2.2) |
| **Craft** — [calendar](https://mobbin.com/screens/d2775c4e-dda3-4339-b188-d310b9167b26) | **`Nov 21 · Today · Friday`** — the heading names the day *and* the date, so "Today" never floats free of when today is | the Daily Notes / Tasks / Events filter chips |
| **Microsoft Outlook** — [calendar](https://mobbin.com/screens/3a21d1a0-0bec-472b-9c07-8a33dddf45cf) | **time on the LEFT in its own column** with the duration under it, title to the right — the eye goes down one column to find "when" | the weather per day; the mini month strip; `Today`+`Tomorrow` as the only named days |
| **Equinox+** — [calendar](https://mobbin.com/screens/5a119924-6016-470e-9bc7-b9f09be567f4) | the left column as a **chip** and a colour bar between it and the title — the shape that survives an empty time (`Anytime`), which is our all-day case | the category eyebrow above each title |
| **Saturn Calendar** — [agenda](https://mobbin.com/screens/ab52f517-d159-4cc6-a9a2-4bc947f62fbb) | a **dark** agenda that reads: rows as flat bands, time in `inkMuted` under the title | the emoji per row; `Chat to create…` |
| **Google Home** — [activity](https://mobbin.com/screens/f24e8e4e-f1e5-4074-886c-5fa9d492641b) | — | **`No events on this day` rendered for EVERY empty day.** See §2.1 |

## §2 · The disagreements, and how we resolved them

### 2.1 · "Nothing today" is said ONCE, for today — not once per empty day

Teams and Google Home both print an empty-day line under every date with nothing
in it. On a sparse week that is six lines of "No events" and one appointment —
the emptiness rendered six times louder than the content.

**His instruction is narrower and better:** *"if today is empty it says so."* So:

- **Today always appears**, with either its events or one line: *"Nothing today."*
- **Empty days after today are simply absent.** The next heading is the next day
  that has something, which is also what makes the list short enough to read.

That resolution comes from him, and the references are what made it a decision
rather than an accident.

### 2.2 · No week strip, because a week strip is a month grid with fewer boxes

Outlook, Teams and Saturn all put a scrollable row of dates above the agenda. It
is genuinely useful — and every one of them makes tapping a date **navigate**
there. That is date-browsing, which is the month grid's job, which is the thing
we are not building. *"A month grid on a phone answers 'what does my month look
like', which is not a question anybody asks on a phone between two
appointments."*

**So: no strip.** The list starts at today and runs forward. `days=7`, because
"the next few days" is his phrase and a week is the smallest window that
reliably contains something.

### 2.3 · Time on the left, and `All day` in the same column

Outlook and Equinox+ put the time in a left column; Saturn and Otter put it
under the title. **Left column**, because it is the only layout where an
`all_day` event does not leave a hole — `All day` sits in the same slot a time
would, exactly as Equinox+'s `Anytime` chip does. Given the server already
orders all-day events first within their day, the column reads top-to-bottom as
*all-day things, then the timed ones in order*.

## §3 · Our decisions

- **Tapping an event asks the assistant about it** — *"Tell me about `<title>`
  on `<date>`"*, composed and not sent. Same rule, same reason and the same
  implementation as `../notifications/SPEC.md` §3: there is no event screen in
  this app, and the assistant is the destination.
- **No creating, editing or deleting events.** `create`, `update`, `destroy`,
  `restore` and `destroy_permanently` all exist on the controller and none is
  wired. *"A calendar that can read but not write is honest, a calendar with a
  broken create button is not."* Nor shares, nor reminders — `reminders` and
  `shares` are on the wire (`event_serializer.rb:34,43`) and are not rendered;
  a reminder the app displays but cannot dismiss is worse than one it does not
  mention.
- **A repeating event says so.** `event.recurrence` non-null → `↻` after the
  title (Teams, Outlook). A weekly stand-up that looks like a one-off is a small
  lie, and it is one glyph.
- **Location on a second line when present**, `inkMuted`, one line, truncated.
  Teams and Outlook both carry it and it is the field that decides whether he
  needs to leave now.
- **The colour bar is `event.color`**, falling back to `categoryColorFor(event.id)`
  from `src/theme/tokens.ts` when the event has none — so the bar is always
  meaningful and never invented. If `color` arrives as something that is not a
  hex string it is dropped rather than passed to `backgroundColor`.
- **Timezone is the server's problem and it has already solved it.**
  `events_controller.rb:138` resolves `current_user.timezone` (default
  `Europe/Paris`) and `Upcoming` expands in that zone. The client formats what it
  is given and does **not** re-zone anything — two timezone implementations in
  one feature is how an event lands on the wrong day.

## §4 · How we code it

| Thing | Where |
|---|---|
| `app/calendar.tsx` | the agenda, `Screen` + `SectionList` keyed on `on` |
| `src/api/calendar.ts` | **mine.** `upcoming(days = 7)` → `Occurrence[]` |
| `src/screens/people/EventRow.tsx` | time column · colour bar · title · ↻ · location |
| `src/screens/people/DayHeading.tsx` | `Today · Thu 18 Sep`, shared with nothing |
| parsing | `str()` for the occurrence id (§0), `obj/bool/optStr` from `src/api/parse.ts` |
| the tap | `useDraft(conversationId).setDraft(...)` then `router.push("/chat")` |
| colour | `event.color` → the bar; `inkMuted` for time and location; `accent` for today's heading |

### Divergence note — 2026-09-19, SPEC versus code

Checked by the verifier session against `main` at `971f951`.

- **Not a `SectionList`.** `app/calendar.tsx:184` is a `FlatList` over one flat
  array of rows typed `{ kind: "day" } | { kind: "event" }` (`:44`), with the
  day rows spliced in by the screen. Same picture on screen; different
  identifier, and no `sections=` to key on `on`.
- **`src/screens/people/DayHeading.tsx` does not exist.** The heading text is
  computed by `headingFor(on, today)` in `app/calendar.tsx:50-63` — `Today ·
  Thu 18 Sep`, `Tomorrow · …`, or the date — and rendered inline with
  `testID="calendar-day-today"` for today and `calendar-day-<key>` otherwise
  (`:192`). Rule 3 of `docs/design/README.md` wants the real file named.
- **The colour bar has a fallback the SPEC does not mention.**
  `EventRow.tsx:58` is `event.color ?? categoryColorFor(event.id)`. Both render
  identically to a test, which is why `08-calendar`'s register row says the
  bar's provenance is not covered.
- Holds: `upcoming(days = 7)`, `str()` for the composite occurrence id
  (`src/api/calendar.ts:97`), `useDraft(...).setDraft` then
  `router.push("/chat")` (`app/calendar.tsx:99-101`), `accent` for today's
  heading (`:194`).

## §5 · The honest note, carried forward

**This is the row I would cut first if time runs short**, and that has been said
to him. It is the one screen whose absence would not stop the app being what he
asked for — `BRIEF.md`'s scope is a login and the assistant, and rows 10–12
arrived on 18 September.

It is cheap now that §0 is settled (one endpoint, one list, no writes), so the
recommendation is to build it. But if it is the last thing standing at the end
of a day, **it gets reported as cut, not rushed.**

## §6 · Evidence required before `DONE`

1. `ours/` at 360, 411, 800 dp, dark and light.
2. **A recurring event verified** — one whose `starts_on` is in the past
   appearing on its next occurrence. That is the whole point of §0 and the only
   part that `index` would have got wrong silently.
3. An empty today rendering *"Nothing today."* with a later day still listed
   under it.
4. `npx tsc --noEmit` + Jest for `src/api/calendar.ts`.

## Refreshing a stale screen — 2026-09-19

Hamma9900: *"if AI agent calendar and it is not applied you can say reload it
— there should be an option — same for notification; it should not be very big
which can break design but it should be stylish."*

### Rule Zero, and what it could NOT settle

Mobbin's DNS **does** resolve from this box (the note passed to this session
said it did not), but the site needs a signed-in session, so the downloaded set
of 18 September is what was checked — `references/` in this folder, six images.

**None of the six shows a manual refresh control, a "last updated" line, or a
pull-to-refresh state.** That is the honest limit of the check and it is
recorded rather than papered over: the decision below is taken from what the
references DO settle (header treatment) plus platform convention, and it is the
one part of these two screens that no shipped app in our set was consulted on.

**What the references did settle — the header.** Outlook's agenda
(`outlook-agenda-time-left-duration-repeat.webp`) and Mesh's notifications
(`mesh-dismiss-all-items-overflow.webp`) both put their controls as **small
unlabelled outline glyphs at the top right**, no text, no filled buttons, and
neither ever covers the list with a spinner. That is exactly `IDENTITY.md` §7's
"quiet doors" rule, arrived at from two directions, so the control takes it.

### What we built

Three affordances, in the order they act:

1. **The screen refreshes itself** when the assistant writes here. An assistant
   reply carries what it created as `links`, each with a `FrontendRoutes` key,
   and `MessageChannel` streams that reply to the USER — so it reaches this
   screen although the question was asked on the chat screen
   (`src/hooks/useAssistantEcho.ts`, `CALENDAR_KEYS = ["calendar_event"]`).
   **Nothing is polled**: the alternative, asking every thirty seconds in case,
   would spend a request a minute for ever to catch an event written a few
   times a week.
2. **Pull to refresh** — already present, and what a list on a phone means.
3. **A header glyph** (`calendar-refresh` / `notifications-refresh`), for when
   a gesture is not discoverable. **The busy state is inside the control**, an
   `ActivityIndicator` where the glyph was, never over the list somebody is
   reading.

And **a muted line, not a banner**: `calendar-updated` /
`notifications-updated` says "Updated just now" and **ages on a 30 s tick**, so
it cannot go on claiming a freshness it no longer has. It says "Updating…"
while a refresh is in flight.

### The difference between the two screens, stated rather than hidden

The calendar had a real staleness problem. **Notifications did not**:
`NotificationChannel` already pushes every new row and that screen has always
refetched on the frame and on every reconnect. What it lacked was any way to
SAY it was current, and any answer when the socket itself is the thing that is
wrong — a rejected subscription, or a phone that has been asleep. So it gets
the same control and the same line, and `NOTIFICATION_KEYS` is deliberately
empty with the reason written beside it.

### Evidence

`src/hooks/__tests__/useAssistantEcho.test.ts` (the key matches, another app's
does not, the question does not, an unreadable frame is not a signal, the
subscription survives a re-render and closes on unmount) and
`src/components/__tests__/Freshness.test.tsx` (touch-floor target with no
visible label, busy state inside the control, the line ages, no timer left
behind). Both handles are in the every-screen table at 360, 411 and 800 dp in
light and dark. Two breaks were planted and watched fail first.


---

## Status — DONE, set 2026-09-21 from the evidence

Was `SPECIFIED`. `docs/design/README.md` §4 defines `DONE` as `ours/` holding a device screenshot at **360, 411 and 800 dp**, the flows for that screen run, and the SPEC updated. Checked against the files rather than from memory.

`08-calendar` passes and `ours/` holds the three widths — **but it took the `calendar-nothing-today` branch.** The with-events half is NOT MEASURED for the same reason as notifications, and `20-refresh` covered the control rather than a populated list.

## Query keys (React Query audit, 2026-11-13)

Every key comes from `calendarKeys` in `src/api/keys.ts`, never a literal
(`docs/DATA_LAYER.md`; the guard is lint rule `api-in-effect`).

| Factory member | Key |
|---|---|
| `calendarKeys.all` | `["calendar"]` |
| `calendarKeys.allOccurrences()` | `["calendar", "occurrences"]` |
| `calendarKeys.allUpcoming()` | `["calendar", "upcoming"]` |
| `calendarKeys.occurrences()` | `["calendar", "occurrences", from, to]` |
| `calendarKeys.upcoming()` | `["calendar", "upcoming", days]` |
| `calendarKeys.event()` | `["calendar", "event", eventId]` |
| `calendarKeys.shares()` | `["calendar", "event", eventId, "shares"]` |

Writes: src/screens/calendar/useCalendarMutations.ts. deleting an event, answering an invitation, changing or removing a guest are optimistic; inviting, leaving and the form's save are not (reasons in the file).

