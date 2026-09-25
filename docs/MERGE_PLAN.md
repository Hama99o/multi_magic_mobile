# Merging `sdk-57` into `main` — a plan, not a merge (2026-09-25)

> **Never merge in `../mm-sdk57`, and never move the `sdk-57` branch while it
> is checked out there, or that working copy silently stops matching its
> HEAD.** That working copy is the one his phone builds from, and it holds
> his uncommitted `app.json` edit, whose only backup is gone.
>
> **And a plain merge decides his Android package name** (see "What is his",
> item 1). It has no undo after the first Play upload.

Nothing here has been merged. Every number was measured today, most of them
by a **dry run**: `main` merged into `sdk-57` in a throwaway detached
worktree, with `sdk-57`'s own `node_modules`. That worktree was removed
afterwards, and neither `main`'s checkout nor `../mm-sdk57` was touched.

## Where things stand

| | |
|---|---|
| Unpushed commits on `main` | **183** (`origin/main..main`) |
| `sdk-57` ahead of `main` | 49 |
| `main` ahead of `sdk-57` | 70 |
| Merge base | `41e2278`, 2026-09-24 |
| Where work lands | `main` |
| Where the runbooks say releases are built | `sdk-57`, and `main` refuses a release build (`scripts/release_guard.js`) |

The two are drifting apart, and every night of work on `main` widens the gap
the release has to cross.

## What the merged tree needs, measured

The dry run's results:

| Gate | Result on the merged tree |
|---|---|
| Textual conflicts | **1**: `src/hooks/useConversation.ts` |
| `eslint --max-warnings 0` | **1 error, 25 warnings** |
| `tsc --noEmit` | **1 error** |
| Jest | 95 suites, **1218 tests, all pass** |
| `test:west` | **256 pass** |
| `pretest` (flows, qa, board) | pass; vocabulary NOT MEASURED only because the throwaway had no sibling backend |
| `expo export` (the bundle) | **exit 0** |

So the work is four items, all small and all known:

1. **The conflict, in `useConversation.ts`.** `sdk-57` moved
   `conversationRef.current = conversationId` out of the render body and
   into an effect, because SDK 57's React Compiler rejects a ref write
   during render. `main` added `messagesRef` for the reconnect gap fill,
   written during render. **Resolution** (tried in the dry run, with Jest
   green): declare `messagesRef`, and write BOTH refs in `sdk-57`'s effect.
   Nothing reads them during render.
2. **Lint error: `src/components/LoadFailure.tsx:63`,** `Date.now()` during
   render, which the compiler's purity rule rejects. It is tonight's
   stale-age sentence. Fix: take "now" from state set in an effect, or
   pass it in. Behaviour must stay what `cannotAsk.test.tsx` asserts.
3. **25 lint warnings, one rule: `@typescript-eslint/no-require-imports`,**
   all in test files, all the `jest.mock(…, () => require(…))` factory
   pattern (`src/__tests__/screenMocks.ts` and the journey harness). A
   factory cannot use `import`, so this is a config decision: allow
   `require` in `__tests__`. The code is right as written.
4. **Type error: `src/__tests__/i18nSweep.ts:64`.** SDK 57's React types
   narrowed an element-type union, so a comparison with `"Text"` no longer
   type-checks. It is test-helper code; widen the comparison.

## What is his, and must be answered first

Merging before these are answered either breaks something of his or
decides something for him.

1. **The Android package name. The merge DECIDES it silently.** In the
   merged `app.json`, `android.package` is `com.multimagics.mobile`,
   because only `sdk-57` changed that line; `main` says
   `co.byseven.multimagic`. It is **permanent once Play accepts an
   upload**, and the rig's installed dev build is `co.byseven.multimagic`.
   Whichever he picks, the merge commit must carry that value on purpose,
   not by accident.
2. **Expo Go scanning** (the caution at the top). `../mm-sdk57` holds his
   uncommitted `app.json` edit (owner and projectId removed so Expo Go can
   scan it, `OWNER_REMOVED_FOR_PHONE.md`), and its `/tmp` backup is gone.
   The committed file is intact. If he no longer needs scanning:
   `git checkout -- app.json` there, then retire the worktree.
3. **The Pashto change.** `main`'s worktree has another session's
   uncommitted edit to `src/hooks/useSpeechToText.ts`, and `sdk-57` changed
   that file too. A merge in `main`'s worktree refuses until that edit is
   committed or dropped, which is his decision.
4. **Pushing.** 183 commits to a PUBLIC repository. Pushing is his, and so
   is any read for personal data first.

## The order, once those are answered

1. In a **fresh worktree** (neither `main`'s nor `mm-sdk57`), create
   `merge/sdk-57` from `main`, and merge `sdk-57` into it.
2. Resolve the conflict as in item 1 above; set `android.package` to HIS
   answer.
3. Fix items 2–4 above.
4. **All four gates** on the merge branch (`nvm use` first): lint, typecheck,
   `npm test` (which now also runs the board check and the western run),
   and `npm run bundle`. Then `python3 qa/plants.py`: the instruments must
   still bite on SDK 57, and a TARGET GONE there is a finding about the
   manifest, not a nuisance.
5. Fast-forward `main` to the merge branch. The release guard then passes
   on `main` (SDK 57 and `expo-asset`), and `./scripts/eas-build.sh`
   builds from `main`. The runbooks' "build from `sdk-57`" lines become
   stale on that commit, so correct them in it.
6. **Rebuild the dev build, only in this order**, then QA run 9, which needs
   the rebuild anyway. The disk, measured 2026-09-25: **14 GB free at 97%**.
   Hamma9901's raise line is 8 GB, and five sessions share the box.
   - What the rebuild costs, both parts persistent until deleted and both
     safe to delete afterwards:
     - the Gradle cache, **5.3 GB** on 2026-09-21. There is none on the box
       now (no `~/.gradle`, no `modules-2` anywhere under home), so it is
       all downloaded again;
     - `android/`, **3.0 GB** now, 2.6 GB of it `android/app/build`.
   - No Android SDK download: NDK `27.1.12297006`, platform 36 and
     build-tools 36.0.0, which SDK 57's React Native asks for, are
     installed.
   - The order that never goes under 8 GB:
     1. delete the SDK 54 `android/` first (−3.0 GB used; the known-good
        APK is at `~/qa-apk-keep/`), about 17 GB free;
     2. build, **about 8.7 GB free at the peak**. That figure is INFERRED
        from SDK 54's sizes, and SDK 57's may differ, so measure while
        building and stop under 8;
     3. install, then delete `~/.gradle` and `android/app/build` (keep the
        APK), back to about 16.5 GB.
   - The alternative with no local disk: build the development profile on
     EAS, which spends HIS account and build quota, so it is his call.
   - `docs/DEPLOY_RUNBOOK.md` §3a keeps the SDK 54 APK at `~/qa-apk-keep/`
     as the way back.

## Why the plan and not the merge

The merge touches his phone's working copy and decides his package name.
The work on the tree is known and small; the answers are not ours.
