# Calendar — the important view only

**Status: `RESEARCHING`** — decisions sketched, **references not yet pulled.**

His instruction: *"calendar app should show its important view only."*

## What "important view only" means here

`namespace :calendar_app` with `resources :events` is the API. MultiMagic's web
calendar has month grids, repeats, shares and reminders
(`docs/CALENDAR_APP.md`). **None of that belongs in a four-screen assistant
app.** The important view is the one a person actually opens a phone for:
**what is next.**

## Decisions

- **An agenda list, never a month grid.** Today and the next few days, grouped
  by day, each row a time and a title. A month grid on a phone answers *"what
  does my month look like"*, which is not a question anybody asks on a phone
  between two appointments.
- **Today first, and if today is empty it says so** rather than showing an empty
  grid — the emptiness is the answer.
- **Tapping an event asks the assistant about it**, the same decision as
  `../notifications/SPEC.md` and for the same reason: there is no event screen
  in this app, and the assistant is the destination. *"Tell me about <event>"*,
  composed and not sent.
- **No creating events.** The assistant can already create things on the web
  (§5 actions) and that path is deliberately out of this app's scope; a calendar
  that can read but not write is honest, a calendar with a broken create button
  is not.
- **Reached from the same place as notifications** — the title bar, not a tab.

## Open
References, and whether this is in v1 at all: he named it, so it is on the
board, but it is the one screen whose absence would not stop the app being what
he asked for. **If the box or the clock gets tight, this is what I would cut**,
and I would put that to him rather than quietly dropping it.
