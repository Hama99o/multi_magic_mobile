# What a reviewer will find, before they find it

The half of "ready to deploy" that lives in the code, read against what the
two stores actually reject for. **No configuration is changed here** — every
fix below is an edit to `app.json` or `eas.json`, and those belong with the
SDK 57 rebuild rather than with a branch that is waiting to merge.

Findings, each with its fix and what it costs. The device half — icons,
listing screenshots, declarations in the console — was e0's. **e0 is closed**;
the screenshots and icons are picked up in `docs/store/README.md`
(2026-09-25), and the console declarations are Hamma9900's.

**Status re-read against the tree, 2026-09-25**, before trusting any line
below:
- **§1 FIXED**: `ios.requireFullScreen: true` is in `app.json`.
- **§2 OPEN**: no `NSAllowsLocalNetworking` anywhere; dev builds only.
- **§3 FIXED**: approved, and the banner came off in `362279c`
  (`PRIVACY_IS_DRAFT = false`).
- **§4 FIXED**: the speech string now says Apple may process the audio.
- **§5 OPEN**: `RECORD_AUDIO` is still declared twice.
- **§6** still correct; leave it.
- **§8 OPEN**: `extra.apiUrl` and `extra.wsUrl` are still `{}`.
- **§9 MOVED**: iOS submission is now wired (`ascAppId`, `appleTeamId`);
  Android still is not, and the merged manifest still needs a rebuild to
  read.

---

## 1 · `supportsTablet: true` on a portrait-only app, with no `requireFullScreen`

`app.json` declares `orientation: "portrait"` and `ios.supportsTablet: true`,
and does **not** set `ios.requireFullScreen`.

**What that means on an iPad.** An app that supports tablet and does not
require full screen must work in Slide Over and Split View. In those modes
**`orientation` is not honoured** — iPadOS gives the app whatever width the
split is, in whatever device orientation the reviewer is holding. So the
portrait declaration, which is true everywhere else, quietly stops applying on
the one device where the layout has never been looked at.

**What it costs.** A reviewer opening the app on an iPad and dragging it into
Split View is a routine check. `maxMeasure` means the content centres rather
than stretching, so this is more likely to look odd than to crash — but "odd
on iPad" is a rejection reason on its own, and nobody here has seen it.

**Fix, and it is a choice.** `ios.requireFullScreen: true` keeps portrait,
opts out of multitasking, and is honest about what has been tested. Or
`supportsTablet: false` and ship phone-only. Either is one line. What is not
available is leaving it as it is and calling the app portrait.

---

## 2 · A LAN dev build needs an ATS exception, and the wrong one gets asked about

There is no `NSAppTransportSecurity` in `infoPlist` today, which is **correct
for release**: `EXPO_PUBLIC_API_URL` is `https://www.multimagics.com` in both
the preview and production profiles, so ATS has nothing to complain about.

The problem is the development profile. A dev build pointed at a laptop over
the LAN talks to `http://192.168.x.x:3001`, and iOS blocks cleartext by
default — the symptom is a request that never arrives, with no error a person
would connect to ATS.

**Fix: `NSAllowsLocalNetworking: true`, never `NSAllowsArbitraryLoads`.** The
first permits cleartext to local addresses only and is **exempt from the
justification Apple asks for**; the second is a blanket opt-out that triggers a
question at review and is the wrong answer to it. And it must be scoped to the
development build rather than sitting in the shared `app.json` — an
`app.config.js` reading the profile, or a plugin applied only to that profile.

**What it costs if ignored:** not a rejection, but every LAN dev build on iOS
appears to have no network, which is a day of somebody debugging the backend.

---

## 3 · The privacy policy a reviewer opens says "Draft — not yet approved"

`app/privacy.tsx` renders a banner when `PRIVACY_IS_DRAFT`, read from the
document's own title line, and it is currently **true**. The screen is
reachable from `account-privacy`, which is two taps from anywhere.

**What it costs.** Both stores require a privacy policy, and both have
reviewers who open the one inside the app. A policy that announces it is not
approved is worse than a link to an external page, because it reads as an app
shipped before its own legal text was finished — which is exactly what it is.

**Fix: not a code change.** The document needs Hamma9900's approval and the
title line updated; the banner then disappears by itself, which is the right
mechanism and is already built. **This is a blocker owned by him, not by
anybody here**, and it is the one on this list that cannot be fixed by
engineering.

---

## 4 · A permission string promises something the code does not do

`NSSpeechRecognitionUsageDescription` reads: *"Speech recognition turns what
you say into text **on this device**."*

