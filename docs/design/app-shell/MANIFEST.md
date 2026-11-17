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
| M1 | Every app root shows the same `AppHeader`, from one component: Home, Notes, Pages, Chats, Calendar, Contacts (phone and split), SafeZone, Tasks, Finance, Notifications | jest `app/__tests__/shellEverywhere.test.tsx` › "%s shows the one shared header"; device: one shot per app | ☑ jest shellEverywhere 10 roots + shellSubScreens 7 (21 sub-screens converted, fa5508d); device S2 PASS: 9 app roots, same six handles, own name, no back |
| M2 | Header order is the web's: Chats (9+), Notifications (99+), AI, Apps, Avatar | jest `appShell.test.tsx` › order, caps | ☑ jest appShell order + caps; device S1 labels 'Chats, 3 waiting', 'Notifications, 15 unread'; mockup 4 |
| M3 | Badges come from React Query on the existing keys (`useShellBadges`); none while unknown | jest › counts, capped, read aloud; offline is not 0 | ☑ jest: counts capped, read aloud, absent on error/offline; device S1 badges 3 and 15 match the server (seed) |
| M4 | Apps opens the switcher with every registry app; a tap jumps straight there | jest › switcher suite; device: Tasks → Finance → Notes → Calendar without Home | ☑ jest switcher suite (12); device S3 PASS: Tasks → Finance → Notes → Calendar via the sheet, all 12 tiles |
| M5 | One registry feeds Home, the switcher and Profile | jest › registry order; each list renders every key | ☑ jest registry order + Home/switcher/Profile render every key |
| M6 | Profile has a complete, collapsible Apps section, remembered | jest › "is complete, collapsed at first…" | ☑ jest Profile suite; device S4 PASS: complete list, Tasks checked, tap → Contacts |
| M7 | Back: the badge goes Home on a root; a chevron on a sub-screen; Android back → history, then Home; switching never piles apps up | jest `appShell` back suite, `backToHome.test.tsx`, `shellSubScreens.test.tsx`; device | ☑ jest back suites (appShell, backToHome, shellSubScreens); device S3 Android back after 3 switches → Home; S6 list back → Tasks |
| M8 | Home: greeting, Ask box, Coming up (absent when empty or failed), every app tile | jest `shellEverywhere` › Home suite; device shot | ☑ jest Home suite; device S1 greeting, Ask box, Coming up ([qa] Dentist), tiles; sheet rows 1–5 |
| M9 | No shell on focused surfaces: assistant, chat thread, editors, modals | jest › "focused surfaces keep their own chrome" | ☑ jest: assistant and thread render no app-header; device S5 the assistant has its own chrome |
| M10 | The current app is shown: its badge and name, ringed in the switcher, checked in Profile, its own button selected | jest | ☑ jest selected/ringed/checked; device shots (Tasks ringed in switcher, ✓ in Profile) |
| M11 | **Reopen in the same app**: a cold start opens the last app at the screen saved (Finance › Loans, a Tasks list), never Home when one is known | jest `app/__tests__/reopen.test.tsx`, `src/apps/__tests__/lastPlace.test.ts`; device: Finance › Loans, kill, relaunch → Finance › Loans | ☑ jest reopen 20 + lastPlace 41; device S7 Finance › Loans → Finance › Loans; S8 Tasks list → the list over Tasks |
| M12 | **Every fallback is that app's root, never Home**: a record that is gone, offline, a form, editor or modal, SafeZone (PIN gate) | jest › "a list deleted since…", "offline, a loan…", "SafeZone reopens…", placeFor table; device: kill from SafeZone → PIN gate | ☑ jest gone/offline/forms → app root; device S9 SafeZone → PIN gate (PIN set; FLAG_SECURE so the hierarchy is the proof) |
| M13 | **Home on a first launch, after sign-out, or when Home is where he left** (B7); a deep link or notification wins; sign-out and another account clear it; an older save still reopens its app | jest › reopen suite; `parsePlace` table | ☑ jest first launch/sign-out/account/old save; device S11 sign out → sign in → relaunch → Home; S10 (Home → last app) superseded by B7, re-check ☐ |
| M14 | **AI button in the header** on every app root and sub-screen; it opens the assistant over the screen; read aloud "Ask the assistant" | jest `appShell` › "the AI button opens…"; `shellEverywhere`, `shellSubScreens` (`header-ai` present) | ☑ jest appShell AI button; device S5 AI over Finance › Loans, back → same tab |

