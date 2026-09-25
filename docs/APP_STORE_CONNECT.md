# The App Store, from a terminal instead of a browser

Written 2026-09-21, the evening the iOS listing was configured by hand, by the
session that watched it happen. **The point is that the next release is a
command rather than an afternoon of clicking**, so this records what was
entered, what replaces each click, and — the part that decides whether any of
it works — the one credential that has to exist first.

Read it at the START of a release. It is short on purpose.

**Nothing personal is in this file.** The repo is public: no phone number, no
email, no password, no key id, no issuer id. Where a value is personal this
says where it lives instead.

---

## 0 · The credential that turns next time into a command

An **App Store Connect API key**. Without it everything below is a browser.

**Issued by Hamma9900 and nobody else**, once:
App Store Connect → **Users and Access** → **Integrations** → **App Store
Connect API** → *Team Keys* → **+**.

- First time on an account the page says *"You need permission to access the
  App Store Connect API"* with a **Request Access** button. The Account Holder
  grants it to themselves; it took effect immediately here.
- **Access: App Manager.** Enough for metadata, versions and screenshots; not
  enough to touch users or finance. Apple states on that page that a key's
  access **cannot be widened after creation**, so choosing narrow means
  regenerating if the scope ever needs to grow.
- The **`.p8` downloads exactly once.** Lose it and the only path is revoke and
  reissue.

**Where it must live:** outside this repo. Not in `eas.json`, not in a commit,
not in `.env`. `.gitignore` covers `*.p8`, and relying on that for a credential
in a PUBLIC repo is the wrong shape of safety — keep the file out of the tree
entirely:

    ~/.appstoreconnect/AuthKey_<KEYID>.p8     chmod 600, dir chmod 700

    export ASC_KEY_ID=...        # shown in the Team Keys table
    export ASC_ISSUER_ID=...     # at the top of that page, account-wide
    export ASC_P8=~/.appstoreconnect/AuthKey_<KEYID>.p8

**Do not revoke the key named `[Expo] EAS Submit`.** EAS created it for
submitting builds and holds its private half on Expo's servers; it is not
usable from this machine and revoking it breaks `eas submit`. Make a second key
for local use.

---

## 1 · What was entered, field by field

Values, so the next run can diff rather than guess.

### Apple Developer portal — the App ID

| | |
|---|---|
| Bundle ID | `com.multimagics.mobile`, **Explicit** |
| Team | Individual |
| Capabilities | **none enabled** |

Zero capabilities is a decision with evidence behind it, not an oversight: no
`expo-notifications` anywhere in `src/` or `app/`, so no Push; auth is email +
password via `POST /users/login` (`src/api/auth.ts`), so Sign in with Apple is
not required; no `applinks`, so no Associated Domains; `expo-secure-store` uses
no access group, so no Keychain Sharing. Capabilities can be added later — the
bundle id cannot be changed.

### App Store Connect — the app record