`useSpeechToText.ts:285` calls `ExpoSpeechRecognitionModule.start({ lang,
interimResults: true, continuous: true })` — and does **not** pass
`requiresOnDeviceRecognition: true`. Without it, iOS may send audio to Apple's
servers. `docs/design/chat/SPEC.md` already says the equivalent about Android:
*"the recogniser usually streams audio to Google, exactly as Chrome's does."*

So the app knows the audio may leave the device, says so in one document, and
tells the user the opposite in the sentence they actually read.

**What it costs.** This is the finding I would fix first regardless of stores.
A usage string is a promise made at the moment somebody decides; a false one is
not a review risk so much as the thing the review process exists to catch.

**Fix, two options and they are not equivalent.** Pass
`requiresOnDeviceRecognition: true` and make the sentence true — at the cost of
worse recognition and no support on older hardware, which then needs the
"cannot work right now" path the composer already has. Or change the sentence
to say where the audio goes. **Decide it as a product question**; do not make
the string vaguer to close the gap.

---

## 5 · `RECORD_AUDIO` is declared twice, in two spellings

`android.permissions` contains both `"RECORD_AUDIO"` and
`"android.permission.RECORD_AUDIO"`. They are the same permission; Expo
normalises the short form. Harmless, and worth removing because a duplicated
permission in a manifest is the kind of thing that makes a reviewer look
harder at the rest of the list.

**Fix:** keep one. Keep the fully-qualified one.

---

## 6 · The encryption declaration is present and correct — do not flip it

`ITSAppUsesNonExemptEncryption: false`. Recorded here so nobody changes it
under pressure at submission time without the reasoning.

It is accurate: the app's only cryptography is **HTTPS** (exempt), the
platform keychain via `expo-secure-store` (exempt), and `expo-crypto`'s
`randomUUID`, which is not encryption at all. There is no bundled cipher, no
key exchange of our own, and nothing that would make the export declaration
apply.

**No fix needed.** The risk here is someone setting it to `true` "to be safe",
which converts a non-question into an export-compliance workflow.

---

## 7 · A cold start with no network — this one is a strength, and it was not free

Reviewers test in airplane mode. This app behaves:

`app/_layout.tsx` restores the token, sets `ready`, and fetches
`connected_user` **without awaiting it** — so the splash never waits on a
request, and a dead network gives a signed-in app rather than a blank screen
for fifteen seconds. `reachability.store.ts` observes rather than asks, shows
the offline line, and **disables the composer** rather than accepting a
question it cannot send. A `GET /up` probe runs only between a failure and the
next success, so there are no timers when healthy.

**No fix.** Written down because it is the kind of property that gets deleted
by somebody simplifying a layout, and the reviewer's airplane-mode test is
where that would surface.

---

## 8 · A fallback that resolves to `{}`

`app.json`'s `extra` has `"apiUrl": {}` and `"wsUrl": {}` — empty objects.
`src/config/env.ts` reads `EXPO_PUBLIC_API_URL` first and falls back to
`fromExtra("apiUrl")`. An empty object is **truthy**, so if the env var were
ever absent the fallback would hand `{}` to a URL rather than failing.

It does not bite today: both the preview and production profiles set
`EXPO_PUBLIC_API_URL`. It bites the first time somebody builds a profile that
does not.

**Fix:** remove the empty `extra` keys, or give them real values. An absent
fallback fails loudly; a fallback that is `{}` fails as a request to the string
`"[object Object]"`.

---

## 9 · Not checked here, and needs a built manifest

`expo-image-picker` is not in the `plugins` array. On iOS that is fine — the
camera and photo-library strings are written directly into `infoPlist` and are
present. On Android the camera permission comes from the library's own
manifest at merge time, which **cannot be read from this repo**. Whoever runs
the SDK 57 rebuild should check the merged `AndroidManifest.xml` for `CAMERA`
and the media-read permissions, and that nothing asks for a permission the app
no longer uses.

That is also the moment to confirm the reverse: `submit.production` in
`eas.json` is `{}`, so no App Store Connect or Play credentials are wired yet.
Not a defect — it is the next step, and it is Hamma9900's account rather than
anybody's code.

---

## Order I would take them in

1. **§4**, the permission string that is not true — regardless of stores.
2. **§3**, the draft privacy policy — his approval, and nothing ships past it.
3. **§1**, the iPad declaration — one line, and a decision rather than a fix.
4. **§2**, the ATS exception — a day of somebody's debugging, avoided.
5. §5, §8, the tidying, with the rebuild.
6. §9, at the rebuild, against a real manifest.
