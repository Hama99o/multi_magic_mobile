# The React Compiler's list: 22 → 11, and why the eleven stop

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

### Device-bound — 8

| Where | n | Why it needs a device |
|---|---|---|
| `app/chat/[id].tsx` | **7** | The unread-divider anchor, latched on a ref during render because recomputing it slides the divider one message further down with every message received — its own comment says so. The compiler-clean form changes **where the divider lands**, which no unit test can see and which `06-people-chat` passed on hours ago. |
| `app/profile.tsx` | 1 | Seeding the form from the loaded profile. The clean form is a keyed sub-component, which restructures the screen `13-profile` runs against. |

### Blocked on a test that does not exist — 1

| `src/hooks/useDraft.ts` | 1 | **There is no `useDraft` test file.** Refactoring the one hook that decides whether somebody's half-typed question survives, with nothing watching, is the trade this file refuses. A test first, then the refactor — and the test is worth having whether or not the refactor happens. |

### Doable, not device-bound, but not small — 2

| `src/hooks/useConversation.ts` | 1 | `setMessages([])` and friends when the conversation id changes. Covered by `useConversation.test.ts`, so it can be done safely; the clean form keys the hook from its caller, which is the chat spine. |
| `src/hooks/useSpeechToText.ts` | 1 | `setAvailable(recogniserPresent())` syncing to a native module. The clean form is `useSyncExternalStore`. Tested — but the mic cannot be verified in Expo Go at any SDK, so a real check needs a dev build anyway. |

## Turning the rules back on

The three in `.eslintrc.js` are still `off`. They go back to `error` when the
eleven are done, and the file that lists them is this one.
