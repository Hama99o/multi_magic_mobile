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
| 5 | Change password (ChangePassword) | present (min 6) | **unchanged at 6**: `src/api/profile.ts` documents 6 as the server's only rule (devise 6..128) and a deliberate SPEC §2.3 decision; the web's 8 is stricter than its own server. Owner decision |
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
- **New-password minimum:** mobile keeps 6, the server's rule, by the existing SPEC §2.3 decision; the web asks for 8. Which one is right is the owner's call.