## Black-box run (implement-change 6b), 2026-11-17

A separate agent tested only through the phone, without reading the code, with
the persona "the owner on his phone, switching apps all day". It reproduced
5 issues, each at least twice (videos and shots in the QA scratch folder, not
in this public repo). All are fixed test-first, and the rules are written into
`src/components/shell/CLAUDE.md` (flywheel).

| # | Found | Fix | Proof | Device re-check |
|---|---|---|---|---|
| B1 | A double tap on Chats, Notifications or AI pushed the screen twice | `useSingleFire` guard on every header navigation | jest `appShell` › "a double tap on %s opens its screen once" ×3, plus "works again after the window" | ☐ |
| B2 | A people-chat thread reopened as the Chats list | The thread is a record: re-opened once fetched, with its name | jest `reopen` › thread re-opens / deleted → Chats; `lastPlace` thread | ☐ |
| B3 | Kill during "New expense" reopened Finance › Overview | Forms, editors, viewers and secrets are not places, so the screen under them stays saved | jest `lastPlace` NOT_PLACES table; `reopen` › "opening a form over Finance › Expenses keeps…" | ☐ |
| B4 | Pages' bottom tab was not restored | Pages writes `tab` with `router.setParams`; `placeFor` keeps it | jest `shellEverywhere` › "choosing Files writes tab=files"; `lastPlace` | ☐ |
| B5 | **Privacy class.** The AI button opened a remembered session id that pointed at a PEOPLE conversation, rendered as AI answers, then "AI conversation not found" | A remembered id is used only if it is in `GET /ai/sessions`; otherwise it is forgotten and the server's current session opens; not trusted while that list cannot be read | jest `chat.session` › "a remembered id that is a PEOPLE conversation is never rendered, and is forgotten", plus 2 more | ☐ |
| B6 | A new expense defaulted to USD | The currency memory was phone-wide (USD left by an earlier run). It is now per user, shared by the entry, loan and recurring forms; with nothing remembered, EUR | jest `lastCurrency` ×5 (incl. "no finance form writes a currency literal") | ☐ |
| B7 | Left from Home → reopened the last app | Owner via Hello: "reopen where you left" means Home too. Home is now a place | jest `reopen` › "left on Home, Home reopens", "leaving from Home saves Home" | ☐ |

Not reproducible on this rig: rotation (the app is portrait-locked).

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
| Dark mode | yes | `screens.render.test` both schemes; device shots light and dark | ☑ jest screens.render both schemes; device sheet rows 2 and 5 |
| RTL | yes (no RTL language yet) | the header is one `row`, which RN mirrors (order reverses as the web's does in RTL); jest: the chevron mirrors under `isRTL` | ☑ jest chevron mirrors under isRTL; ⚠ no RTL language to run on a device |
| 360 / 411 / 800 dp | yes | jest › "room at small widths" (36 dp at 360, 40 at 411, badge only < 340, labels at 800); device at 360, 411, 800 | ☑ jest sizing suite; device sheet rows 1, 3, 4 (36 dp buttons and 'Calen…' at 360, labels at 800) |
| Offline / slow network | yes | badges absent on error; the header never waits; a reopen offline stays on the app's root | ☑ jest badges absent, reopen offline stays on the app root; ⚠ device offline left to the black-box run |
| Empty / loading / error | yes | Coming up absent when empty or failed | ☑ jest Coming up absent when empty or failed |
| Double tap | yes | one sheet for two taps on Apps; one navigation for two taps on a tile; one restore per launch | ☑ jest one sheet, one navigation, one restore |
| Roles / permissions | n/a | one user role on mobile | — |
| Recycled cells / image flash | yes (avatar) | device: the avatar while switching | ⚠ the QA account has no photo (initials); no flash seen while switching |
| i18n | yes | `keys.test`, `locales.test`; every new label en/fr | ☑ keys 81/81, locales 8/8 |
| Accessibility | yes | `a11y.test`; buttons named with counts ("Chats, 12 waiting"); the title has the header role; badge-only reads "Finance, Go to Home" | ☑ a11y 6/6; labels read with counts; badge-only name read |
| Notifications side effects | yes | a reminder tap still opens its note or list, over a restored app | ⚠ a reminder tap over a restored app not run on the device (no due reminder in the QA data) |
| Storage failure | yes | unreadable storage → no place, no crash (jest) | ☑ jest unreadable storage → no place |

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
