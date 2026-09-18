# Building a real install (iOS and Android)

Builds run on EAS (Expo's cloud) under the Expo account `hama990`, project
`@hama990/multimagic-mobile` (id in `app.json` → `extra.eas.projectId`).
iOS cannot be built on this Linux box at all; Android can, but EAS is the
one path that works for both, so use it for both.

## Profiles (`eas.json`)

| profile      | what it is                                        | API                          |
|--------------|---------------------------------------------------|------------------------------|
| `development`| dev client for Metro; installs on registered devices | whatever Metro serves      |
| `preview`    | **installable build against production** — ad-hoc iOS, APK Android | `https://www.multimagics.com` |
| `production` | store builds, auto-incremented                    | `https://www.multimagics.com` |

`EXPO_PUBLIC_API_URL` is the **host only** — the app appends `/api/v1`,
`/users/login` and derives the socket as `wss://www.multimagics.com/cable`
(the same value the web client is built with, `VITE_MULTI_MAGIC_WEBSOCKET_DOMAIN`
in multi_magic's `.env.production`). A release build refuses to start without
it (`src/config/env.ts`), so a profile without `env` produces an app that
will not open. Keep it in the profile.

## iOS, first time on a new bundle id — needs Hamma9900 at a terminal

The bundle id is `com.multimagics.mobile`. Apple team `57DRRU3SP7`
(Individual). One iPhone is already registered on the team (from Hatiwal's
internal build); `eas device:list --apple-team-id 57DRRU3SP7` shows it, and
`eas device:create` registers another.

Creating the ad-hoc provisioning profile requires an Apple sign-in with
2FA, which no session can do for him and no script should. Once, in his own
terminal:

    cd ~/Apps/Personal/multi_magic_mobile
    eas build -p ios --profile preview

It asks, in order: log in to Apple (yes) → Apple ID, password, 2FA code →
distribution certificate (reuse the existing one) → generate provisioning
profile (yes) → devices for the ad-hoc build (his iPhone) → push
notifications (no — the app has none). Then it uploads and prints a build
link; the terminal can be closed. The build takes ~15 minutes; the install
link and QR are on that page, opened from the iPhone.

After that first run the credentials live on Expo's servers and every
later build is non-interactive:

    eas build -p ios --profile preview --non-interactive --no-wait

## Android

    eas build -p android --profile preview --non-interactive --no-wait

produces an APK (`buildType: apk`) installable from the build page. The
Android package is still `co.byseven.multimagic`; align it with the iOS id
the next time `android/` is regenerated (`npx expo prebuild --clean`), not
before — the QA rig's dev build is installed under the old name.

## Things that look like errors and are not

- `ITSAppUsesNonExemptEncryption` is set `false` in `app.json`: the app uses
  only HTTPS, which Apple exempts. Without it App Store Connect blocks
  TestFlight until answered by hand.
- "No remote versions configured, buildNumber initialized to 1" — first
  build only. `appVersionSource: remote` means EAS owns the number from then on.
- eas-cli nags to upgrade on every run. It proceeds anyway.
