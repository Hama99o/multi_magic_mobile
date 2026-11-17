# src/components/shell — the header every app shares

Rules for `AppHeader`, `AppSwitcher`, `AppMark` and the registry behind them
(`src/apps/registry.ts`). The design and its reasons are in
`docs/design/app-shell/SPEC.md`; what proves each point is in its `MANIFEST.md`.

## The shared header mirrors the web's TopNav (owner, 2026-11-17)

**Right side, in the web's order: Chats, Notifications, AI, Apps, Avatar.**
The owner reversed the first design, which left AI out to save room at
360 dp: *"add AI also in topbar, it's important, same as we have in web"*.
So when the web's `TopNav` (`multi_magic` `components/layout/TopNav.tsx`)
gains, loses or reorders a control, this header follows, unless the control
cannot work on a phone. Workspace is one of those, and the web hides it on
phones too.

- **Room is made by shrinking, never by dropping a web control.** Below
  400 dp the buttons go from 40 to 36 dp. The title ellipsizes. Only below
  340 dp, where the title would have less than about 56 dp, does it give way
  to the app's badge alone (`COMPACT_BELOW`, `BADGE_ONLY_BELOW` in
  `AppHeader.tsx`).
- **The AI button opens the assistant OVER the current screen** (`/chat` is
  a modal in `app/_layout.tsx`). The screen underneath stays mounted, as the
  web's assistant window floats over the page.
- **The same top on every app root and on every screen inside an app.** A
  screen inside an app passes `back` (and `onBack` when leaving needs a
  confirm). Focused surfaces draw their own chrome and no shell: the note
  editor, a chat thread, the assistant, modals and lock screens.
- **No app draws its own Home, back-to-Home, AI or avatar button any more.**
  They live here once. An app's own controls (search, tabs, ⋮) go in its own
  row under the header.
- **Every app list comes from `APP_REGISTRY`.** Home, the switcher and the
  Profile menu never list apps by hand.

## Rules from the black-box run (2026-11-17)

A tester who did not read the code broke these; each is now a rule.

- **Every navigation a tap starts fires once.** A double tap on Chats,
  Notifications or AI pushed the screen twice, so back showed the same screen
  again. Header buttons, switcher tiles and Profile rows go through one guard
  (`useSingleFire` in `AppHeader.tsx`): a second press within the guard window
  does nothing.
- **A form, an editor or a modal never overwrites the saved place.** Killing
  during "New expense" reopened Finance › Overview: the form had saved
  Finance's bare root over Finance › Expenses. Those routes are not places at
  all (`placeFor` returns null), so the screen under them is what reopens. The
  half-filled form itself is never restored.
- **Every tab an app shows is in its address** (`router.setParams({ tab })`),
  so a reopen lands on it: Finance's five tabs, and Pages' Home, Starred,
  Shared and Files.
- **Reopen means the screen he left, the screen inside an app included**: a
  people-chat thread reopens as that thread, like a Tasks list or a loan.
- **The assistant shows only the user's own AI sessions.** A session id
  remembered on the phone is used only if it is in `GET /ai/sessions`.
  Otherwise it is forgotten, and the server's current session is used. A
  stored id that points at a people conversation must never render it
  (`app/__tests__/chat.session.test.tsx`).
- **No currency is hard-coded.** A money form defaults to the currency last
  used, else the user's own currency, never "usd" written into the code.
