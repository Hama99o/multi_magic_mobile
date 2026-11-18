# Profile parity: manifest (2026-11-17)

**Goal (owner's words):** "full profile changes which we have in web should be also on mobile; web and mobile should have all features: change password, add a PIN to SafeZone, API, MCP, etc. All."

**Base:** `feat/app-shell-header` (the app-shell work). This work stays out of the shell files (`src/components/shell/*`, `src/apps/*`, `ProfileSheet.tsx`'s Apps section).

## Inventory: web feature → mobile before → after

| # | Web feature (where on web) | Mobile before | After this branch |
|---|---|---|---|
| 1 | Name, bio, avatar set/remove (EditProfileDrawer) | present | unchanged |
| 2 | Username (EditProfileDrawer) | missing | **edit** on Your profile; 422 field errors shown |
| 3 | Birth date (EditProfileDrawer) | missing | **edit** on Your profile |
| 4 | Cover photo set/remove (Show, EditProfileDrawer) | missing | **set and remove** on Your profile |
| 5 | Change password (ChangePassword) | present (min 6) | **min 8**, the server's rule after #31 (d4d8a0e6) and the web's. Server and web disagreed (6 vs 8); decided: the server is the source of truth, 8 where they disagree [`change-password` test, `profile.test.ts`] |
| 6 | Two-factor on/off (EditProfileDrawer) | missing (login verify only) | **on/off with the password re-asked**, on Security |
| 7 | 2FA code at sign-in, trust this device | present | unchanged |
| 8 | Active sessions: list, sign one out (devices/Index) | missing | **Security › Signed-in devices**; the current one is marked and has no sign-out |
| 9 | Trusted devices: list, remove | missing | **Security › Trusted devices**, paged |
| 10 | Login history: list, delete one, clear all | missing | **Security › Sign-in history**, paged; clear all asks first |
| 11 | SafeZone PIN: on, off, change, forgot (emailed code) | present (audit #7, #27 done) | unchanged |
| 12 | AI keys: add, replace, activate, remove | present | unchanged |
| 13 | Lend an AI key by email with a monthly limit; change the limit; revoke (KeySharing) | missing (borrowed shown) | **lend, change the limit and revoke** on AI keys |
| 14 | AI usage and cost by period (AiUsagePanel) | missing | **usage panel**, 7 periods |
| 15 | Morning brief | present | unchanged |
| 16 | Personal API keys: list, create (token shown once), delete (api_keys/Index) | missing | **API keys** screen: token shown once with copy, never stored or logged |
| 17 | Connect Claude: endpoint and instructions (ConnectClaude) | missing | **Connect Claude** screen with copy |
| 18 | MCP connections and activity; disconnect (McpConnections) | missing | **listed with activity; disconnect asks first** |
| 19 | Followers / following lists (FollowListDrawer); follow/unfollow | missing | **lists on Your profile; follow back / unfollow** (needs server fix S1) |
| 20 | Block / unblock (Show) | missing | **unblock from the following/followers row menu** (server fix S1); blocking is from people chat, out of scope |
| 21 | Theme (TopNav, saved to the account) | local only | **also saved to the account** like web |
| 22 | Language | present | unchanged |
| 23 | Notifications inbox | present | unchanged |
| 24 | Delete account | present (web has none) | unchanged |
| 25 | Email change | locked (web: no UI; the server takes `email` in PATCH with no re-check) | **change with the password re-asked and a code sent to the new address** (server S3); the socket's stored email is updated in the same step |
| 26 | Forgot password, in-app reset (audit #12) | the reset happens on the web | **unchanged: owner decision** (needs universal links and a store build) |
| 27 | Notification preferences | none | n/a: neither web nor server has them |
| 28 | Account-wide data export | none | n/a: neither has it (per-app exports exist) |

## MUST (each one is checked by the test named in brackets)
- Each "After" cell above, as a screen test in `app/__tests__/` or `src/**/__tests__/`, red first.
- **Security re-asks exactly as the server does:** 2FA on/off and email change ask for the current password; a wrong one (422 `wrong_current_password`) shows against the field and never signs out. [2FA and email tests]
- **A new API key's token is shown once.** It is not in React Query's cache, not in storage, not in any log or analytics call; leaving the screen drops it. [api-keys test asserts it is absent from the query cache and from storage, and that `console` is never called with it]
- **Lists are newest first and paged** (sessions, trusted devices, history, followers). [tests]
- **Destructive actions ask first:** sign a device out, clear history, revoke a key, disconnect MCP, stop lending. [tests]

## MUST NOT
- Touch the shell files, push the branch (this repo is public), build for a store, or deploy.
- Hold a secret beyond the screen that shows it once.
- Copy the web's likely-broken follow/block body: send the flat params, or rely on server fix S1.

## Server PR (multi_magic, separate, DO NOT MERGE)
- **S1** follow, unfollow, block, unblock accept the web's nested body as well as the flat one (the web's call is likely broken today).
- **S2** rate limits on change_password, 2FA enable/disable, delete account, API key creation, and email-change request/confirm.
- **S3** email change with verification (built: multi_magic PR #31). `POST /api/v1/users/me/email_change {current_password, email}` emails a 6-digit code to the new address (15 min, 5 attempts). `POST /api/v1/users/me/email_change/confirm {code}` changes the email and notifies the old address. `email` is removed from the plain `PATCH /users/:id` (owner decision, see below).

## Hidden criteria
- RTL: rows mirror and chevrons flip. [render test with RTL forced, plus the device]
- Dark mode: tokens only. [lint, plus the device]
- Tablet: measure width. [render at 800 dp]
- Offline: every write refused with the offline line, nothing queued. [tests with a network error]
- Rate limited: the 429 sentence (`failureMessage`). [tests]
- No secrets in logs, analytics or screenshots: tokens are blurred in the QA sheet.
- en/fr i18n: keys tests.
- Double tap: submit buttons are busy-disabled. [tests]
- Empty, loading and error states with retry (`LoadFailure`). [tests]

## Owner decisions (defaults taken)
- **Email change needs the password plus a code to the new address**, and the plain PATCH no longer accepts `email`. Default: yes.
- **In-app password reset (audit #12)** stays on the web for now: it needs universal links and a store build.
- **The web lacks delete account and email change.** The owner said "web and mobile should have all features"; that is a web follow-up, not this branch.
- **New-password minimum: DECIDED 2026-11-17** (relayed by the supervisor session): the mobile follows exactly what the server validates; where server and web disagree, 8. Server moved 6 → 8 in #31 (d4d8a0e6, spec `password_minimum_spec.rb`), mobile 6 → 8, web already 8. Existing shorter passwords still sign in. Until #31 is deployed the phone is stricter than the live server.

## Evidence (2026-11-17)
Device: qa_phone3 (emulator-5562), dev build on Metro 3029 serving this worktree at fe1c05f (bundle grepped for the new testIDs and for `10.0.2.2:3002`), API = multi_magic PR #31's branch on :3002 against the throwaway `mm_int_profileapi_development` (dropped afterwards), QA account only. Contact sheet: `~/Downloads/multimagic-mobile-qa/2026-11-17-profile-parity.jpg`, also in MultiMagic Pages › MultiMagic › 2026-11-17. API-key tokens are blurred; the one unblurred explorer screenshot was deleted.

| Criterion | Evidence |
|---|---|
| Profile: username, birth date, cover, email row, links | jest `profile-parity`; device: birth date saved (server log `PATCH /api/v1/users/1` 200, `birth_date = '1990-05-14'`) |
| 2FA on/off re-asks the password; wrong one is 422 and never signs out | jest `security`; device: wrong → "That password is not right." (422), right → on (200), off again |
| Sign a device out asks first | device: Android confirm, then `DELETE /api/v1/active_sessions/2` 204 and the row goes |
| Email change: password + 6-digit code to the new address | jest `change-email`; device: wrong code "4 tries left", real code from the dev mail file → changed; old address got the notice mail; sign-in with the old email now 401 |
| Socket follows the new email | device: after a relaunch, `/cable` registered with `email = qa.parity.new@…`, MessageChannel subscribed |
| API key token shown once, never cached or logged | jest `api-keys`; device: shown once, gone after leaving; token string found 0 times in Metro, server and logcat logs |
| Follow/unfollow; the web's nested body (S1) | device: `POST /follows/follow {"follow":{"followed_id":2}}` 200; unfollow asks first, sends both shapes, list empties |
| Theme saved to the account | device: Dark → `PATCH {"theme":"dark"}`, whole app dark |
| Rate limit on sensitive actions | device: 6th change-password try → 429, "Too many requests just now… Your password is unchanged" |
| Offline refused clearly | device: API key, 2FA and email change each show "Impossible de joindre MultiMagic." with the offline banner; nothing created |
| No secrets in logs | QA password: 0 hits in Metro, server (`[FILTERED]`) and logcat |
| Dark | device: profile, security, API keys, Connect Claude, followers, change email |
| en/fr at 360 dp | device: every new screen in French at density 480 |
| Tablet 800 dp | device: profile, security, API keys measured to a readable width |
| RTL | jest forced-RTL chevron tests. Device: with the SYSTEM locale ar-EG the app stays LTR; this build does not opt into RTL (no RTL language), so device RTL is N/A |
| Black-box explorer (6b) | separate agent, no code: 6 reproduced bugs, triaged below |

### Found on device and fixed (each red first)
- A 30-day API key listed "Expires just now" (`relativeTime` is past-only) → a date, or "Expired". [api-keys test; device re-check: "Expires Dec 17, 2026"]
- The Write scope card ran off a 411 dp screen → described cards share the row. [device re-check]
- French 360 dp cut the expiry year → key rows allow 3 detail lines. [device re-check]
- BB1 a birth date in the future was saved → refused with its own sentence. [profile-parity tests; device NOT re-checked, emulator handed back]
- BB2 a save error outlived the edit that fixed it → any edit drops the last save's error and "Saved". [profile-parity test, planted red]
- "Adresse actuelle:" → the colon lives in each language's string ("Adresse actuelle : …"). [change-email test]

### Fixed 2026-11-18 (Hello relay: "fix the 4 flaws you reported, test-first")
Device: qa_phone3, Metro 3029 serving this worktree, API = #31's branch at 1ebed366 then 7f8be11d on :3002 against a recreated throwaway `mm_int_profileapi_development`, QA account in French. Sheet: `~/Downloads/multimagic-mobile-qa/2026-11-18-profile-flaws.jpg`.

| Flaw | Fix | Evidence |
|---|---|---|
| BB3 raw provider error in English | server `Ai::Keys` answers a code (`invalid_key`, `no_credit`, `rate_limited`, `unreachable`, `refused`, …) and our sentence in the reader's language, raw text to the log only; a key refused later lists `verification_code: rejected_later`. The phone words the code itself (`ai-keys.tsx` `refusalText`), so even today's server, which sends no code, never shows the raw text | rspec `keys_spec`, `ai_keys_controller_spec`; jest `ai-keys`, `aiKeys` (red first). Device: a fake DeepSeek key, refused by the real provider with 401 → "DeepSeek n’a pas accepté cette clé. Vérifiez que vous l’avez copiée en entier." |
| BB4 "Unknown Browser on Unknown OS" | the app sends `User-Agent: MultiMagic/<version> (Android <api>)` (`http.ts`); the server names it "MultiMagic app · Android" / "Application MultiMagic · Android" (also okhttp/CFNetwork from builds already in the stores), translates the unknown parts, and words a session's label in the account's language (`DeviceLabel`, `User::JwtDispatch`). Labels stored earlier are translated on the phone (`src/lib/deviceLabel.ts`) | rspec `user_agent_parsing_spec`, `session_device_label_spec`; jest `deviceLabel`, `security`, `http`. Device: server saw `MultiMagic/1.2.0 (Android 35)`; Security lists "Application MultiMagic · Android", a planted legacy row reads "Appareil inconnu" |
| BB5 "Qa PARITY" | server `User#fullname` is the two parts exactly as typed (mail subjects follow); the phone builds its own name from the parts too, so it is right before #31 deploys | rspec `user_spec` + mailer specs; jest `profile`. Device: typed "Qa" / "de Parity" → account sheet "Qa de Parity" |
| AI key lending unproven | proven on device with a fake verified key in the throwaway DB (lending never calls the provider): lend to a throwaway address with 50 → "0 crédits sur 50", revoke after an Android confirm, notice mail in the dev mail file. **Found doing it:** a loan's limit could not be changed (re-lending is a no-op on the server, nothing called `setLoanLimit`) → each loan row has "Limite", which edits that address's limit | jest `accountExtras` "changing a loan's limit" (red first). Device: 50 → 20, row "0 crédits sur 20" |

### Keyboard, dark, 360/800 dp — 2026-11-18 (Hello relay)
**The form's button under the keyboard, fixed for every scrolling form.** Under SDK 57 edge to edge, `KeyboardPadding` shrinks the scroll area and nothing scrolled: the AI keys save sat under the keyboard, and the focused field too (field at 977 in a window ending at 885). `Screen` (scroll + avoidKeyboard) now scrolls, once the lift settles and whenever the content grows with the keyboard up, the nearest registered button below the focused field into view, never pushing the field off the top; with no button below, the field itself (`src/components/keyboardTarget.tsx`). `Button` registers itself; hand-built submits are wrapped in `<KeyboardTarget>` (a hook in the screen sits above Screen's context and registered nothing, which the device showed). Tests: `keyboardTarget.test.tsx` (planted red: no reveal → red), `keyboardTargets.test.ts` (every hand-built submit on a settings screen is wrapped).

Device (qa_phone3, 411 dp, French), button bottom vs keyboard top, every one VISIBLE: AI keys key → save; lending limit → Partager; profile about and birth date → Enregistrer; change email password → send; change password (first and last field) → save; API key name → create; delete account password → confirm (measured, never pressed); 2FA password → confirm. After a refusal at 360 dp the save stays above the keyboard (1491 = keyboard top).

Dark at 360 and 800 dp: sessions (legacy row "Appareil inconnu"), account sheet "Qa de Parity", loan row with Limite, change-limit edit mode, the DeepSeek refusal — all fit and read. Sheet: `~/Downloads/multimagic-mobile-qa/2026-11-18-keyboard-dark-sizes.jpg` (keyboard suggestion strips blurred: the emulator's clipboard showed someone else's text).

Follow-up the same day (Hello relay), all red first:
- **Loan row at 360 dp:** the address has its own full-width line (up to two), the status and the two actions under it. Device: "friend.parity.long.address@example.test" shown whole. (Two lines beside the actions were tried first and still cut it — "friend.parity / .long.addre…" — so the row was stacked.)
- **Read-only address in edit mode:** `Input` with `editable={false}` has no border, the page's ground, muted text, a lock, `accessibilityState.disabled`, and wraps instead of scrolling (one line showed only ".parity.long.address@example.test"). Device: the whole address over two lines with the lock.
- **Keyboard at 360 dp:** the same 8 forms (AI key, lending limit, profile, change email, change password, API key name, delete account — never pressed —, 2FA): every button VISIBLE above the keyboard.
- **`notes/edit.tsx` — left to the Notes owner, not changed here.** 13 unmerged Notes branches change that file and this branch's copy already differs from main's by 273 lines, so an edit here would conflict. For them: the editor is `<Screen avoidKeyboard>` **without `scroll`** (`app/notes/edit.tsx:756`), and the reveal only runs on a scrolling Screen, so wrapping `note-link-save` and `note-more-delete-confirm` in `<KeyboardTarget>` would change nothing there. What to check instead, on a device: whether those two buttons (in the link and "more" panels) end up under the keyboard; if they do, they need the editor's own scroll or the panel lifted.

Sheet: `~/Downloads/multimagic-mobile-qa/2026-11-18-360-keyboard-loan.jpg`.

### Found and NOT fixed here (not this branch's code)
- BB6 French 360 dp: "Discussions" cut to "Discussio…" in the header and apps grid: shell files, owned by the app-shell branch.
- Buttons go grey with no reason (invalid email on Change email, no scope on API keys); the offline banner promises "it'll all send" for writes that are refused instead. Polish, noted.

### Unproven
- The two new mails' look in a real mail client (only the dev file delivery was read).
- A concurrent confirm of the same email code.
- BB1 and BB2 fixes on a device.
- The 2026-11-18 fixes on iOS (the User-Agent override and the keyboard scroll are only measured on Android).
- The per-form keyboard check at 800 dp (it ran at 411 and 360 dp).

### For the Finance owner: the `financeApp.test.tsx` flake (found 2026-11-18, not fixed here)
- **Test:** "the entry sheet › adds an expense: amount on the keypad, a name, a subcategory (its category comes too), today". Fails about 1 run in 2 with `--randomize`; `--seed=-1051049791` reproduces it every time. Error: `finance-entry-amount-text` expected "€12.5", received "$12.5".
- **Cause: shared state between tests, a currency default.** `useLastCurrency` (`src/screens/finance/lastCurrency.ts`, SPEC B7) keeps the last currency in AsyncStorage under `finance_last_currency`. The jest AsyncStorage mock (`src/__tests__/setup.ts:91`) is in memory for the whole file. When "switches to an income and picks another currency" (it saves in USD) runs first, the next new entry starts in dollars. The app is right; the suite's `beforeEach` never resets that key. It showed up once in a full run because file order is usually stable.
- **Fix (proven locally, then reverted; Finance code, and `feat/todo-finance-apps` has 2 unmerged commits on these files):** in the `beforeEach` of `financeApp.test.tsx`, add
  `const storage = require("@react-native-async-storage/async-storage"); await (storage.default ?? storage).removeItem("finance_last_currency");`
  (the mock exports its functions directly, so a bare `.default` is undefined). With it: the failing seed passes, and 0 of 10 random orders fail.
