# Notifications — and the destination is the assistant, not a record

**Status: `SPECIFIED`** — five references pulled and read, 2026-09-18. The
earlier draft named three endpoints; there are **six**, and the three it missed
are the ones the references all reach for.

His instruction: *"the notification should show also, but it redirects on chat
to ask etc."*

## Why that instruction is the right architecture, not a compromise

`notification_serializer.rb:6` gives `kind, title, body, **path**, read_at,
created_at`, plus `subject_type`, `subject_id` and `actor`.

**`path` is a WEB route.** This app has no note screen, no loan screen, no
contact screen — so *"open the thing"* is not available, and inventing those
screens would turn a four-screen app into MultiMagic. **So the notification's
action is to ask about it**, which is exactly what he said, and it makes the
assistant the single destination of the whole app.

---

## §0 · THE CORRECTION — three endpoints the draft did not know about

`routes.rb:197-203` is not `index update destroy`. It is:

```ruby
resources :notifications, only: %i[index update destroy] do
  collection do
    get :unread_count      # the badge, and nothing else
    post :read_all         # "mark all read"
    delete :clear          # everything already read
  end
end
```

Each of the three earns its place, and each maps onto something a reference does:

- **`GET unread_count`** → `{ unread_count: N }`. Its own comment
  (`notifications_controller.rb:16-17`) is *"what the badge needs, and nothing
  else, so the badge does not pay for a page of rows."* **The bell must use
  this**, not `index.length` — `index` is paginated at 20
  (`notifications_controller.rb:12`), so counting rows would cap the badge at 20
  and cost a page of bodies to draw a number.
- **`POST read_all`** → Mesh's *"Dismiss All Items"*. One tap for the common
  case of coming back to fourteen unread.
- **`DELETE clear`** → clears **only what is already read**
  (`notifications_controller.rb:41`). That is a safe destructive action and it
  is worth saying in the label, because "Clear" that ate an unread row would be
  the opposite.

Three more facts read off the same file:

- **`index` is paginated (20) and carries `meta: { unread_count }`** — so the
  first page delivers the badge for free, and the separate `unread_count` call
  is only for refreshing the bell without re-reading rows.
- **`index` accepts `?unread=true`** (`notifications_controller.rb:10`) — a real
  server-side filter, should we ever want an Unread tab. We do not (§2.3).
- **The scope is `recent`, which is `created_at >= 90.days.ago`**
  (`notification.rb:46`). So "Earlier" has a floor, and the list cannot grow
  without bound. Nothing to build; worth knowing before somebody builds infinite
  scroll for it.
- **`actor.avatar` is a RELATIVE path.** `notification_serializer.rb:25` uses
  `rails_blob_path(..., only_path: true)` — `/rails/active_storage/...`. In a
  browser that resolves; in React Native `<Image source={{uri}}>` with a leading
  slash silently renders nothing. It must be prefixed with the API origin. This
  is the shape of bug that looks like "the avatars don't work" for an afternoon.

## §1 · Sources — five screens

