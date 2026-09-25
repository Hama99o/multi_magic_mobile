# Transitions between screens: `SPECIFIED`, and the finding is "keep the defaults"

The owner asked for the app to be smooth. The keyboard (`chat/SPEC.md`) and
the opening (`src/components/OpeningAnimation.tsx`) have had attention. This
is the third thing he sees all day: the move between screens. The conclusion
is that **nothing should change**. That is a finding, and it is written down
so the next session does not re-open it without new evidence.

## What the app does now (read from the source, 2026-09-24)

- One `Stack` in `app/_layout.tsx`, `headerShown: false`, with `contentStyle`
  set to the theme's ground. That ground is what stops a light flash between
  screens on a dark theme (the comment above `useScheme()` there).
- No `animation` option anywhere, so every push takes react-native-screens'
  `"default"` (4.16.0). On Android that maps to `StackAnimation.DEFAULT`
  (`ScreenViewManager.kt:143`) and the resources in
  `FragmentTransactionKt.kt`:
  - **Android 13+ (`res/v33/anim-v33/rns_default_enter_in.xml`)**: the new
    screen slides 10% from the right over 450 ms with
    `fast_out_extra_slow_in`, fading in over 83 ms after 50 ms. The old one
    slides 10% left. This is the system's own Android 14 activity transition,
    the one Settings and Gmail use.
  - **Older Android (`res/base/anim/rns_default_enter_in.xml`)**: a 200 ms
    zoom from 0.85, with a fade.
  - **iOS**: the UIKit push, with its edge-swipe back.
- **All of it is native.** A fragment transaction or a UIKit push does not
  run on the JS thread, so the 0.3–1 s JS stalls measured after a send
  (`src/components/chat/__tests__/nativeDriver.test.tsx`) cannot freeze it.
  That is the property a hand-rolled transition would most likely lose.
- The moves the app actually makes: chat → Conversations sheet
  (`SessionsSheet`, `Modal animationType="slide"`), chat → profile sheet →
  profile / account (push), chat → notifications, calendar, people chats
  (push), a people chat → a thread (push), sign-in → chat (`router.replace`).

## Rule Zero: Mobbin, 2026-09-24

Searched for the two moves the app makes most: into the conversation history
and back, and into settings from a profile.

- **Chat history.** Fabric (`mobbin.com/flows/131a97df-49fa-4781-b86f-19e654de7e2c`)
  and Tiimo (`mobbin.com/flows/4ad7fb1a-1d5f-4c5a-af31-b698bb1bcec2`) use a
  side drawer over the chat. Microsoft Copilot
  (`mobbin.com/flows/c2f03bb2-db50-4ddd-a4c3-f14357a45b8b`) uses a full-screen
  "Recents" with ✕. Mesh (`mobbin.com/flows/88be2f0a-6a7a-49c8-a280-875515836cb2`)
  swaps the list in place, from a menu under the title.
- **Settings from the profile.** Discord
  (`mobbin.com/flows/5d45102e-fc54-435e-9ff6-41dc9d790fb4`) pushes Settings
  with a back arrow. Telegram
  (`mobbin.com/flows/48862ecb-a103-4c24-831d-69eb3f0e167d`) and WhatsApp
  (`mobbin.com/flows/00e4e73c-d923-491c-99bf-1270e4f32532`) make it a tab.

**TAKE:** what these references can show is the PRESENTATION: drawer, sheet,
full screen or push. On that, the app already sits inside the range. A
dismissable surface over the chat for history, where Fabric and Tiimo use a
drawer and ours is a bottom sheet the owner specified in `sessions/SPEC.md`.
A push with a back control for everything settings-like, as Discord does.
There are no tabs, because the assistant is the single destination.

**REJECT: a custom transition.** Mobbin's flows are stills. They cannot show
how any of these apps MOVE, so a replacement for the platform push would be
a preference passed off as research. That is the same conclusion
`chat/SPEC.md` reached for sheets on 2026-09-22, for the same reason. The
default is the platform's own motion, on the native thread, which is what
"feels like a real app" means on each OS.

## What would re-open it

- A device recording where a push stutters, or where a white or black frame
  shows between two screens. Either is a measurable defect, not a taste.
  **Recorded 2026-09-25, on the emulator (`qa_phone4`, current build)**:
  `screenrecord`, split into frames with ffmpeg, stills in `ours/`.
  - **No flash.** Every frame's brightness was checked against its
    neighbours; a single frame more than 40 off both counts as a flash.
    There were none, in light or dark, at 360, 411 or 800 dp. Light stayed
    within 213–244 and dark within 28–53, so no white frame on dark and no
    black frame on light.
  - **The slide takes what this file says.** The header band, compared
    frame by frame with the settled screen, moves and settles in **384 ms
    (411 dp), 391 ms (360) and 440 ms (800)**. That is against the 450 ms of
    `rns_default_enter_in.xml` above: a platform claim beside an
    observation, and they agree, since `fast_out_extra_slow_in` crawls
    through its last stretch below the comparison's threshold.
  - **A number I reported first was wrong, and is recorded as wrong.** I
    first said "slides of 0.60–1.09 s": that was the whole burst of change,
    including the calendar's "Updating…" and its content arriving after the
    slide. Hamma9901 asked why it disagreed with 450 ms, and the header-band
    measure above is the answer.
  - **Smoothness: NOT MEASURED.** The recording's own timestamps give 20–28
    fps during a slide, with gaps up to 99 ms. A screen recording on a loaded
    emulator cannot say whether a frame was dropped by the app, the emulator
    or the recorder, so this needs **his phone**.
  - **Not a transition finding, noticed on the way:** a people thread opens
    onto its bubble skeleton for about a second while its messages load,
    though the chats list already holds the last message. Seeding the thread
    with it is a design question.
  The method is the keyboard's (`chat/SPEC.md`, "frame by frame"): a 60 fps
  screen recording, split into frames with ffmpeg, one column or crop compared
  across frames. It is not written up in `qa/QA_HANDBOOK.md` yet.
- The owner naming a transition he dislikes. His word decides taste. This
  file only says the research does not.
- One cheap candidate to try at a device slot, not a change: `sign-in → chat`
  is a `router.replace`, which animates as a push. That makes signing in look
  like going one level deeper. `animation: "fade"` on that one screen would
  read as arriving. Decide from the recording.
