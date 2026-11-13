# SafeZone on the phone: the security rules (2026-11-13)

Written **before any SafeZone code** (the supervisor's order, 2026-11-12).
Every rule names the file that enforces it and the test that fails if it
breaks. A rule with no test is listed as such in §9. That list says what this
document does NOT guarantee.

The server contract was read from `multi_magic`
`Api::V1::SafezoneApp::{Passwords,PaymentCards,Identities,Pin}Controller`,
`SafezonePinGuard`, `User::SafezonePin` and the three serializers, on
2026-11-13, on the branch `safezone-hardening` (PR #19, **not merged**).

## 0 · The stance: assume nothing from the server

The deployed server sends **every secret in plaintext in every list**
(password, card number, CVV, card PIN code, document number). `?masked=1` is
only on PR #19, which is not deployed. Even after it ships, an older server or
a rollback would send plaintext again. So:

- **The phone masks.** The list call sends `?masked=1` **and** strips every
  secret field itself before the data leaves `src/api/safezone.ts`. A secret
  never reaches React Query, a store or a component through a list.
- **Secrets live in memory only, for the shortest time.** A secret is fetched
  only when someone taps Reveal or Copy, held in the item screen's own state
  (`useSecretFields`), and wiped on hide, on lock and on unmount.

## 1 · The PIN

| Rule | Where | Test |
|---|---|---|
| The PIN exists only as the six digits being typed, in the keypad's local state, and is cleared the moment it is sent, whether it succeeds or fails | `src/screens/safezone/PinPad.tsx` | `PinPad.test.tsx`: after submit, the dots are empty |
| Never stored: not in SecureStore, not in AsyncStorage, not in zustand, not in the query cache | `src/api/safezone.ts` `unlock()` takes it as an argument and returns only the token | `safezone.api.test.ts`: the mock storage modules are never called |
| Never logged: the http logger prints `method path status` only (`src/api/http.ts:453`); the PIN goes in a POST body, never in a URL | `safezoneApi.unlock` | `safezone.api.test.ts`: the request URL has no digits from the PIN; `console.*` spies stay silent |
| The keypad is a custom pad, not a `TextInput`: no keyboard suggestions, no autofill or keyboard learning, no accessibility value that reads the digits aloud | `PinPad.tsx` | `PinPad.test.tsx`: the label says "3 of 6 digits", never a digit |

## 2 · The unlock token (the server's real gate)

- `POST /pin/unlock {pin}` → `{unlock_token, expires_in: 120}`. It is sent as
  `X-Safezone-Unlock` on every SafeZone request (`SafezonePinGuard`).
- **Memory only**: `src/stores/safezoneLock.store.ts` is a zustand store
  **without** `persist`. A cold start always asks for the PIN. (The web keeps
  it in `sessionStorage`; a phone has no "tab closed", so it gets no storage at
  all.)
- **The expiry is the server's**: `expiresAt = now + expires_in`. The phone
  never extends it on its own; it calls `POST /pin/refresh` on activity once
  the token is past half its life. With no activity it lets the token expire
  and the vault locks.
- **Any `403 safezone_pin_locked` locks the vault at once**, wherever it comes
  from (`lockOnRejection` in the API layer). The server is the authority; the
  phone's clock is only for display.

## 3 · Lock states, and the server's lockout

`safezoneLock.store.ts` holds one of these states: `unknown` → `notEnabled` |
`locked` | `lockedOut(until)` | `unlocked(token, expiresAt)`.

| Server answer | Phone |
|---|---|
| `GET /pin` `{enabled:false}` | "Set a PIN" screen. The vault does NOT open without a PIN, even though the server would allow it (a phone gets lost; a laptop tab does not). Setting one goes through `POST /pin/enable {current_password, pin, pin_confirmation}` |
| `403 wrong_pin {attempts_left}` | the dots shake, then "Wrong PIN. 3 tries left." |
| `423 pin_locked_out {locked_until}` | the keypad is **disabled** until `locked_until`, and a countdown is shown. The phone does not retry and does not count tries itself |
| `429` (15 unlocks / 5 min) | "Too many tries. Wait a minute." The keypad is disabled for 60 s |
| `422 pin_not_enabled` | back to "Set a PIN" |

The keypad never sends a 7th digit and never auto-retries. **The phone keeps
no attempt count of its own**: `attempts_left` and `locked_until` are always
the server's.

## 4 · When the vault locks

`lock()` drops the token **and** tells every open item screen to wipe its
secrets (`lockEpoch` increments; `useSecretFields` clears on change). It runs:

1. **when the app goes to the background** (`AppState` → `background`). On
   `inactive` (the iOS app switcher, Control Centre) a cover hides the screen,
   so the switcher's snapshot shows no secret (`SafeZoneCover`);
2. **when the token expires** with no activity (≤ 120 s, the server's TTL);
3. **on any `safezone_pin_locked`** from the server;
4. **on sign-out** (the auth store's sign-out calls `useSafezoneLock.getState().lock()`);
5. **when the person taps the padlock** in the header.

## 5 · Reveal

- A list row shows **no** secret: `••••••••` for a password, `•••• 4242` for a
  card (the last four, from `card_last4`, or computed and kept by the phone
  when the server is old), `•••• 1234` for a document.
- **Reveal needs a live unlock.** On the item screen, Reveal (hold or tap)
  fetches `GET /<kind>/:id` with the token. If the token has expired, the PIN
  sheet comes back first.
- **Auto-hide after 20 s** (`REVEAL_MS = 20_000`, `src/screens/safezone/reveal.ts`).
  The countdown is visible, and Hide hides at once. When the last revealed
  field hides, the plaintext is dropped from state too.
- **One field at a time**: revealing the CVV hides the card number.

## 6 · Copy, and the clipboard clear

- Copy works without revealing: the secret is fetched, written to the
  clipboard, and dropped from memory at once. "Copied, clears in 30 s".
- **After 30 s the clipboard is cleared** (`CLIPBOARD_CLEAR_MS = 30_000`,
  `src/screens/safezone/clipboard.ts`). The phone writes an empty string
  **only if it still holds what we copied**. On Android, `getStringAsync`
  compares. On iOS, reading the pasteboard shows the system "Allow paste"
  prompt, so on iOS we clear without reading (§9 has the trade-off).
- **The JS timer does not run while the app is in the background.** So on the
  next `active`, any overdue clear runs at once (`clearIfDue`). What the
  person pasted elsewhere in the meantime has already been pasted, and that is
  the point of copying.
- **Lock clears it too**: `lock()` runs the pending clear immediately.

## 7 · Screenshots and recording

- **Android: `FLAG_SECURE`** on every SafeZone screen, through
  `expo-screen-capture` `preventScreenCaptureAsync(key)`. Leaving the screen
  removes it with `allowScreenCaptureAsync(key)`. Screenshots, screen
  recording and the recents thumbnail all go black.
- **iOS**: the same module listens for screenshots and hides the content while
  recording (`addScreenshotListener`, `isCapturedAsync`). iOS cannot block a
  screenshot; it can only know one was taken.
- It is a **native module**: a build without it must still open SafeZone and
  say so. It is required with a literal inside a `try` (as for
  `readAloud.store.ts` and `phoneBook.ts`), and `secureScreen.ts` reports
  `available: false`. **SafeZone is not shippable until a native build that
  includes it has been checked on a device** (§9).

## 8 · Never in the cache, the storage or the logs

| Where | Rule | Test |
|---|---|---|
| React Query | list rows go through `stripSecrets` inside the API function, so the cache holds stripped rows. A detail **never** goes through `useQuery` | `safezone.api.test.ts`: a plaintext server answer comes out with no `password`/`card_number`/`cvv`/`code`/`document_number`; `stripSecrets` is planted out and the test goes red |
| zustand | the lock store holds the token and the state only. No `persist` | `safezoneLock.store.test.ts`: no `persist` key; the token is gone after `lock()` |
| AsyncStorage / SecureStore | not imported anywhere under `src/screens/safezone/`, `src/api/safezone.ts` or the lock store | `safezone.nostorage.test.ts`: a grep of those files |
| logs | `http.ts` logs path + status. SafeZone code has no `console.*` (lint: tests grep) | the same grep |
| assistant echo / search | SafeZone screens never hand a secret to the chat composer or the global search | (structural: no import of those modules from `src/screens/safezone/`) |
| notifications / share sheet | no Share action for a secret, ever | (structural) |

## 9 · What this does NOT guarantee (honest list)

- **A JS process is not a vault.** The plaintext lives in the JS heap until
  the GC collects it. "Dropped from state" means unreachable, not overwritten.
- **iOS clipboard**: no expiration date (`UIPasteboard`'s `expirationDate` and
  `localOnly` are not exposed by `expo-clipboard`). If the app is killed
  before the clear runs, the copy stays. Fixing it needs a native module;
  logged in `docs/MISSING_FEATURES.md`.
- **Android 13+ "sensitive" clip flag** (`ClipDescription.EXTRA_IS_SENSITIVE`,
  which hides the clipboard preview): not exposed by `expo-clipboard` either.
  Same follow-up.
- **iOS screenshots cannot be blocked**, only detected.
- **The unlock token is not bound to the device** (server). A stolen JWT plus
  a stolen unlock token works for at most 120 s.
- **Biometric unlock** (`expo-local-authentication`) is designed in
  SPEC §6, **not built**: it needs a native build, and it can only gate a PIN
  the phone would then have to *keep*. That changes the "never stored" rule
  above, so it waits for the owner's decision.
- **Password autofill at login** (iOS AutoFill credential provider / Android
  Autofill service): noted, not built; a separate native extension.
- **Everything in §7 is unmeasured until a native build is on a device.**

## 10 · Parity with the web

| | Web (`app/javascript/pages/safezone/`) | Phone |
|---|---|---|
| Unlock token storage | `sessionStorage` (survives a reload, per tab) | memory only; a cold start asks again |
| Token refresh | every 60 s while the gate is mounted | on activity, past half-life; idle lets it expire |
| Lists | plaintext secrets in every row | `?masked=1` + stripped on the phone |
| Reveal | the plaintext is already in the page | fetched per item, on demand, auto-hidden after 20 s |
| Clipboard | never cleared | cleared after 30 s, on lock, and when overdue on return |
| Lock on leaving | no (tab stays unlocked until the token expires) | on background, at once |
| Screenshots | n/a | `FLAG_SECURE` (Android), detection (iOS) |
| No PIN set | vault open | vault refuses to open; "Set a PIN" |
| Lockout | shown | shown, keypad disabled until `locked_until` |
| Delete | hard delete, confirm | hard delete, confirm naming the item; no undo (there is no trash) |
