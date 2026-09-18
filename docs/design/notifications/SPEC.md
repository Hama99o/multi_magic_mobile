# Notifications — and the destination is the assistant, not a record

**Status: `RESEARCHING`** — decisions sketched, **references not yet pulled.**
Run `/screen-design` and pull them before building; this file is honest about
being incomplete rather than pretending otherwise.

His instruction: *"the notification should show also, but it redirects on chat
to ask etc."*

## Why that instruction is the right architecture, not a compromise

`api/v1/notifications` (`index update destroy`) and its serializer give us
`kind, title, body, **path**, read_at, created_at, subject_type, subject_id,
actor`, with `notification_channel.rb` for live delivery.

**`path` is a WEB route.** This app has no note screen, no loan screen, no
contact screen — so *"open the thing"* is not available, and inventing those
screens would turn a four-screen app into MultiMagic. **So the notification's
action is to ask about it**, which is exactly what he said, and it makes the
assistant the single destination of the whole app.

## Decisions

- **A sheet from a bell in the title bar**, with the unread count on the bell.
  Not a tab — there is one destination.
- **A row is `title`, `body` truncated to one line, and a relative time**,
  grouped `Today` / `Earlier` (Notion's grouping, already cited in
  `../sessions/SPEC.md`).
- **Tapping a row opens the chat with a question already composed but NOT
  sent** — *"What is this about: <title>?"* — so he can edit it before asking.
  A tap that fires a question at the model without showing it first spends his
  quota on a guess.
- **Marking read is `PATCH`**, and it happens on tap, not on scroll-past.
- **Swipe to delete** a row, with no confirm: a notification is not data.
- **Empty state: one line**, and no illustration.

## Open
References. And whether push (`me/register_device` has no equivalent here —
check) is in scope at all; the live channel may be enough while the app is open,
and a phone notification is a separate permission conversation.
