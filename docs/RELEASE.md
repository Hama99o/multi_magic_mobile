# Building a real install (iOS and Android)

Builds run on EAS (Expo's cloud) under the Expo account `hama990`, project
`@hama990/multimagic-mobile` (id in `app.json` → `extra.eas.projectId`).
iOS cannot be built on this Linux box at all; Android can, but EAS is the
one path that works for both, so use it for both.

**Build through `./scripts/eas-build.sh`, never `eas build` directly**
(2026-09-25). It runs `scripts/release_guard.js` on this machine first and
stops before any upload if the tree cannot make a release (SDK below 57, or a
native dependency missing). The same guard is the `eas-build-pre-install`
hook, which is unverified as a stop; this wrapper is the certain one.

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

## iOS, first time on a new bundle id

> ~~**needs Hamma9900 at a terminal**~~ — **struck 2026-09-21, not deleted.**
> This heading said the first build on a new bundle id required him in person
> for Apple's 2FA. That is true of the path `eas build` takes by default and
> **not** true of the build as a whole: the first production build of
> `com.multimagics.mobile` went out non-interactively, with no Apple ID and no
> code from his phone. `docs/APP_STORE_CONNECT.md` §2 has how, in commands.
>
> The sentence stays struck rather than removed because somebody who read it
> once will come back to it and find it unchanged. That exact shape cost a day
> here already — a correction that lived in the register while the false line
> stayed in the file people actually open.

The interactive path below still works and is still the shortest route if you
have the phone in your hand. It is no longer the only one.

The bundle id is `com.multimagics.mobile`. Apple team `57DRRU3SP7`
(Individual). One iPhone is already registered on the team (from Hatiwal's
internal build); `eas device:list --apple-team-id 57DRRU3SP7` shows it, and
`eas device:create` registers another.

Creating the ad-hoc provisioning profile requires an Apple sign-in with
2FA, which no session can do for him and no script should. Once, in his own
terminal:

    cd ~/Apps/Personal/multi_magic_mobile
    ./scripts/eas-build.sh -p ios --profile preview

It asks, in order: log in to Apple (yes) → Apple ID, password, 2FA code →
distribution certificate (reuse the existing one) → generate provisioning
profile (yes) → devices for the ad-hoc build (his iPhone) → push
notifications (no — the app has none). Then it uploads and prints a build
link; the terminal can be closed. The build takes ~15 minutes; the install
link and QR are on that page, opened from the iPhone.

After that first run the credentials live on Expo's servers and every
later build is non-interactive:

    ./scripts/eas-build.sh -p ios --profile preview --non-interactive --no-wait

## Android

    ./scripts/eas-build.sh -p android --profile preview --non-interactive --no-wait

produces an APK (`buildType: apk`) installable from the build page. The
Android package is still `co.byseven.multimagic`; align it with the iOS id
the next time `android/` is regenerated (`npx expo prebuild --clean`), not
before — the QA rig's dev build is installed under the old name.

## Can a release Android build actually be produced today? — read, not run

Asked 2026-09-21. **No build was run**: 15–25 minutes, about 8 GB, and the box
is at 95 % disk on a battery that died the night before. Everything below is
read from `app.json`, `eas.json`, `package.json` and the branch, and anything
that cannot be read from here says so.

**The only Android artefact anybody here has ever produced is the debug dev
build the rig installs.** Neither the `preview` nor the `production` profile
has ever run **for Android**. *(2026-09-25: iOS production HAS run: a
non-interactive build on 2026-09-21, then build 3 submitted;
`APP_STORE_CONNECT.md` §2.)*

### What is already in place

- **The EAS project is linked** — `owner: hama990`,
  `extra.eas.projectId 6aae9901-e7f6-462f-96c1-da7d5ebe3e88`.
- **Both profiles exist and are coherent** — `preview` produces an APK,
  `production` an AAB, both pinned to node 22.19.0, both with
  `EXPO_PUBLIC_API_URL=https://www.multimagics.com`.
- **Versioning is EAS-owned** — `appVersionSource: remote` with
  `autoIncrement` on production, so `versionCode` is not this repo's problem.
- **That production URL is HTTPS**, which answers a question left open in
  `docs/store/LISTING.md` §7: the Play data-safety "encrypted in transit"
  answer is **yes**.

### Two decisions that are permanent, and one of them is wrong today

**1. The Android package name and the iOS bundle id disagree.**

    android.package        co.byseven.multimagic
    ios.bundleIdentifier   com.multimagics.mobile

`RELEASE.md` above says to align them "the next time `android/` is
regenerated, not before", which was right while the only consumer was the
rig's dev build. **It stops being right at the first release build**, because
**an Android package name is permanent once Play has accepted an upload**.
Changing it afterwards is a new listing, a new install base, and no upgrade
path for anybody who installed the first one.

So this is a decision for **before** the first production build, not after,
and it is his: ship as `co.byseven.multimagic`, or realign to
`com.multimagics.mobile` and prebuild clean. **Whichever he picks, the rig's
installed dev build breaks** — which is already true of the rebuild, so the
cheapest moment is the same moment.

**2. Signing.** The repo has `android/app/debug.keystore` and nothing else. A
debug key cannot sign a Play upload. EAS can generate and hold the release
keystore, and that is the normal path — but **it needs his Expo account, and
once Play has accepted a key every future update must be signed by the same
one.** Nobody here can create that on his behalf, and nobody should.

### What a release build needs that this repo does not have

| Needed | State | Whose |
|---|---|---|
| Release keystore | does not exist; only a debug key | **his** — EAS generates on first build, under his account |
| Expo account session | not present in this environment | **his** |
| Package-name decision | two names disagree, permanent after publish. **By branch, checked 2026-09-24:** `main` and the merge base say `co.byseven.multimagic`; `sdk-57` says `com.multimagics.mobile`, and the `e085289` merge kept `sdk-57`'s. Nobody has picked; the merge did not decide it | **his**, before the first build |
| Splash in a BUILD | **STALE 2026-09-25:** the plugin block IS committed on `sdk-57` (light `#F7F9F9`, dark `#102125`), and the three top-level `splash` keys the merge brought in, which SDK 57's schema rejects, were removed in `79000c0`. Originally: the light splash with a `dark` variant (`97b0c5c`) is in `main`'s top-level `splash`, `ios.splash` and `android.splash`, which is what **Expo Go** reads. A **build** reads the `expo-splash-screen` **plugin** entry, and that entry exists only on `sdk-57`, where it was `#102125`, dark, unconditional: a build would bring back the unreadable dark-on-dark launch screen. Hamma9901 gave it the same light + `dark` config on 2026-09-24, **UNCOMMITTED** beside the owner removal (`OWNER_REMOVED_FOR_PHONE.md` forbids committing `app.json` there). **Before any build from `sdk-57`: commit that plugin block** (light `#F7F9F9`, `dark` `#102125`), or the fix is lost with the working copy | whoever lands `sdk-57` |
| Plugin entries only `sdk-57` has | `expo-splash-screen`, `expo-audio`, `expo-font`, `expo-image`, `expo-status-bar`, `expo-asset`; kept by the merge, not in `main` | checked at the SDK 57 landing |
| `edgeToEdgeEnabled` removed | still in `main`'s `app.json`; **already removed on `sdk-57`** | done on the branch |
| `extra.apiUrl` / `extra.wsUrl` | **DONE 2026-09-25**, both branches. They were never live: `fromExtra` accepts only a non-empty string | done |
| `RECORD_AUDIO` declared once | **DONE 2026-09-25**, both branches (`sdk-57` `79000c0`) | done |

### Build from `sdk-57`, not from `main`

**Enforced 2026-09-25:** an EAS build from `main` refuses in its
`eas-build-pre-install` hook (`scripts/release_guard.js`): SDK 54, and no
`expo-asset`, which `expo-audio` needs outside Expo Go. That the hook's
non-zero exit fails the build is not stated in Expo's docs and has not been
seen yet.

`main`'s `app.json` still carries `android.edgeToEdgeEnabled`, which SDK 57
removed from the schema. The branch has already dropped it. So a release build
attempted from `main` after the bump is building a config the schema no longer
accepts — **the two disagree about whether the file is even valid**, and the
branch is the correct side.

### What cannot be read from here

**The permissions the manifest will actually declare.** `expo-image-picker` is
not in the `plugins` array, so on Android its camera and media-read permissions
arrive from the library's own manifest at merge time. `STORE_READINESS` §9 says
this and it is still true: **only a built manifest shows it.** Whoever runs the
first build should read the merged `AndroidManifest.xml` and check that nothing
asks for a permission the app no longer uses — particularly since
`expo-speech-recognition` moves **3.1.3 → 57.1.0** across the bump, which is
not a minor and may well change what it declares.

**And whether `expo-dev-client` reaches a release binary.** It sits in
`dependencies` rather than `devDependencies`. That is the conventional Expo
arrangement and the dev launcher is normally excluded from release builds by
its own plugin — but *normally* is not *verified*, and the first release APK is
where to check it rather than assume it.

### Cost

**EAS cloud build** (the documented path): no local disk, no local CPU, roughly
10–20 minutes including queue. This is the one to use while the box is at 95 %.

**Local `gradlew assembleRelease`**: 15–25 minutes on a cold SDK 57 cache,
about 8 GB, and it needs the keystore to exist locally. Against 24 GB free,
that fits once. It is the wrong choice today.

**Neither was run.**

---

## Things that look like errors and are not

- `ITSAppUsesNonExemptEncryption` is set `false` in `app.json`: the app uses
  only HTTPS, which Apple exempts. Without it App Store Connect blocks
  TestFlight until answered by hand.
- "No remote versions configured, buildNumber initialized to 1" — first
  build only. `appVersionSource: remote` means EAS owns the number from then on.
- eas-cli nags to upgrade on every run. It proceeds anyway.
