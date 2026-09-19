# The React Compiler's list: 22 → 11, and what each of the eleven waits on

`eslint-config-expo@57` turns on the React Compiler rules. **Eleven of the
twenty-two are fixed and committed.** The remaining eleven are listed below
with the reason each stops, so the number is something to act on rather than a
wall.

None of the twenty-two was SDK 57 breakage. Every one behaved under 57 exactly
as it did under 54. They are a new standard, and this is the work of meeting
it.

## Done — 11

| What | Where | The shape |
|---|---|---|
| Latest-callback refs written during render | `useSpeechToText`, `useAssistantEcho`, `useConversation` | moved into an effect; every read is in a callback or a socket frame, never a render |
| `useRef(new Animated.Value(…)).current` | `ThinkingDots` (4 of the 22 on one line) | `useState` with an initialiser — also stops constructing a throwaway value per render |
| `useState(seed)` + an effect re-seeding on `[visible, initial]` | `RenameDialog`, `InstructionsDialog`, `ScopeDialog` | the state exists only while the dialog does; a `key` on the seed covers the rest |
| A component skipped whole over `user?.id` in a dep array | `app/chat.tsx` | one narrowed local |

**Two of those found holes that nothing watched**, and both now have tests that
go red when the fix is removed: a stale `onFinal` in `useSpeechToText` (every
test in the file stayed green with the ref update deleted outright), and the
`key` branch in `ScopeDialog` (all ten green without it).

## Left — 11, and what each is waiting on

### RESERVED FOR THE DEVICE PASS — 8. Do not pick these up cold.

They ride along with the rebuild the merge already requires, so they cost one
extra pass on screens that pass, not a campaign. Taken without a device they
are a silent behaviour change on two screens QA has already signed off.

| Where | n | What only a device can tell you |
|---|---|---|
| `app/chat/[id].tsx` | **7** | The unread-divider anchor, latched on a ref during render because recomputing it slides the divider one message further down with every message received — its own comment says so. The compiler-clean form changes **where the divider lands**. No unit test can see that, and `06-people-chat` passed on this screen. |
| `app/profile.tsx` | 1 | Seeding the form from the loaded profile. The clean form is a keyed sub-component, which restructures the screen `13-profile` runs against. |

### Blocked on a test that did not exist — 1 → now unblocked

`src/hooks/useDraft.ts`. **The test landed** — eleven of them, on `main` in
`e80426e`, written for their own sake rather than as a step toward this. Three
planted breaks, and the third caught a vacuous test of mine before it shipped.
The refactor itself is now safe to attempt and has not been done.

### Reclassified after looking properly — 2

Both were listed as "doable, not small". Having tried, that was optimistic:

| `src/hooks/useConversation.ts` | 1 | **Not contained.** The compiler-clean form collapses four `useState`s into one object tagged with the conversation id, and there are **23 setter call sites** in the file. It is the chat spine — the socket subscription, the resync, the pending-question tracking. Its tests are good and would catch a lot; "a lot" is not the same as the resync ordering. |
| `src/hooks/useSpeechToText.ts` | 1 | Doable — `useSyncExternalStore` over the AppState subscription — but **unverifiable**: the mic is in no Expo Go at any SDK, so nothing confirms it until a dev build exists. It should ride with the rebuild for the same reason the eight do. |

One free thing came out of reading it: that effect contained
`setStatus(conversationId == null ? "loading" : "loading")` — both branches the
same value, a ternary that said nothing while reading as though it did. Gone.

## Turning the rules back on

The three in `.eslintrc.js` are still `off`. They go back to `error` when the
eleven are done, and the file that lists them is this one.
