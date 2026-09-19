# Profile — who you are, your password, and your own AI key

**Status: `IN PROGRESS`** — nine references pulled and read, 2026-09-18.

His instruction, 18 Sept: *"you should have a well user edit — you can change
the password, you can change the information about user, you can change the
photo, this kind of thing should work also. Do not forget for profile page,
it's important. For more information like they can visit to web, but I think
password change it's important, and profile edit."* And then: *"that's great
you have show how to add the key, this is great."*

So: **photo · details · password · your own API key**, and a way out to the web
for everything else. Not a settings app — the four things he named.

---

## §0 · TWO TRAPS IN THE API, AND ONE BUG THIS SCREEN UNCOVERED

### 0.1 · Changing the email BREAKS THE SOCKET, and it is silent

`ApplicationCable::Connection#find_verified_user` is
`User.find_by(email: request.params[:email])` — the socket identifies the user
**by the email in its query string** (`connection.rb`), and `src/api/http.ts`
stores that address under `mm-auth-email` precisely because "a socket URL
without the address is rejected even with a perfectly good JWT".

`email` is in `user_params` (`users_controller.rb:177`), and `User`'s devise
modules do **not** include `:confirmable` — so an email change takes effect
immediately. The stored address is then stale, `find_by` returns nil, and **the
cable is rejected on the next reconnect**. Messages stop arriving, with nothing
on screen to say why, and only a sign-out and sign-in fixes it.

**So this screen does not offer email editing in v1.** The field renders,
read-only, with the reason under it — Waking Up locks the same field, so there
is even a precedent for the shape. Making it editable means calling
`setSessionEmail` in the same breath and re-testing the socket, and that is a
change to the auth layer rather than a field on a form.

### 0.2 · A WRONG PASSWORD HERE MUST NOT SIGN YOU OUT

`users_controller.rb` answers a wrong `current_password` with **422, not 401**,
and says why in its own comment:

> *"422, not 401: a typo in the current password is a validation failure. The
> client treats every 401 as an expired session and signs the user out."*

That is exactly what this client does — `http.ts`'s interceptor clears the token
and calls `forceSignOut` on any 401. The server has already protected us; the
client's job is not to undo it by treating the 422 as a generic failure. The
screen shows *"That password is not right"* against the field and nothing else
happens.

### 0.3 · THE BUG THIS UNCOVERED: the app never loads the user on a restored session

`app/_layout.tsx` restores the token and sets `status: "signedIn"` — and **never
fetches the user**. `useAuthStore.user` is populated only by `signIn`, so after
a cold start with a saved token it is `null`.

The consequence is not cosmetic. `app/chat.tsx` guards its "which session was I
last in" restore on `user?.id`:

```ts
useEffect(() => { if (!user?.id) return; void loadRememberedSession(user.id)… })
```

So **on every cold start the remembered session is silently not restored**, and
the app falls back to the server's cross-device default — the exact behaviour
that file's own comment says it exists to prevent.

`GET /api/v1/users/connected_user` is the missing call. **It is in the other
session's files (`_layout.tsx`, `auth.store.ts`), so this is reported rather
than taken** — and `src/api/profile.ts` fetches it independently, so this screen
works either way.

## §1 · Sources — nine screens

### The profile form

