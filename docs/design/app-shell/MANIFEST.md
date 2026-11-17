# App shell — done-manifest

Written before any screen code (on-the-loop method, 2026-11-17). It becomes the
PR description. Every line ends with the check that proves it. Status per line:
☐ open · ☑ proven (with the evidence beside it) · ⚠ unproven (said so).

**Goal (his words):** *one shared top header on every app, the same as the web,
fast switching between apps without going back to Home, and a better Home.*

## MUST

| # | Criterion | Check |
|---|---|---|
| M1 | Every app root shows the same `AppHeader`, built from one component: Notes, Pages, Chats, Calendar, Contacts, SafeZone, Tasks, Finance, Notifications, Questions (sessions), Home | jest `appShell.test.tsx` › "every app root renders the same header" (the same four testIDs, in the same order, on each route); device: one shot per app, same pixels at the top |
| M2 | The header holds, in this order: Chats (badge 9+), Notifications (badge 99+), Apps, Avatar | jest › order and caps (0, 3, 10 → "9+", 100 → "99+") |
| M3 | Badges come from React Query on the existing keys, through `useShellBadges`; a read notification lowers the bell at once | jest › `useShellBadges` against axios-mock-adapter; mark-read lowers it (optimistic key shared) |
| M4 | The Apps button opens the switcher with every registry app; a tap jumps straight to that app | jest › the sheet lists `APP_REGISTRY`, tap → `router.replace` from a root and `push` from a sub-screen; device: Tasks → Finance → Notes → Calendar without Home |
| M5 | One registry (`src/apps/registry.ts`) feeds Home, the switcher and Profile | jest › the three render the same keys, in the same order |
| M6 | Profile has a complete, collapsible Apps section; its state is remembered | jest › collapsed by default, opens, survives a remount (AsyncStorage mocked), the lone Pages row is gone |
| M7 | Back: no arrow on an app root (the badge goes Home); a chevron on a sub-screen; Android back follows history, then Home; switching never piles every app onto the stack | jest › `backToHome.test.tsx` extended; device: back after three switches lands on Home |
| M8 | Home: greeting, Ask box, Coming up (hidden when empty), every app as a tile with its one line | jest › sections in order; Coming up empty → absent; device shot |
| M9 | No shell on focused surfaces: note editor, chat thread, assistant conversation, modals, lock screens | jest › those routes render no `app-header` |
| M10 | The current app is shown: its badge and name in the header, ringed in the switcher, checked in Profile | jest |

## MUST NOT

- Change any app's own design below the header (tabs, search, lists) beyond moving its title row's actions into its own row.
- Break any existing testID that a flow or test uses, unless that flow or test is updated in the same commit (`backToHome.test.tsx` uses `safezone-back`, `calendar-back`, `contacts-back`).
- Add an endpoint, a server change or a new dependency.
- Merge, push to main, deploy, or run an EAS/store build.

## Invariants

- No prod deploy, store or TestFlight build, or message to real people, without the owner's own yes.
- One worktree (`../mm-app-shell`), with its own Metro port (8095) and its own QA database (`mm_qa_shell_*`, through the guard).
- Lists newest first: not touched here.
- Tokens only.
- No secrets.
- The repo is public: invented data only.

## Hidden criteria

| Criterion | Applies | Check |
|---|---|---|
| Dark mode | yes | `screens.render.test` covers both schemes; device shots light and dark |
| RTL | yes (no RTL language yet) | jest render under `I18nManager.isRTL = true`: the row reverses, the chevron mirrors |
| Tablet / 360 dp phone | yes | device at 360, 411 and 800 dp (`ours/`); "Notifications" title fits at 360 |
| Offline / slow network | yes | badges hidden, not "0" or a spinner, when the count fails; the header never waits on the network; jest with network error |
| Empty / loading / error | yes | Home's Coming up is absent when empty and on error; badges absent while loading |
| Double tap | yes | Apps tapped twice opens one sheet; a switcher tile tapped twice navigates once (jest) |
| Roles / permissions | n/a | one user role on mobile |
| Recycled list cells / image flash | yes (avatar) | the avatar keeps its image across screens (expo-image cache); device check while switching |
| i18n keys | yes | `keys.test` and `locales.test` green; every new label en/fr; accessibility labels from `t()` |
| Notifications / analytics side effects | yes | opening the bell screen still marks read as before; no analytics in the app |
| Accessibility | yes | `a11y.test`: every header button named ("Chats, 3 waiting"); the title has the header role |

## Owner decisions (defaults chosen, never blocking)

1. AI in the header? **Default: no**, it lives in the switcher and on Home.
2. Flow, Doc Tools and Tables as "On the web"? **Default: LATER**.
3. Global search? **Default: LATER**.

## Gates

lint · tsc · full jest · bundle · `board_check` · `test:qa` · `lint:vocabulary`,
then device QA with the served bundle grepped before each verdict, and a contact
sheet at `~/Downloads/multimagic-mobile-qa/2026-11-17-app-shell.jpg`, also in
Pages.
