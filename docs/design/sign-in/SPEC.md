# Sign in — email and password, and nothing else

**Status: `SPECIFIED`** · `POST /users/login` · references pulled 2026-09-18

## What it is not

Not phone-and-OTP (that is Karwan). Not social sign-in — MultiMagic has none.
**Not a two-factor screen**: his account has `two_factor_enabled? == false`,
verified against the database rather than assumed. But the server *can* answer
**202** with a `pre_auth_token` if that ever changes, so the **API layer
recognises that response and says so out loud** — *"this account needs a code,
which this app cannot do yet"* — instead of hanging on a 202 it never expected.
Ten lines, no screen.

## Sources

| App | Reference | What we TAKE | What we REJECT |
|---|---|---|---|
| **Preply** — [sign in](https://mobbin.com/screens/a21cc4df-486a-4254-89f5-d39fe88d9928) `references/preply-email-password-eye.webp` | the whole shape: title, **Email** and **Password** labelled above their fields, an **eye** in the password field, one filled primary, **Forgot your password?** centred under it. An `✕` clears the email | the pink |
| **GoPro Quik** — [sign in](https://mobbin.com/screens/215a9f3e-2250-44f3-bf93-4483dff7e8f2) `references/gopro-sign-in-with-email.webp` | the button says **what it does** — *Sign in with email* — which matters when it is the only method | required-field asterisks; everything here is required |
| **Upside** — [sign in](https://mobbin.com/screens/93357243-748b-429d-8276-99798dfc8488) `references/upside-create-account-link.webp` | **the focused field gets a coloured border**, and *"New to X? Create an account"* sits above the button | account creation itself — see below |

**The decision where they differ:** the primary button is **enabled from the
start and validates on press**, rather than staying disabled until the fields
look right. A disabled button with no explanation is the commonest reason
someone thinks a login is broken, and email validity is not something to be
strict about before the server has had its say.

## Our decisions

- **Create an account: IN.** His instruction, 18 Sept — *"create account should
  also work."* **`POST /users/signup`** (`registrations#create`), confirmed
  against `bin/rails routes`. It takes `user: { firstname, lastname, email,
  password, password_confirmation, agreed_to_terms }` — **one word, no
  underscore**, which is also how `UserSerializer` spells them coming back
  (`user_serializer.rb:62-72`). Reading `first_name` returns null silently. Upside's *"New to X? Create an account"* above the
  button is the placement we take. Its own screen, not a toggle on this one — a
  form that changes what its fields mean under the same title is the commonest
  way people submit the wrong one.
- **Forgot password: IN, in the app.** Also his instruction.

  **CORRECTED 2026-09-18, after running `bin/rails routes | grep password` as
  this spec asked.** The guess was wrong in the way it warned it might be:
  `resources :passwords` at `routes.rb:16` is **SafeZone's password VAULT** —
  it resolves to `/api/v1/safezone_app/passwords` and has nothing to do with
  signing in. Wiring a reset screen to it would have posted the user's email
  address into their own encrypted password store.

  The real endpoints:

  | | |
  |---|---|
  | Ask for a link | **`PUT /api/v1/users/reset_password`** — note the verb |
  | Set the new password | `PUT /api/v1/users/reset_password_confirmation` (`token` + `password`) |

  Two screens: ask for the email, then *"we sent you a link"*. **The success
  screen must not say whether the address was known** — an app that
  distinguishes them tells a stranger which emails have accounts.

  **And the server already guarantees this, so the screen only has to not undo
  it:** `users_controller.rb:72-76` is `user&.reset_password!` followed by
  `head :ok` — a safe-navigation call and an unconditional 200. There is no
  branch to leak even if the screen wanted one.

  The confirmation screen is **NOT in v1**: the reset link opens the web app,
  which already has that form. Deep-linking it into the phone would mean
  handling a `reset_password_token` in a URL scheme for a screen the user
  reaches once.
- **`POST /users/login` is rate-limited 10 per 3 minutes.** On 429 the screen
  says *"too many attempts — try again in a few minutes"*, never *"wrong
  password"*, which is both wrong and the more alarming of the two.
- **The device fingerprint is created here if absent**, stored in SecureStore,
  and **sent on every request afterwards**. Getting it wrong does not produce a
  401 — it produces every request being treated as a stolen token
  (`user/jwt_dispatch.rb:27-39`), which is why it belongs in the spine and under
  test before any screen.
- **The password field never shows a strength meter** and the email is never
  "checked" before submission. This is a login, not a registration.

## How we code it

`expo-secure-store` for the token and the fingerprint. One axios interceptor
adds `X-Device-Fingerprint`; a second maps 401 to a single sign-out path so a
revoked token cannot leave the app half-authenticated. Fields from
`components/reusables/input.tsx`; the primary from `button.tsx`; colours from
the `IDENTITY.md` tokens. 360 / 411 / 800 dp, and at 800 the form takes a max
width and centres rather than stretching to a 700 dp line.
