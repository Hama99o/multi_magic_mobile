# SafeZone: the fourth full app (2026-11-13)

**Status: `IN PROGRESS`**. Specified, researched and built test-first on
`feat/safezone-app`: the API layer, the lock state, the gate (Set a PIN /
PIN pad / lockout), the masked vault, and the item with reveal and copy.
Jest proves that no secret is shown unless asked for (planted leaks go
red). **Not yet measured:** a device pass (no emulator slot yet, so
nothing in `ours/`), and FLAG_SECURE, which needs a native build with
`expo-screen-capture`.

The owner, 2026-11-12 (relayed by the supervisor session): *SafeZone as the
fourth full app: the passwords, payment cards and identity documents, behind
the PIN.* The supervisor's frame: **mask in the app, keep secrets in memory
only, assume nothing about server masking.** The rules are in
[`SECURITY.md`](SECURITY.md), written before the code; this file is the
design.

## A · What the web and the API have, and where it lands on the phone

Read from `multi_magic/app/javascript/pages/safezone/` and
`Api::V1::SafezoneApp::*` on 2026-11-13.

| Web | API | Phone |
|---|---|---|
| `SafezoneGate` + `PinPad` | `GET pin`, `POST pin/unlock {pin}` → `{unlock_token, expires_in}`, `POST pin/refresh` | `app/safezone/index.tsx` renders `SafeZoneGate`: Set a PIN / Unlock / lockout / the vault |
| Passwords list (plaintext) | `GET passwords?page=&search=&masked=1` → `{passwords:[…], meta}` 20 a page | the **Passwords** tab: title, username or email, the site's initial. No secret; "weak" from `password_weak` once PR #19 is deployed, otherwise nothing |
| Cards list | `GET payment_cards?masked=1` → `{payment_cards}` | the **Cards** tab: name, type, `•••• 4242`, expiry |
| Identities list | `GET identities?masked=1` → `{identities}` | the **IDs** tab: type (Passport, ID card…), `•••• 1234`, the expiry date, "Expired" in red |
| Drawer with every field | `GET <kind>/:id` (full plaintext) | `app/safezone/item.tsx?kind=&id=`: fields masked, Reveal / Copy per secret field |
| Create / edit / delete | `POST`, `PUT`, `DELETE` (a hard delete, no trash) | **phase 2** (§E). Delete confirms with the item's name; there is no undo, because the server keeps nothing |
| Security page (health) | `GET passwords/health` | phase 2 |
| PIN enable / change / disable | `pin/enable`, `request_change` + `confirm_change`, `pin/disable` | enable in the gate (phase 1); change and disable stay on the web for now |

Secret fields, per kind (`SECRET_FIELDS` in `src/api/safezone.ts`):
password → `password`; payment_card → `card_number`, `cvv`, `code`;
identity → `document_number`.

## B · References (Mobbin, 2026-11-12/13)