| App | Reference | What we TAKE | What we REJECT |
|---|---|---|---|
| **Linktree** — [notifications](https://mobbin.com/screens/9550a60a-c074-4bbb-844f-24c18e134860) | `Today` as a section heading; row = **bold title + grey body + relative time**; **unread = a coloured dot on the right edge** | the All/Updates/Opportunities/Insights chips — we have one kind of reader |
| **happn** — [notifications](https://mobbin.com/screens/f8777c43-8668-487f-b605-aeacf695acf0) | `Today` / `This week` headings, and **the unread row's whole background is tinted** — the dot *and* the tint, two signals, which is what makes it readable in sunlight | the count badge beside the screen title |
| **Amazon Alexa** — [notifications](https://mobbin.com/screens/c51c78ee-a497-4105-a9da-8ebe241c48ec) | **typography only — no icon, no avatar per row.** Time, bold title, grey body. It is the most legible of the five and the cheapest to build | its per-row absolute timestamps |
| **Mesh** — [activity](https://mobbin.com/screens/8db45ea4-7352-4edf-bd49-6f68e0b8c791) | **`Dismiss All Items` in the overflow** → our `read_all` and `clear` | the stacked-avatar rows |
| **Character AI** — [activity](https://mobbin.com/screens/094e6df1-e43b-4db0-a6df-08fded004913) | — | **the chevron `>` at the end of every row.** See §2.1 — it is the single most important rejection in this file |

## §2 · The disagreements, and how we resolved them

### 2.1 · NO CHEVRON. A chevron is a promise to open the record

Character AI ends each row with `>`. Every convention in the world reads that as
*"this opens the thing"* — and ours does not. It opens the assistant with a
question typed but not sent.

**So the affordance must not say "navigate".** The row is tappable and has no
trailing glyph; what tells the user what will happen is that the chat opens with
their question visible and unsent, which is self-explaining the first time and
remembered after. A chevron would be a small lie repeated on every row.

### 2.2 · The unread signal: dot AND tint, following happn over Linktree

Linktree uses a dot alone; happn uses a dot plus a tinted row; Mesh uses tint
alone. **Both**, because the dot is 8 dp and the tint is the whole row — and the
`surface` token over `ground` is already a 1-step difference in this palette
(`#1b333a` on `#102125`), so it reads without inventing a colour.

### 2.3 · Grouped `Today` / `Earlier` — two groups, not four

Linktree shows one group; happn two; Alexa and Mesh three or more (`Today`,
`Yesterday`, `Last week`, absolute dates). With a 90-day floor and a phone-sized
list, **two**: `Today` and `Earlier`. The relative time on each row carries the
rest, and `src/lib/relativeTime.ts` already writes it.

No `Unread` filter. `?unread=true` exists and a tab for it would be a second
list state to keep in sync with a badge — for a list that will hold twelve rows.

### 2.4 · A sheet, not a screen — and the bell is in MY title bar, not theirs

The earlier draft said *"a sheet from a bell in the title bar"*. The bell belongs
on the assistant's title bar, and **`app/chat.tsx` is the sibling session's file
and not mine to edit**. So this ships as `app/notifications.tsx`, a route that
works the moment anything pushes to it, and the one-line entry point in the
assistant's title bar is a question for Hamma9901 — recorded in §5 rather than
taken.

## §3 · Our decisions

- **Tapping composes, never sends.** *"What is this about: `<title>`?"* lands in
  the composer as a draft. A tap that fires a question at the model spends one
  of the 15-per-minute (`ai_controller.rb:5`) on a guess about what he meant.
  Implemented by writing the draft through `useDraft(conversationId)` — the same
  store the composer already restores from — then `router.push("/chat")`.
- **Marking read happens on tap, not on scroll-past.** `PATCH /:id`, and the row
  loses its tint immediately rather than after the round trip; a failure puts it
  back. Same rule as `mark_read` in people chat, and the same reason: scrolling
  past something is not reading it.
- **Swipe to delete, no confirm.** A notification is not data — it is a copy of
  something that happened, and the thing itself is untouched. `DELETE /:id`
  returns the new `unread_count`, so the badge corrects itself from the
  response rather than from a refetch.
- **`read_all` and `clear` live in one overflow**, labelled for what they do:
  *"Mark all as read"* and *"Clear read notifications"* — the second naming its
  own scope, because that is the guarantee the endpoint actually makes.
- **The empty state is one line, no icon** — `IDENTITY.md` §6, and Gymshark in
  `../people-chat/SPEC.md` §1: *"You're all caught up."*
- **Live arrivals.** `NotificationChannel` `stream_for current_user`
  (`notification_channel.rb:7`) and the payload is
  `{ notification: {...}, unread_count: N }` (`notifications/deliver.rb:63-66`)
  — note the **wrapper key**, unlike ConversationChannel's bare message hash
  (`../people-chat/SPEC.md` §0.2). New row in at the top, badge from
  `unread_count` in the same frame. And the same rule as everywhere else in this
  app: **`onConnected` re-reads page 1**, because nothing broadcast while the
  socket was down is ever replayed (`cable.ts:25-29`).
- **Push notifications are OUT of v1.** There is no device-registration endpoint
  on this API — no `me/register_device`, nothing under `notifications`. Adding
  one is a backend change plus a permission conversation plus APNs/FCM
  credentials. The live channel covers the app being open, which is the whole of
  what he asked for.

## §4 · How we code it

| Thing | Where |
|---|---|
| `app/notifications.tsx` | the list, `Screen` + `FlatList` |
| `src/api/notifications.ts` | **mine.** `list · unreadCount · markRead · markAllRead · remove · clearRead` |
| `src/screens/people/NotificationRow.tsx` | title · body (1 line) · relative time · unread dot + tint |
| grouping | `Today` / `Earlier` computed in the screen from `createdAt` |
| the tap | `useDraft(conversationId).setDraft(...)` then `router.push("/chat")` |
| live | `subscribeToChannel<{notification, unread_count}>("NotificationChannel", …)` — no params |
| avatar | `` `${BASE_URL}${actor.avatar}` `` — see §0, it is a relative path |
| colour | `accent` for the unread dot, `surface` for the unread row, `inkMuted` for body and time |

## §5 · Open — for Hamma9901

**The entry point.** These screens have no door. The bell (and the chats icon,
and the calendar icon) belong in the assistant's title bar, which is
`app/chat.tsx:203-217` — **the sibling's file, frozen to me by the boundary.**
Three routes that nothing links to are three screens nobody can reach.

I have not touched it. The change is one `<Pressable>` per destination in their
header row; whoever makes it should make all three at once, and it should be
theirs or arbitrated, not mine taken quietly.

### Divergence note — 2026-09-19, SPEC versus code

Checked by the verifier session against `main` at `971f951`.

- **§5 is resolved and reads as open.** The doors exist: `chat-open-chats`,
  `chat-open-notifications` and `chat-open-calendar` in `app/chat.tsx`, added
  by `70c68b6`, and `07-notifications` arrives by tapping the bell. The
  paragraph about `app/chat.tsx:203-217` being frozen is history now.
- **§4's avatar line names the wrong identifier.** It says
  `` `${BASE_URL}${actor.avatar}` ``; the code is `absoluteUrl(optStr(record.avatar))`
  in `src/api/notifications.ts:77`, borrowed from `src/api/conversations.ts:117`.
  Same effect — the path is absolute by the time it leaves the API layer —
  but the SPEC should name the function that does it.
- Holds: `FlatList` (`app/notifications.tsx:251`); `list · unreadCount ·
  markRead · markAllRead · remove · clearRead` (`src/api/notifications.ts:100-160`);
  `Today` / `Earlier` from `createdAt` via `isToday` (`:169-178`);
  `subscribeToChannel<NotificationEvent>("NotificationChannel", …)` with no
  params (`:78`); the tap sets the draft and pushes `/chat` (`:103-105`).
  The row's title is two lines (`numberOfLines={2}`), the body one.

## §6 · Evidence required before `DONE`

1. `ours/` at 360, 411, 800 dp, dark and light.
2. A notification **arriving over the channel** while the list is open, and the
   badge moving in the same frame.
3. A tap landing in the composer **unsent**, with the draft surviving a
   backgrounding (`useDraft`).
4. `npx tsc --noEmit` + Jest for `src/api/notifications.ts`.

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