| App | Reference | What we TAKE | What we REJECT |
|---|---|---|---|
| **TheFork** — [personal details](https://mobbin.com/screens/7f0c268d-67b5-4e37-841a-c5e1cf9c7e89) | **the photo sheet — "Choose image from library" / "Take a photo"** — and **`Change Password` as a ROW inside the form**, which is exactly how a separate screen should be reached from here | the country-code picker and date-of-birth wheel; two fields he did not ask for |
| **Venmo** — [edit profile](https://mobbin.com/screens/9c83928e-daab-4f3a-b0a6-91dbd038db1a) | **Save at the bottom, DISABLED until something changes** — and one line of helper text saying what the name is for | the floating labels |
| **Zesty** — [edit profile](https://mobbin.com/screens/9ccbe850-8ffc-40a0-ba71-f0ccab7c4ac3) | **a dark form that reads**, and a **remove badge on the avatar** — we have `destroy_avatar`, so removing is a real action and not a hidden one | "Username — others can find and tag you"; there is nobody to be found by here |
| **Waking Up** — [profile](https://mobbin.com/screens/d183b60f-49e2-43fc-877c-c951c9cff971) | **the email field rendered but LOCKED**, which is §0.1's shape and a precedent for it | Save in the top right (§2.1) |
| **5 Minute Journal** — [personalization](https://mobbin.com/screens/9b786a9f-8837-473a-a486-6c9877e9df99) | "Update profile photo" as a **text link under the avatar** — a 44 dp target where a pencil badge is about 20 | the left-labelled table rows, which cramp at 360 dp |

### Changing the password

| App | Reference | What we TAKE | What we REJECT |
|---|---|---|---|
| **Kraken** — [change password](https://mobbin.com/screens/65d5a8c7-9e59-4565-b8ea-5cd8ca8f9be1) | **three fields: current, new, retype** (§2.2) | the gradient button |
| **Centr** — [change password](https://mobbin.com/screens/4c5a070e-6543-4bc9-bd66-bf6e3f2d5315) | **an eye toggle on every field** — five of six references have one, and it is the only defence against a typo you cannot see | only two fields |
| **My BMW** — [profile data](https://mobbin.com/screens/fa4109cc-b477-4af9-aa47-c0ec5143fb02) | — | **a live five-rule checklist with a 5/5 progress bar.** See §2.3 |
| **Origin** — [change password](https://mobbin.com/screens/84fcfb1a-b527-47fa-a703-7e575f0b11e9) | — | the same five rules, static |

## §2 · The disagreements, and how we resolved them

### 2.1 · Save at the bottom, disabled until dirty

Waking Up and Polarsteps put Save in the top bar; Venmo, Zesty, 5 Minute Journal
and TheFork put it at the bottom, full width. **Four to two for the bottom**, and
the tiebreak is the thumb: a top-right target on a 360 dp phone is the hardest
place on the screen to reach one-handed, and this form is filled one-handed.

**Disabled until something actually changed** is unanimous among the four that
show a state, and it does real work here: it is what tells you the screen
noticed your edit.

### 2.2 · Three fields, not two — and the argument is the server's

Kraken, Cherrypick and Origin ask for a confirmation; Centr, Honest Greens and
My BMW do not. **Three all.**

We take the confirmation, because of what is behind it: `change_password` passes
`password_confirmation` to `@user.update`, so the server will actually check it.
And the failure mode decides it — **a typo in a new password with no confirm
field locks you out of your own account, and you cannot discover the typo,
because you never saw either copy.** A second field costs one line.

### 2.3 · NO RULE CHECKLIST — because we would be inventing the rules

My BMW ticks five rules live; Origin lists them. Both look reassuring and both
would be **wrong here**: `config/initializers/devise.rb:185` is
`config.password_length = 6..128` and that is the **only** rule this server
enforces. No uppercase requirement, no digit, no special character.

Rendering those five would reject passwords the server would happily accept —
a client inventing a policy the backend does not have. **So one line states the
one real rule**, and it is the honest version of the same reassurance.

### 2.4 · The key is added, replaced and removed — and nothing else

`ai_keys` also offers **lending a key to somebody by email** and shows keys
borrowed from others (`routes.rb:364-365`, `Ai::KeySharing`). That is a second
product — an invitation flow, a revocation flow and a "whose spend is this"
question — and it is the same shape as the group-administration decision in
`../people-chat/SPEC.md` §2.3.

**In v1: list, add, replace, remove, choose which is active.** `borrowed` is
parsed and rendered as a read-only line when it is not empty, because being told
you are running on somebody else's key is not optional information.

**And the verification is the feature.** `Ai::Keys.verify` puts the key to the
provider *before* storing it, and "nothing is written when the provider
refuses". So a bad paste comes back with **the provider's own wording**, not
ours — which means the screen must render the server's message rather than
replacing it with "Something went wrong".

## §3 · Our decisions

- **The providers list comes from the server.** `payload` returns
  `providers: Ai::Keys.offered` on every action — including mutations, and the
  controller's comment records why that had to be fixed once already: "adding a
  key replaced the cached payload with one that had no provider list… the whole
  section went blank on first use." So the client never hardcodes a provider
  name, and never caches a mutation's response into a shape that lacks one.
- **The key is never shown, and the screen must not imply otherwise.** It is
  write-only over HTTP by construction; what comes back is `masked` and
  `last_four`. The row shows the mask and a Replace action — never an "edit"
  affordance on a field that could not be prefilled.
- **The photo goes up as multipart `user[photo]`** through `PATCH /users/:id`,
  the same route as the rest of the form — `photo` is in `user_params`. Removing
  it is `DELETE /users/:id/destroy_avatar?image_type_name=photo`, which is a
  real endpoint and therefore a real button, not a hidden one.
- **"More on the web" is one row at the bottom**, his own instruction — and it
  says what is there rather than "Settings", because a link that does not say
  where it goes is a link people do not press.
- **Nothing here is cached into the auth store.** This screen reads
  `connected_user` itself (§0.3). When the restored-session bug is fixed in the
  auth layer, this screen keeps working unchanged.

## §4 · How we code it

| Thing | Where |
|---|---|
| `app/profile.tsx` | photo · name · locked email · rows to password and keys |
| `app/change-password.tsx` | three fields, eye toggles, the one real rule |
| `app/ai-keys.tsx` | the list, add, replace, remove, activate |
| `src/api/profile.ts` | `me · update · uploadPhoto · removePhoto · changePassword` |
| `src/api/aiKeys.ts` | `list · add · replace · activate · remove` |
| `src/screens/account/PhotoSheet.tsx` | library · camera · remove |
| colour | `accent` for Save; `danger` for remove; `inkMuted` for the locked field |

## §5 · Evidence required before `DONE`

1. `ours/` at 360, 411, 800 dp, dark and light — all three screens.
2. **A wrong current password showing an inline error and NOT signing the user
   out** — §0.2, and the one behaviour here that a unit test can only half
   prove.
3. A photo taken on the device, uploaded, and surviving a restart.
4. A deliberately bad API key, showing **the provider's own refusal**.
5. `npx tsc --noEmit`, eslint, and the API tests for both modules.

---

### Divergence note — 2026-09-19, the first walk of this file

- **§0.3 is fixed, and by this repo rather than reported onward.** The root
  layout now calls `connected_user` after restoring a token
  (`app/_layout.tsx:76-99`), deliberately *after* the splash and not awaited —
  blocking on a request would hold a blank screen for up to the 15 s timeout to
  learn something every screen can do without. So `useAuthStore.user` is
  populated on a cold start, `app/chat.tsx`'s remembered-session restore fires,
  and the app stops silently falling back to the server's cross-device default.
  The same call carries `lang`, which is what makes a language chosen on the
  laptop reach the phone.
- **§0.2 had a SECOND instance, and the server did not protect this one.** The
  rule here — *a wrong password must not sign you out* — is stated against
  `change_password`, which the server defends by answering **422**. Account
  deletion re-sends the password too (`account.ts`, and for the same reason:
  a valid token is not evidence the owner is holding the phone), but a wrong
  one there is a **401 on a request that also carried a good token**. The
  interceptor's guard exempted only requests with no token at all, so a typo on
  the most consequential screen in the app cleared the session, navigated to
  sign-in, and said *"your session expired"* — which was false, and which hid
  the real reason, because the screen's own *"that password is not right"* was
  set on a view being replaced as it set it.

  Fixed in `src/api/http.ts`: a 401 ends a session only when the request
  carried a token **and did not carry a password**. The rule is about the
  request rather than the endpoint — a request that re-authenticates is asking
  about that password, so the answer is about that password — and if the
  session really had ended too, the next request, which carries no password,
  says so properly. Two tests, one of them asserting that a 401 on the *same*
  route without a password still signs you out.

  **Not device-verified.** That `DELETE /api/v1/users/me` answers 401 rather
  than 422 for a wrong password is taken from `account.ts`'s own design and
  from what the screen does with it, not from a live call — nothing here may be
  run against his account. The change is safe either way: if the server answers
  422 the guard never fires.
- **§5 is still open**, and all of it needs a device: the three screens at three
  widths in both schemes, a photo taken and surviving a restart, and a
  deliberately bad API key showing the provider's own refusal. Only §5.2 has a
  test, and only its API half (`src/api/__tests__/profile.test.ts`).

## Dismissal — the scrim closes, the sheet does not

Tapping the dark area **outside** the photo sheet closes it. Tapping the sheet itself,
including its padding and any gap between rows, does **nothing**.

Unchanged on 2026-09-19, when the scrim was restructured: this sheet already
behaved this way, by way of an inner Pressable that swallowed the tap. That
Pressable is gone and the behaviour is the same, now as a consequence of the
layout rather than of a handler.

**And the scrim is a SIBLING of the sheet, never its parent** (`PhotoSheet.tsx`). This is
not a layout preference: a named accessibility element groups its children, so a
`Pressable` labelled "Close" wrapping the content made the whole modal announce
as one "Close" button with every row inside it unreachable — on iOS, absolutely.
`docs/ACCESSIBILITY.md` N1, and `src/__tests__/a11y.test.tsx` fails if any
container with a name acquires a control inside it again.
