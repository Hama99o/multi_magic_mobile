# Handoff — read this first when you resume (written 2026-09-25)

The owner (Hamma9900) paused this session. Everything below is committed on
`main` and **nothing is pushed**: about 190 commits sit ahead of `origin/main`,
and pushing is his. `CLAUDE.md` is the rulebook; this is the state.

---

## 1 · Two uncommitted files, left alone on purpose. Read before touching

`src/hooks/useSpeechToText.ts` and
`src/components/settings/__tests__/DictationRow.test.tsx` have been modified
and uncommitted since 2026-09-24. **Do not commit them, and do not revert
them.**

- **What the change does:** it **removes Pashto (`ps-AF`) from dictation's
  languages.** Its comment gives two reasons:
  - Android recognisers rarely ship `ps-AF`, and whether Apple does was
    never measured;
  - the microphone's long press cycles with `LANGUAGES.find((l) => l.code
    !== lang)`, which works for two languages and silently strands a third.
- **Who it is attributed to:** its comment says "his call". **Nobody has
  confirmed that he made it.** Another session wrote it; the attribution
  lives only in the code comment.
- **Why it matters now:** **it blocks the merge.** The `sdk-57` branch also
  changed `useSpeechToText.ts`, so a merge in `main`'s checkout refuses until
  this edit is resolved.
- **What settles it:** one sentence from him, "keep Pashto" or "drop it".
  - Drop it: commit the pair.
  - Keep it: revert the pair, and if Pashto stays, make the long press a
    real modulo cycle in BOTH composers in the same commit (the comment says
    so).

## 2 · The merge: a plan, waiting on four answers from him

`docs/MERGE_PLAN.md`, measured by a dry run in a throwaway worktree. Its
first paragraph is the one to obey: **never merge in `../mm-sdk57`, and never
move the `sdk-57` branch while it is checked out there.** That working copy
is his phone's, with an uncommitted `app.json` edit whose backup is gone.

His four answers, **the package name first**:
1. **Android package name.** A plain merge silently picks
   `com.multimagics.mobile`, because `main` never touched that line. The rig
   builds `co.byseven.multimagic`, and the name is permanent after the first
   Play upload.
2. **Expo Go scanning** (whether `mm-sdk57`'s `app.json` can go back to its
   committed state).
3. **The Pashto pair** (section 1).
4. **Pushing** about 190 commits to a public repo (the plan still says 183;
   count again with `git rev-list --count origin/main..main`).

The merged tree needs four small, known fixes; the plan lists them. The
first is a React Compiler purity error in `LoadFailure.tsx`, which is my
code from tonight.

## 3 · Waiting on him, each ready to go the moment he answers

- **Store screenshots:** approve the words in `docs/store/DEMO_CONTENT.md`
  (invented people and data; every word goes to the world). The four
  production steps are in `docs/store/README.md`, about 20 minutes. The 18
  old shots in `docs/store/play-phone/` are marked **DO NOT UPLOAD**.
- **Release** (`docs/RELEASE_WALK.md`): the Android signing key, exporting
  `ASC_KEY_ID` / `ASC_ISSUER_ID`, the backend deploy, read-aloud's voice,
  and **SafeZone and the App Privacy "Audio" answer**. That answer's stated
  reason, on-device dictation, is false in the code; the answer itself may
  still be right.
- **Disk for the rebuild and QA run 9:** 16 GB free after `android/` was
  deleted. The rebuild's peak was estimated at about 8.7 GB free, too close
  to the 8 GB line, so Hamma9901 ruled no rebuild. The steps are in
  `docs/MERGE_PLAN.md`, and the kept APKs and debug key are in
  `~/qa-apk-keep/` with a README.

## 4 · What is owed on a device

- **Row 17 (transitions): smoothness on a REAL phone.** The emulator showed
  no flash, and slides of 384–440 ms against the platform's 450 ms, but it
  cannot measure frame rate (`docs/design/transitions/SPEC.md`).
- **Frame-timing comparison:** one valid baseline exists and no second,
  because the host was never quiet. It needs a box with one session
  (`qa/gfxinfo.sh`).
- **QA run 9**, after the rebuild.

## 5 · The instruments, and the one thing most likely to be undone by accident

`python3 qa/plants.py` re-plants every instrument's proving defect in a
throwaway worktree of HEAD and checks it still goes red **for the stated
reason** (`qa/plants/plants.json`, `docs/TESTING.md` §21). Twenty-two plants,
all BITE at `65e137b`. **Run it after any refactor that touches a check.**

It found two instruments that had **never been able to fail** the way they
were trusted:
- **the accessibility walk** counted a conditional `<Text>` as a name
  (fixed: "a name that is only sometimes there is not a name");
- **the western (New York) run** had never caught a bug Paris could not.
  Its original proof was red in Paris too (fixed:
  `app/__tests__/calendarHeading.test.ts`).

A TARGET GONE from it is a finding about the manifest, not a nuisance to edit
away.

## 6 · The last thing that landed: a thread opens on what the app already knows

A person's chat used to open on a second of skeleton, even though the chats
list already held its last message. It now opens on that message
(`fbc337d`, spec in `docs/design/people-chat/SPEC.md`):
- `app/chat/[id].tsx` `lastKnownMessages` reads the list's cache through
  `getQueryState`. It seeds only when that read is under
  `SEED_MAX_AGE_MS = 60_000`, and only once, through `useState`.
- `useConversation`'s `seed` option keeps the seed only for the id it was
  given.

**The claim is about behaviour, not milliseconds.** No device measured the
second it saves.

Three traps, each now a plant in `qa/plants/plants.json`:
- **A test that proved nothing.** The hold registered a different regex
  from `serveApi`'s, and the first registered handler wins, so the "before
  the server answers" moment never happened (`docs/TESTING.md` §19). It was
  caught only because the pass looked too easy. **Suspect an easy green.**
- **The mount effect wiped the seed** on the first frame.
- **The unread divider latched on the one seeded message** and then sat
  nowhere for ever. It now settles only at `status === "ready"`.

**The key-and-shape gate had a hole**, and this work closed it:
`queryKeys.test.ts` never scanned `getQueryState`, so it would have called
a legitimate infinite read a clash and missed a real one.

## 7 · What to pick up first, and why

1. **Ask him the four merge questions, package name first.** Everything
   else (the rebuild, run 9, the release) sits behind the merge, and the
   package name cannot be undone.
2. **Ask about Pashto** in the same breath; it is question 3.
3. **Only then**, the merge, following `docs/MERGE_PLAN.md` exactly.
4. While waiting: nothing on the device needs his answers except the store
   shots. Keep new work at the desk, and run `qa/plants.py` before trusting
   a green.