| | |
|---|---|
| Platform | iOS only |
| Name | `MultiMagic` |
| Primary language | English (U.S.) |
| SKU | internal, never public, permanent |
| User access | Full |
| App ID (Apple's) | `6814432815` |

### Version and listing

| | |
|---|---|
| Version | **`1.0.0`** |
| Category | Productivity |
| Content rights | contains no third-party content |
| Support URL | `https://www.multimagics.com/about` |
| Privacy policy URL | `https://www.multimagics.com/privacy` |
| Marketing URL | empty |
| Localizations | **en-US and fr-FR** |

Copy for both locales is `docs/store/LISTING.md` §§1-3 and 8 — that file is the
source, and the push below extracts from it rather than retyping it.

**The version string is not cosmetic.** App Store Connect creates version `1.0`
by default; `app.json` declares `1.0.0`; Apple matches an uploaded build to a
version record by that exact string. Left mismatched the build uploads fine and
then simply does not appear in the build picker, with no error saying why.

**Two URLs that need an eye, not a status code.** `multimagics.com` is a SPA:
every path returns the same 8 KB shell, including nonsense ones, so `curl`
returning 200 proves nothing. `AppRoutes.tsx` is the real answer — the only
routes reachable without an account are `/login`, `/login/verify`, `/signup`,
`/privacy`, `/forgot-password`, `/reset-password`, `/logout`, and `/about`
(inside `MainLayout`, which does not gate). **There is no `/support` route**;
`/about` is used because it carries a contact section.

### Product decisions made along the way

- **iPhone and iPad**, `ios.supportsTablet: true` — reversed from the phone-only
  plan once iPad screenshots were shot and uploaded. `ios.requireFullScreen:
  true` goes with it and is the load-bearing half: it keeps `orientation:
  portrait` honoured by opting out of Split View and Slide Over, which is the
  one case `STORE_READINESS.md` §1 names, where iPadOS hands the app an
  arbitrary width and the portrait declaration stops applying. The app still
  runs full-screen on iPad; only side-by-side multitasking is refused.
  **The iPad layout has still never been seen on an iPad** — this closes the
  reviewer's most likely route into it, not the underlying gap.
- ~~**On-device speech.** `requiresOnDeviceRecognition: true` at
  `useSpeechToText.ts`, so `NSSpeechRecognitionUsageDescription` becomes true
  rather than being reworded.~~ **FALSE, found 2026-09-25:** it is not set on
  `main` or on `sdk-57` (0 matches). The sentence was reworded instead:
  `app.json` says Apple may process the audio, which matches the code.
  `STORE_READINESS.md` §4.
- **The app icon must be square and opaque.** `assets/icon-1024.png` is the SVG
  rendered *with* its `rx="58"` corners, so 4.49 % is transparent — and
  `@expo/prebuild-config`'s `withIosIcons.js` composites onto `#ffffff`
  (`removeTransparency: true`, `backgroundColor: '#ffffff'`). Shipped as-is the
  binary carries four white wedges. The fix is a full-bleed square whose corners
  continue `icon.svg`'s gradient (`#102125` → `#2d5363`), not a flatten.

### App Privacy answers

Every type is **linked to the user**, **not used for tracking**, purpose **App
Functionality** only.

| Category | Collected |
|---|---|
| Contact info | Name, Email, **Phone** (`profile.ts` reads/writes `phone_number`) |
| Financial info | Other financial info — expenses, incomes, loans, budgets |
| Contacts | yes |
| User content | messages, photos/videos, other content. **Audio: NO** — ~~dictation is on-device and~~ never reaches the server. **For Hamma9900 to re-read before the next submission (2026-09-25):** the answer may well be right, because MultiMagic's server never receives audio, but its stated reason, on-device dictation, is false (§1). A privacy declaration whose reason is wrong is his to resolve |
| Identifiers | User ID, Device ID |
| Health, location, browsing/search history, usage, diagnostics, purchases | none |

**Open question, and it is bigger than a checkbox.** `app/services/ai/records.rb`
selects `type.app.nil? || type.app == 'safezone' || ...` — **SafeZone is always
in the assistant's scope**, even when a conversation is narrowed to other apps.
SafeZone holds passwords, payment cards and identities, and the privacy policy
says the question plus retrieved passages go to Google's Gemini API. Either
that is declared as Payment Info, or SafeZone is excluded from the retrieval
corpus. Decide it before launch; declaring is the safer of the two if it ships
unchanged.

---

## 2 · What replaces each click

`scripts/asc.py` drives Apple's own API — no fastlane, no `eas metadata`. It
resolves which app to act on from `--bundle`, then `bundleId` in the metadata
file, then `ASC_BUNDLE_ID`, then `expo.ios.bundleIdentifier` in `./app.json`,
so from any Expo project it needs no arguments.

    python3 scripts/asc.py apps                     # every app the key can see
    python3 scripts/asc.py show                     # read the listing back
    python3 scripts/asc.py push metadata.json       # DRY RUN, sends nothing
    python3 scripts/asc.py push metadata.json --write

| Click | Replacement |
|---|---|
| Name, subtitle, privacy URL | `push` → `appInfoLocalizations` |
| Description, keywords, promo text, support/marketing URL | `push` → `appStoreVersionLocalizations` |
| Adding a whole language | same call — **fr-FR is one block, not a second pass through every field** |
| Version number | `push` → `appStoreVersions.versionString` |
| Reviewer notes | `push` → `appStoreReviewDetails.notes` |
| Primary category | `PATCH /appInfos/{id}` relationship `primaryCategory` → `{"type":"appCategories","id":"PRODUCTIVITY"}` |
| Content rights | `PATCH /apps/{id}` → `contentRightsDeclaration: "DOES_NOT_USE_THIRD_PARTY_CONTENT"` |
| Age rating | `PATCH /ageRatingDeclarations/{appInfoId}` — see below, it has sharp edges |
| Pricing | `POST /appPriceSchedules` — see below |
| Screenshots | `scripts/shots.py` — reserve, chunk-PUT, commit with the file's md5 |
| Uploading a build | `eas build -p ios --profile production`, then `eas submit` |

### Submitting for review, and the endpoint that is gone

`POST /appStoreVersionSubmissions` is **dead**. It answers

    403 FORBIDDEN_ERROR: The resource 'appStoreVersionSubmissions' does not
    allow 'CREATE'. Allowed operation is: DELETE

so it still works for *removing* a version from review and not for putting one
there. Found on 2026-09-24 mid-swap, with the app sitting out of review — the
worst moment to discover it, which is why it is here.

Submission is now three calls against `reviewSubmissions`:

1. `POST /reviewSubmissions` — `attributes: {platform: "IOS"}`, related to the
   app. Check `GET /apps/{id}/reviewSubmissions` first and reuse anything in
   `READY_FOR_REVIEW` rather than creating a second; a `COMPLETE` one is a past
   submission and is not reusable.
2. `POST /reviewSubmissionItems` — relating that submission to the
   `appStoreVersion`.
3. `PATCH /reviewSubmissions/{id}` — `attributes: {submitted: true}`. Nothing
   reaches Apple until this call.

**Replacing the build of a version already in review** is: `DELETE
/appStoreVersionSubmissions/{id}` (still allowed), `PATCH
/appStoreVersions/{id}` with the new `build` relationship, then the three calls
above. The build must be `VALID` first — `PROCESSING` is refused, and Apple
takes about five minutes after upload.

It costs the queue position. On 2026-09-24 that was the right trade: 1.0.0 had
sat unreviewed for three days carrying build 3, which has no `app/two-factor.tsx`
and therefore cannot sign in an account with two-step enabled.

### Uploading needs the key in eas.json, and that is what scripts/submit-ios.sh is for

`eas submit --non-interactive` refuses to SET UP an API key and has no flag to
receive one; it reads the key only from the submit profile. Those fields cannot
live in a public repo — and note that `ascApiKeyPath` leaks too, because Apple
names the file `AuthKey_<KEYID>.p8`. `scripts/submit-ios.sh` injects all three
for one command and restores `eas.json` on a trap, including on failure.

### Pricing, and the one endpoint shaped differently

`Tarification` does not appear in the pre-submission error list until the items
above it are cleared, so it looks like a new problem when it is just the next
one. There is no price schedule on a new app — `GET /apps/{id}/appPriceSchedule`
returns 404, not an empty object.

**`POST /appPriceSchedules` is the only call here that needs `included`.** The
new `appPrice` is declared inline under a placeholder id that `manualPrices`
then references:

```json
{"data": {"type": "appPriceSchedules",
          "relationships": {
            "app":           {"data": {"type": "apps", "id": "<appId>"}},
            "baseTerritory": {"data": {"type": "territories", "id": "USA"}},
            "manualPrices":  {"data": [{"type": "appPrices", "id": "${price1}"}]}}},
 "included": [{"type": "appPrices", "id": "${price1}",
               "relationships": {"appPricePoint": {
                 "data": {"type": "appPricePoints", "id": "<free point>"}}}}]}
```

The free price point is the one with `customerPrice: "0.0"` from
`GET /apps/{id}/appPricePoints?filter[territory]=USA`. Its id is a base64 blob
and is **per app**, so it cannot be copied from another listing.

MultiMagic ships **free, base territory USA**. Free needs only the free
agreement; charging would need Paid Applications, plus tax and banking, which
are his and are in §3.

### The age rating declaration is all-or-nothing

Learned the hard way on 2026-09-21, and it is the one place where the
per-attribute retry that saves `push` actively misleads you.

**Every required attribute must be in the SAME request.** Sending one at a time
returns `409 ENTITY_ERROR.ATTRIBUTE.REQUIRED: You must provide a value for the
attribute '<other one>'` for every single field — twenty-one failures that look
like twenty-one problems and are one. The id is the **appInfo id**, not a
separate resource id.

**Types are not uniform and the docs do not say which is which.** Thirteen
content descriptors are enums taking `"NONE"`; the rest are booleans. The newer
fields are the trap: `healthOrWellnessTopics` looks like a descriptor and is a
**boolean**, and `ageAssurance` and `parentalControls` are required but appear
in no older example. The working set, verified accepted:

```
"NONE"  violenceCartoonOrFantasy · violenceRealistic
        violenceRealisticProlongedGraphicOrSadistic · profanityOrCrudeHumor
        matureOrSuggestiveThemes · horrorOrFearThemes
        medicalOrTreatmentInformation · alcoholTobaccoOrDrugUseOrReferences
        gamblingSimulated · sexualContentOrNudity
        sexualContentGraphicAndNudity · contests · gunsOrOtherWeapons
false   healthOrWellnessTopics · gambling · unrestrictedWebAccess · lootBox
        advertising · socialMedia · ageAssurance · parentalControls
true    messagingAndChat · userGeneratedContent
```

**The minimum age is 9+, and that is a decision rather than a computation.**
`ageRatingOverrideV2: "NINE_PLUS"` — Hamma9900's call on 2026-09-21.

**An override is a FLOOR, not a ceiling.** It can only push a rating up, never
down. This declaration sets `messagingAndChat` and `userGeneratedContent` to
true, and unrestricted messaging usually computes above 9+ on its own — so the
effective rating may be higher than the override asks for, and the console is
where to read what actually ships. Apple accepts the value either way, which
means a too-low override fails silently rather than erroring. Apple's accepted
values, enumerated by its own error rather than guessed:

    NONE · NINE_PLUS · THIRTEEN_PLUS · SIXTEEN_PLUS · EIGHTEEN_PLUS · UNRATED

There is no `TWELVE_PLUS`: the old 4+/9+/12+/17+ bands are gone, so "over 12"
would be `THIRTEEN_PLUS`. Setting the V2 field also sets the legacy
`ageRatingOverride`, and `kidsAgeBand` stays null — this is not a Kids app.

`messagingAndChat` and `userGeneratedContent` are the two that describe this app
and they raise the rating. That is correct and not worth arguing around: an app
where people message each other is rated as one. `unrestrictedWebAccess` is
false because there is no in-app browser — links go out through
`Linking.openURL`. `socialMediaAgeRestricted` stays null; it only applies when
`socialMedia` is true, and Apple accepts the declaration without it.

**Where there is no equivalent, and this was checked against Apple rather than
assumed** — all five return `404 PATH_ERROR`:

    /appDataUsageCategories · /appDataUsagePurposes
    /appDataUsageDataProtections · /apps/{id}/dataUsages
    /apps/{id}/appDataUsagesPublishState

**The App Privacy questionnaire cannot be automated by any tool**, Apple's
included. It is the table in §1, entered by hand, every release. It is also the
*only* remaining console-only step — age rating, category and content rights all
have API paths and are listed above, so the pre-submission error list should
come down to two entries: the build, and this.

### Three refusals that are normal

- **`whatsNew` on a first release** → `409 STATE_ERROR: Attribute 'whatsNew'
  cannot be edited at this time`. There is nothing to be new against. Restore it
  for 1.0.1.
- **10 screenshots per set, hard cap** → `409 SCREENSHOT_TOO_MANY`. Uploading
  on top of existing ones does not replace them; delete first.
- **Only the first three screenshots** appear on install cards. Order is set by
  `PATCH /appScreenshotSets/{id}/relationships/appScreenshots`, and it is worth
  doing deliberately rather than accepting upload order.

Because of the first one, `push` retries a refused multi-field PATCH **one
attribute at a time**, so nine accepted fields still land when one is refused,
and it ends with a tally instead of a traceback.

### The first iOS build does NOT need the 2FA sign-in

`RELEASE.md` says the first build on a new bundle id needs Hamma9900 at a
terminal for Apple's 2FA. That is true of the path EAS takes by default, and it
is **not** true of the build as a whole. Proved on 2026-09-21: the first
production build ran non-interactively, with no Apple ID and no code from his
phone.

`eas build --non-interactive` fails with:

    Distribution Certificate is not validated for non-interactive builds.
    Credentials are not set up. Run this command again in interactive mode.

EAS refuses to *create* Apple credentials without a session. So do not ask it
to — make them with the API key from §0 and hand EAS the finished article.

```sh
D=~/.appstoreconnect/multimagic && mkdir -p "$D" && chmod 700 "$D"
openssl genrsa -out "$D/dist.key" 2048
openssl req -new -key "$D/dist.key" -out "$D/dist.csr" -subj "/CN=<app> Distribution/O=<name>/C=FR"
```

The private key **never leaves the machine**; Apple only ever sees the CSR.

1. `POST /certificates` with `certificateType: "IOS_DISTRIBUTION"` and the CSR
   as `csrContent`. The response carries `certificateContent` — base64 DER,
   written straight to `dist.cer`.
2. `POST /profiles` with `profileType: "IOS_APP_STORE"`, related to the
   `bundleIds` resource id (not the string) and to the certificate just made.
   `profileContent` is base64; decode to `dist.mobileprovision`.
3. Bundle key + certificate:

```sh
openssl x509 -inform DER -in "$D/dist.cer" -out "$D/dist.pem"
openssl pkcs12 -export -legacy -inkey "$D/dist.key" -in "$D/dist.pem" \
  -out "$D/dist.p12" -passout "pass:$P12PASS"
```

**`-legacy` is load-bearing.** OpenSSL 3 defaults to AES-256 for PKCS#12, and
node-forge — what EAS reads a `.p12` with — cannot open that. The symptom is a
password error on a password that is correct.

4. `credentials.json` at the project root pointing at those two files, plus
   `"credentialsSource": "local"` on the build profile in `eas.json`. Then
   `eas build -p ios --profile production --non-interactive` runs clean.

**`credentials.json` contains the .p12 password**, so it is in `.gitignore` and
the signing material itself lives outside the tree. `.gitignore` already covered
`*.p12` and `*.mobileprovision`; it did not cover `credentials.json`, which is
the file that actually leaks the password.

**What this does and does not remove.** It removes the 2FA sign-in from the
build. It does not remove Apple sign-in from everything else — see §3, which is
unchanged.

**EAS uploads the working tree, not `HEAD`, so say what was in it.** A binary
whose contents match no commit is one nobody can rebuild later, and naming it
costs a line. For the first build, `buildNumber` 3, submitted 2026-09-21 15:49
local:

| | |
|---|---|
| HEAD at upload | `ae12150` *fix(chat): stop fetching older history over the landing* |
| also in the tree | the `.gitignore` and `eas.json` edits that landed three minutes later as `da43362` |
| uncommitted and irrelevant | `qa/flows/09-keyboard.yaml` — a Maestro flow, not imported by app code and not in the JS bundle |

So **this binary's app code is `da43362`**: that commit is `ae12150` plus
`.gitignore`, this document and `eas.json`, none of which reach the bundle. It
is reproducible, which is the only claim worth making about a build.

---

## 3 · The boundary — what stays his, however good the tooling gets

No document and no script moves these:

- **Apple sign-in and 2FA.** `eas build -p ios` asks for the Apple ID, the
  password and a code from his phone. `RELEASE.md` has the prompt order.
- **Agreements, tax and banking.** Paid or free, the agreements gate the
  listing and only the Account Holder can accept them.
- **Creating the API key**, §0. The one that unlocks the rest.
- **"Submit for Review".** The final click is his name on the submission.
- **Approving the privacy text.** It is a legal statement about his users'
  data. `PRIVACY.draft.md`'s title line carries it; dropping the word DRAFT is
  what turns the banner off on the app and the web together, and **the file
  must not be renamed** — `Legal::Policy::SOURCE` and `build-privacy.mjs` both
  hardcode `docs/PRIVACY.draft.md`.

---

## 4 · Two false greens this evening, both generic

Kept here because both would repeat, and `docs/TESTING.md` exists for exactly
this shape.

**A backgrounded `cmd | tail` reports the pipe's exit code, not the command's.**
`bundle exec rspec 2>&1 | tail -25` came back exit 0 with 24 failures in the
output. (Those 24 were `NameError: uninitialized constant Vips::Image` —
libvips is absent here and `ci.yml` installs it, so they cannot pass locally.)

**Running a linter on one file is not the gate.** `bundle exec rubocop <file>`
said "no offenses detected" while CI, which runs it across the repo, was red on
a file that had not been touched — and that red had been silently blocking
every deploy, because the deploy job needs `[rubocop, brakeman, bundler_audit,
rspec, frontend]`. Run the gate the way CI runs it, with no argument.