Downloaded to `references/` (gitignored, other companies' screens). Cited by
their permanent links.

| What | Reference | Taken | Not taken |
|---|---|---|---|
| Item detail, masked password, a `…` menu with Copy / Reveal | [1Password item](https://mobbin.com/screens/f93aeb4d-8801-43e2-8613-32e160d3fc6e) | one row per field, label above value, the secret masked as dots; Reveal and Copy on the secret row | "Show in Large Type", "Pin to Home": a big-type secret is a shoulder-surfing gift |
| Copied feedback in place | [1Password copied](https://mobbin.com/screens/f4cc1f13-a716-4056-840e-7b41aed4fd90) | the row itself says "Copied", no toast covering other rows | adds "clears in 30 s", because ours clears and theirs says nothing |
| List with a masked card | [1Password list](https://mobbin.com/screens/906e4bd5-8dc7-4ed9-a940-48f45a41c125) | the card row's subtitle `4185 ****`, a logo/initial per row, a search field | the date grouping: our lists sort by `updated_at` desc, as the server does |
| Category filter | [1Password categories](https://mobbin.com/screens/573e5a8b-8edc-4b92-bb3f-995d1cc46435) | three kinds only, so a **segmented control** (Passwords / Cards / IDs) instead of a dropdown | |
| 6-digit pad, dots, "Forgot" | [Starling passcode](https://mobbin.com/screens/de0a2b53-1c07-4292-a7d8-a8dce0238601), [Monzo PIN](https://mobbin.com/screens/72c5018c-2590-4263-af0b-6d816debf83d) | big 3×4 custom pad, six dots, a "Forgot PIN?" link (→ the web's change flow, which needs an emailed code) | Monzo's "Use Face ID next time" switch: biometric is §F, not built |
| Wrong code | [Posh invalid code](https://mobbin.com/screens/450e9571-11d6-4e9b-bc7e-5b0373470d9e) | the error names what happened and is next to the pad | their red banner at the top, far from the thumb |
| Card details with per-field copy (earlier search) | Wise / Chime / Zopa card screens (2026-11-12) | each secret its own row with its own Copy | |

Bitwarden, Apple Passwords, Proton Pass and Dashlane are **not on Mobbin**
(searched 2026-11-13; the results were other apps). That is said here so
nobody thinks they were left out.

## C · The screens

### C.1 The gate (`app/safezone/index.tsx` → `SafeZoneGate`)

On mount: `GET pin` (the status only; this call never needs the token).

- **`notEnabled`**: "Protect SafeZone with a PIN": PIN, confirm, account
  password → `POST pin/enable`. Then Unlock (the server sends no token on
  enable, by design).
- **`locked`**: `PinPad`, six dots, a 3×4 pad, ⌫, "Forgot PIN?". The sixth
  digit submits; there is no button.
- **`lockedOut(until)`**: the pad is greyed out, with "Locked after 5 wrong
  PINs. Try again at 21:47." and a minute countdown. When it reaches zero, the
  pad comes back (the server resets the counter: PR #19 #3).
- **`unlocked`**: the vault (C.2).

### C.2 The vault (`SafeZoneVault`)

A header with ← Home, "SafeZone", and a padlock (lock now). A segmented control
for Passwords / Cards / IDs (`safezone-tab-<kind>`), then a search box
(`?search=`, debounced, server-side; all three kinds support it). An infinite list, 20 a page.

Empty: "No passwords yet. Add them on the web for now." (phase 1 has no
create). Errors: the shared `states/` sentences.

### C.3 The item (`app/safezone/item.tsx`)

The fields in order, each a row: label above, value below. Secret rows show
`••••••••` with **Reveal** (an eye) and **Copy**. A plain field (username,
email, site, name, expiry, issue date, notes) has Copy only, and the site
opens in the browser.

Reveal: the secret is fetched (or taken from the fetch already held for this
item), shown in a monospaced font with a thin 20 s bar beneath, then masked
again. Copy: "Copied, clears in 30 s" in place of the value for 2 s.

### C.4 The cover

`SafeZoneCover`: a full-screen padlock over the vault while `AppState` is
`inactive`, so the app-switcher snapshot shows nothing.

## D · How we code it (identifiers)

| Piece | File | Pure? | Test |
|---|---|---|---|
| API: `pinStatus`, `unlock`, `refresh`, `enable`, `list(kind, {page, search})`, `show(kind, id)`, `remove`; `SafeZoneError` (`wrongPin`, `lockedOut`, `locked`, `notEnabled`, `rateLimited`, `invalidPassword`, `pinMismatch`); `stripSecrets`, `last4` | `src/api/safezone.ts` | yes (axios mocked) | `src/api/__tests__/safezone.test.ts` |
| Lock state: `status`, `token`, `expiresAt`, `lockEpoch`, `unlocked()`, `lock()`, `needsRefresh(now)`, `setStatusFromServer()` | `src/stores/safezoneLock.store.ts` | store, no persist | `src/stores/__tests__/safezoneLock.store.test.ts` |
| PIN entry: `pinReducer` (digit, back, clear, max 6, submit at 6) | `src/screens/safezone/pin.ts` | yes | `src/screens/safezone/__tests__/pin.test.ts` |
| Reveal timer: `createRevealer({ms, onChange, now, setTimeout})` – one field at a time, auto-hide, `hideAll()` | `src/screens/safezone/reveal.ts` | yes | `reveal.test.ts` (fake timers) |
| Clipboard: `createClipboardGuard({clipboard, ms, platform})` → `copy(value)`, `clearIfDue(now)`, `clearNow()` | `src/screens/safezone/clipboard.ts` | yes | `clipboard.test.ts` |
| Screen capture: `secureScreen.ts` (lazy `expo-screen-capture`) | `src/screens/safezone/secureScreen.ts` | no | `available` false without the module |
| Masking display: `maskedSubtitle(kind, row)` | `src/screens/safezone/display.ts` | yes | `display.test.ts` |
| Screens | `app/safezone/index.tsx`, `app/safezone/item.tsx`, `src/screens/safezone/{SafeZoneGate,PinPad,SafeZoneVault,SecretRow,SafeZoneCover}.tsx` | | RNTL: `safezoneApp.test.tsx` |
| Home tile | `home-tile-safezone` (as Contacts) | | render test |
| i18n | `safezone.*` en/fr | | keys/locales tests |

Query keys: `["safezone", kind, search]` for the stripped lists only. **No
query key ever holds a detail.** The item screen fetches with
`safezoneApi.show` inside `useSecretFields`, outside React Query.

The lock store also clears the query cache for `["safezone"]` on `lock()`, so
even the stripped titles go once the vault is locked.

## E · Phase 2 (after the first device pass)

Create / edit / delete for the three kinds (the forms mirror the web
drawers); the password health page; the password generator (1Password's
sheet is the reference); PIN change via the email code; the tablet split
(the list and the item side by side at ≥ 800 dp, as in the Contacts follow-up).

## F · Later, needs a native build or the owner

- **Biometric unlock** (`expo-local-authentication`): it would keep the PIN in
  SecureStore behind `requireAuthentication`, which reverses SECURITY §1's
  "never stored". That is the owner's call, logged in `docs/MISSING_FEATURES.md`.
- **Password autofill at login** (iOS credential provider extension, Android
  Autofill service): noted, not built.
- **Native clipboard expiry / sensitive flag** (SECURITY §9).

## G · Device and iPhone checklist: **NOT MEASURED** until run

Jest cannot see any of these. Each one is a verdict for the device pass
(Android, `qa_phone3`, with a native build that includes
`expo-screen-capture`) or for the owner's iPhone in the RC. Until then, each
stays NOT MEASURED: not a pass, and not a failure.

| # | Check | Where | How |
|---|---|---|---|
| D1 | FLAG_SECURE: a screenshot of the vault and of an item is black | Android | `adb exec-out screencap` on the vault, the item with a revealed field, and the PIN pad |
| D2 | A screen recording shows black while SafeZone is open | Android | `adb shell screenrecord`, open, reveal, stop |
| D3 | The recents thumbnail shows no vault | Android | open SafeZone, Home, then recents: screenshot |
| D4 | Leaving SafeZone lets screenshots work again elsewhere | Android | screencap on Home after SafeZone |
| D5 | The app-switcher snapshot shows the cover, not the vault | iPhone | swipe up with an item revealed |
| D6 | A screen recording of SafeZone on an iPhone **does** show the screen (detection is not built: SECURITY §9) | iPhone | to confirm the known gap, not a pass |
| D7 | Copy, then wait 30 s in the app: the clipboard is empty | both | paste into the search field |
| D8 | Copy, switch away at once, paste elsewhere within 30 s works; come back after 30 s and the clipboard is cleared on return | both | |
| D9 | iOS: does the clear raise the "Allow paste" prompt? (it must not: we never read the pasteboard there) | iPhone | |
| D10 | Android 13+: the clipboard preview chip shows the copied secret (`EXTRA_IS_SENSITIVE` is not set: SECURITY §9) | Android 13+ | confirm the known gap |
| D11 | Background → back: the PIN is asked again | both | |
| D12 | Kill the app with a copied secret pending: the copy stays (known gap) | both | confirm the gap |
| D13 | The pad, the vault and an item at 360 / 411 / 800 dp, light and dark, en and fr: shots into `ours/` | Android | the `DONE` bar |
| D14 | The heap: a dropped secret is unreachable, not overwritten (SECURITY §9). Not measurable with our tools; listed so nobody counts it | | none |

### G.1 · Measured on the device, 2026-11-13/14

Android 15 emulator. First the combined pre-merge build (`qa_phone3`), then
**main 2456ee5** (`qa_mm_phone`, a throwaway AVD, deleted after). QA
account, synthetic rows only. Evidence: the device-pass log and screenshots
filed in Pages → MultiMagic / 2026-11-14.

| # | Verdict | What was measured |
|---|---|---|
| D1 | **PASS** | `screencap` of the vault and of an item with the password revealed: black (mean 0.0) outside a system fps overlay that is not our window. The emulator's own framebuffer still shows the screen (FLAG_SECURE does not cover it, by design of the emulator) |
| D2 | **PASS** | `screenrecord` frame at 3 s: black, same reading |
| D3 | **PASS** | item revealed → Home → Settings → Recents: MultiMagic's card is blank |
| D4 | **PASS** | back on Home, `screencap` is normal (mean 233) |
| D5, D6, D9 | NOT MEASURED | iPhone only (owner's RC) |
| D7 | **PASS** | copied password pastes at once; nothing after 31 s |
| D8 | **PASS** | copy, Home, 31 s away, back: nothing to paste |
| D10 | **PASS** (was a known gap) | with `modules/sensitive-clipboard` (5bc5d22) the preview chip shows "••••••", on main too |
| D11 | **PASS** | background → back: the PIN pad |
| D12 | **PASS** (was a measured gap) | before the fix the password still pasted in Settings after a force-stop. With the marker (beb243f): copy, force-stop, Settings paste still gives it (until the next open, SECURITY §9), reopen at 57–61 s, Settings paste gives nothing; probe before and after. On main too |
| D13 | **TAKEN** | pad, vault, item at 360/411/800 dp, light and dark, en, and fr at 411: contact sheets in Pages. Taken from the emulator framebuffer, so no QA capture switch was needed; 800 dp is `wm size` on a phone panel (layout faithful, density not). They showed **"Forgot your PIN?" off screen at 360 dp and under the gesture bar at 411 dp**: fixed on `fix/safezone-pin-reach` (the pad scrolls) |
| D14 | NOT MEASURED | not measurable with our tools |

Two void runs are recorded as void, not as results: a D12 run killed before
the copy finished, and one whose positive control failed.

## H · Branches (2026-11-13)

| Branch | State |
|---|---|
| `feat/safezone-app` | SafeZone itself: **current** |
| `feat/safezone-qa-capture-v2` | the QA-only screenshot switch (`qaCapture.ts`, SECURITY §7), rebased on `feat/safezone-app` 361df40. **Not merged and not needed so far**: the D13 shots came from the emulator framebuffer, which FLAG_SECURE does not reach (G.1) |
| `feat/safezone-qa-capture` | the same switch on the OLDER SafeZone (400e51c): **superseded by v2, kept as it was**. Not force-pushed (a pushed branch is not rewritten), not used |

