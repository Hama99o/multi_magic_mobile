# Calendar — the important view only

**Status: `SPECIFIED`** — six references pulled and read, 2026-09-18. And the
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
