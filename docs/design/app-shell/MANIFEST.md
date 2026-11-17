# App shell — done-manifest

Written before any screen code (on-the-loop method, 2026-11-17), then
extended by the owner's three changes the same day:
- AI goes in the header;
- the app reopens where he left it;
- that reopen never lands on Home.

The repo is public: this file stands in for the PR description
(`implement-change` §7). Status per line: ☐ open · ☑ proven (evidence beside
it) · ⚠ unproven (said so).

**Goal (his words):** *one shared top header on every app, the same as the web,
fast switching between apps without going back to Home, a better Home*, plus
*"if I close the app while in one app, when I open it again it should open in
the same app … not home page"*.

## MUST

| # | Criterion | Check | Status · evidence |
|---|---|---|---|
| M1 | Every app root shows the same `AppHeader`, from one component: Home, Notes, Pages, Chats, Calendar, Contacts (phone and split), SafeZone, Tasks, Finance, Notifications | jest `app/__tests__/shellEverywhere.test.tsx` › "%s shows the one shared header"; device: one shot per app | ☐ |
| M2 | Header order is the web's: Chats (9+), Notifications (99+), AI, Apps, Avatar | jest `appShell.test.tsx` › order, caps | ☐ |
| M3 | Badges come from React Query on the existing keys (`useShellBadges`); none while unknown | jest › counts, capped, read aloud; offline is not 0 | ☐ |
| M4 | Apps opens the switcher with every registry app; a tap jumps straight there | jest › switcher suite; device: Tasks → Finance → Notes → Calendar without Home | ☐ |
| M5 | One registry feeds Home, the switcher and Profile | jest › registry order; each list renders every key | ☐ |
| M6 | Profile has a complete, collapsible Apps section, remembered | jest › "is complete, collapsed at first…" | ☐ |
| M7 | Back: the badge goes Home on a root; a chevron on a sub-screen; Android back → history, then Home; switching never piles apps up | jest `appShell` back suite, `backToHome.test.tsx`, `shellSubScreens.test.tsx`; device | ☐ |
| M8 | Home: greeting, Ask box, Coming up (absent when empty or failed), every app tile | jest `shellEverywhere` › Home suite; device shot | ☐ |
| M9 | No shell on focused surfaces: assistant, chat thread, editors, modals | jest › "focused surfaces keep their own chrome" | ☐ |
| M10 | The current app is shown: its badge and name, ringed in the switcher, checked in Profile, its own button selected | jest | ☐ |
| M11 | **Reopen in the same app**: a cold start opens the last app at the screen saved (Finance › Loans, a Tasks list), never Home when one is known | jest `app/__tests__/reopen.test.tsx`, `src/apps/__tests__/lastPlace.test.ts`; device: Finance › Loans, kill, relaunch → Finance › Loans | ☐ |
| M12 | **Every fallback is that app's root, never Home**: a record that is gone, offline, a form, editor or modal, SafeZone (PIN gate) | jest › "a list deleted since…", "offline, a loan…", "SafeZone reopens…", placeFor table; device: kill from SafeZone → PIN gate | ☐ |
| M13 | **Only Home on a first launch or after sign-out**; a deep link or notification wins; sign-out and another account clear it; an older save still reopens its app | jest › reopen suite; `parsePlace` table | ☐ |
| M14 | **AI button in the header** on every app root and sub-screen; it opens the assistant over the screen; read aloud "Ask the assistant" | jest `appShell` › "the AI button opens…"; `shellEverywhere`, `shellSubScreens` (`header-ai` present) | ☐ |

## MUST NOT

- Change any app's own design below the header beyond moving its title row's actions into its own row.
- Break a testID a flow or test uses without updating it in the same commit (`home-tile-ai` kept).
- Add an endpoint, a server change or a dependency.
- Merge, push (the repo is public), deploy, or run an EAS/store build.

## Invariants

- No prod deploy, store or TestFlight build, or message to real people, without the owner's own yes.
- One worktree (`../mm-app-shell`), Metro port 8095, and its own QA database (`mm_qa_shell_*`, through the guard).
- Lists stay newest first: no list order is touched here.
- Tokens only.
- No secrets.
- Invented data only.

## Hidden criteria

| Criterion | Applies | Check | Status |
|---|---|---|---|
| Dark mode | yes | `screens.render.test` both schemes; device shots light and dark | ☐ |
| RTL | yes (no RTL language yet) | the header is one `row`, which RN mirrors (order reverses as the web's does in RTL); jest: the chevron mirrors under `isRTL` | ☐ |
| 360 / 411 / 800 dp | yes | jest › "room at small widths" (36 dp at 360, 40 at 411, badge only < 340, labels at 800); device at 360, 411, 800 | ☐ |
| Offline / slow network | yes | badges absent on error; the header never waits; a reopen offline stays on the app's root | ☐ |
| Empty / loading / error | yes | Coming up absent when empty or failed | ☐ |
| Double tap | yes | one sheet for two taps on Apps; one navigation for two taps on a tile; one restore per launch | ☐ |
| Roles / permissions | n/a | one user role on mobile | — |
| Recycled cells / image flash | yes (avatar) | device: the avatar while switching | ☐ |
| i18n | yes | `keys.test`, `locales.test`; every new label en/fr | ☐ |
| Accessibility | yes | `a11y.test`; buttons named with counts ("Chats, 12 waiting"); the title has the header role; badge-only reads "Finance, Go to Home" | ☐ |
| Notifications side effects | yes | a reminder tap still opens its note or list, over a restored app | ☐ |
| Storage failure | yes | unreadable storage → no place, no crash (jest) | ☐ |

## Owner decisions

1. AI in the header: **yes** (his reversal, 2026-11-17).
2. Flow, Doc Tools, Tables "on the web": **LATER**.
3. Global search: **LATER**.
4. Badge-only fallback below **340 dp**, not 360 (Hello agreed; mockup 4).

## Gates

lint · tsc · full jest · bundle · `board_check` · `test:qa` · `lint:vocabulary` ·
`flow_lint`, then device QA with the served bundle grepped before each verdict.
Contact sheet: `~/Downloads/multimagic-mobile-qa/2026-11-17-app-shell.jpg`, also
in Pages.
