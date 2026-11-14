# The Fabric crash: candidates, ranked (2026-11-14)

**The crash.** `SIGSEGV (SEGV_ACCERR)` on `mqt_v_js` in
`facebook::react::MountingCoordinator::pullTransaction` ←
`FabricUIManagerBinding::schedulerDidFinishTransaction` ←
`Scheduler::uiManagerDidFinishTransaction` ← `ShadowTree::mount`.
`libreactnative` BuildId `0ee9df27`. Debug build, dev client. It comes
12–33 s after launch, usually a few seconds after a tile tap.

**Rate.** 9 tombstones on 2026-11-13/14. The last soak (overlay off) had 1
crash in 20 launches. Seen on the Notes runs and on ours, so it does not
come from one branch's code.

**Versions installed.** RN 0.86.3, Expo 57.0.24, react-native-screens
**4.26.2** (`~4.26.0`, Expo's pin), Reanimated 4.5.1, worklets 0.10.1,
FlashList 2.0.2. Read from `node_modules`. RN 0.86.3's
`ReactNativeFeatureFlags.js` has `cxxNativeAnimatedEnabled`,
`useSharedAnimatedBackend` and `enableFabricCommitBranching` all **false**.

Research was reading only; nothing was posted anywhere. A research agent
did the issue and changelog reading. **The code check below is measured.
The descriptions of the PRs and issues are as those sources state them,
not re-verified line by line.**

## 1. react-native-screens: `RNSScreenRemovalListener` use-after-free (STRONG)

- **Sources.**
  [screens#4413](https://github.com/software-mansion/react-native-screens/pull/4413)
  (merged 2026-08-13, first shipped in **4.28.0**),
  [screens#4654](https://github.com/software-mansion/react-native-screens/issues/4654)
  (closed), and
  [reanimated#10734](https://github.com/software-mansion/react-native-reanimated/issues/10734)
  (maintainer diagnosis).
- **What the sources state.**
  - On a cold start, `NativeProxy::nativeAddMutationsListener` runs from two
    threads (module init and `onHostResume`). It creates the listener lazily
    with **no lock**.
  - RN can then keep a mounting-override delegate that points at freed
    memory. The next `pullTransaction` calls through it and crashes.
  - The same PR also fixes a callback that captured raw `this` and read
    `javaPart_` after `invalidateNative()`. RN never unregisters override
    delegates, so the stale listener stays installed.
  - **Same frames as ours.** Same stack (Expo 57, RN 0.86.x, screens 4.25–4.26).
    Same debug and dev-client deep-link launches. Same 1–3% rate.
  - **The fix is verified there.** 0 crashes in 400 cold launches on screens
    4.28.0, and 0 in 115 with a backport of the four files.
- **Measured here.** Our installed
  `react-native-screens/android/src/main/cpp/NativeProxy.cpp` (4.26.2) has
  exactly that code:
  - `if (!screenRemovalListener_) { screenRemovalListener_ = std::make_shared<RNSScreenRemovalListener>([this](int tag) { … javaPart_ … }); }`
    with no lock;
  - then `coordinator->setMountingOverrideDelegate(screenRemovalListener_)`.
- **Gap (inferred).** The published cases crash on the first commit, 5–13 s
  in. Ours come 12–33 s in, after a tap. That fits a stale delegate that
  faults only when a later transaction reaches it (a navigation push), but
  this is not measured.
- **Next.**
  - Backport #4413 as a `patches/react-native-screens+4.26.2.patch`. That
    keeps Expo's `~4.26.0` pin. Bumping to 4.28 means leaving the SDK 57
    pin, and `npx expo install --check` would flag it.
  - Then soak about 60 cold launches with taps. With a 1-in-20 base rate,
    20 clean launches would not prove anything.

## 2. The same root cause, aborting at surface stop (SIMILAR)

[screens#4430](https://github.com/software-mansion/react-native-screens/issues/4430):
a SIGABRT inside `RNSScreenRemovalListener::pullTransaction` during
`SurfaceHandler::stop` under expo-router. The maintainer expects #4413 "may"
fix it too, without a reproduction. It is not our signal (we see SIGSEGV),
but the same patch covers it.

## 3. Reanimated layout-animation proxy (WEAK)

[reanimated#10734](https://github.com/software-mansion/react-native-reanimated/issues/10734)
(a 4.7.0 regression) and
[reanimated#9907](https://github.com/software-mansion/react-native-reanimated/issues/9907)
(only with `ENABLE_SHARED_ELEMENT_TRANSITIONS`, which we do not set: checked
in package.json and app.json, 2026-11-14). We are on 4.5.1, and no
app file imports Reanimated: NativeWind 4 uses it internally. The 4.5.1
report on this stack turned out to be bug #1.

## 4. Our own code during the first seconds (WEAK, kept for completeness)

- **The opening animation.** Native-driver `Animated`, about 0.45 s, unmounts
  long before the crash. It does not fit the timing.
- **Skeleton pulses.** `src/components/reusables/skeleton.tsx`: a
  native-driver `Animated.loop` that starts on mount and stops on unmount.
  Used by Pages, Chats and the drive views. This is real mount and unmount
  churn in the first seconds, but the crash also followed taps on SafeZone,
  Contacts and Calendar, which have no skeleton. It does not explain the
  pattern across tiles.
- **Others.** Pages also mounts `FlatList`s and `expo-image` thumbnails.
  No report links them to this stack.

## 5. React Native core (NOTHING SOLID)

The 0.86.1 → 0.88 changelogs show nothing touching `MountingCoordinator`,
`pullTransaction` or `ShadowTree::mount`. 0.86.3 already has the
`EventEmitter` use-after-free fix. GitHub refused searches scoped to
facebook/react-native, so the core tracker was searched only through the
changelogs and the web. **Treat it as not fully searched.**

## Recommendation

Candidate 1 is a code-level match, has a published fix, and has a verified
zero-crash result. Next slot:

1. Backport #4413 test-first where we can. Jest cannot load native code, so
   the test is a check that the patch file applies and contains the lock.
   The device soak is the real proof.
2. Debug build: 60 or more cold launches with taps, overlay off, via the
   dev-client link.
3. The same soak on a release build, to answer the open question of whether
   the crash is dev-only.
