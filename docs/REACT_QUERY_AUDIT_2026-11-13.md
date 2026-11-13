# React Query audit, 2026-11-13

The owner: *"make sure it's in ALL apps, it's important."* The rules and the
guard are `docs/DATA_LAYER.md`; this is what was found and what was done,
app by app. Notes was done by the Notes session on its own branch and is not
counted here. Branch `chore/react-query-audit` (from main `7f1ae32`), plus
SafeZone on `feat/safezone-app`.

## How it was found

A TypeScript-AST scan of `app/` and `src/` (outside `src/api/`) for API calls
inside effects, API calls outside any `useQuery`/`useMutation`, mutations
without `onMutate`, and literal query keys; then every hit classified by
hand. Two "effect" hits were false positives (`messagesApi.parseOne`, a pure
parser), and so is `startPlace` in the move sheet (it IS that sheet's
`queryFn`, passed by reference).

## Findings and what was done

| App | Found | Done |
|---|---|---|
| All | no key factory; ~110 literal keys; Home and the chat header read the unread count under two keys | `src/api/keys.ts`, one factory per app, every literal replaced (33 files); the duplicate is one key; `queryKeys.test.ts` reads factory tuples (generic params keep literals literal) |
| Guard | none | lint rule `api-in-effect`, fixture fires 3×, `clean.tsx` allowed forms, planted in a real screen: red |
| Pages | 13: a fetch in an effect (move sheet), 11 hand-rolled writes, keys | move sheet → `useQuery(pagesKeys.moveStart)`; `usePageMutations.ts`: star, rename, trash + Undo, restore, delete for ever, empty, move OPTIMISTIC in every list a node sits in; new folder a plain mutation; a found folder read through `fetchQuery` |
| Calendar | 5: 2 hand-rolled writes, 2 non-optimistic, keys | `useCalendarMutations.ts`: delete, answer, guest access, remove guest OPTIMISTIC; invite, leave, save plain (reasons in the file); exact keys, not the whole calendar |
| Contacts | 12: 5 hand-rolled, 6 non-optimistic, keys | `useContactMutations.ts`: favourite, delete, restore, delete for ever, unlink OPTIMISTIC, shared by list, card and trash; save, merges, export plain mutations; exact keys |
| SafeZone (its branch) | 4 + 2 exempt | PIN status `useQuery`; unlock / enable / refresh mutations; `safezoneKeys` beside its API, lists under their own prefix; the item stays OUTSIDE the cache (secrets: React Query caches before `select`) |
| Assistant | 8: messages in useState (useConversation), ask, activate, feedback ×3, upload | ask, activate, feedback, undo, upload are mutations (behaviour unchanged). **useConversation: open, the last slice** (493 lines, cable + pending + resync; to be done with its tests running, not blind) |
| People chat | 6: mark-read in an effect, 5 hand-rolled | mark-read a mutation fired from the effect; send/edit/react/delete mutations; the outbox and server-counted reactions stay NOT optimistic on purpose (BRIEF.md §5) |
| Notifications | 2 | mark-read OPTIMISTIC (row + every badge), the old comment that claimed it corrected |
| Account | 9: the profile copied into zustand, change-password, profile ×3 and AI keys ×3 non-optimistic, the language store writing to the server | `useMe()` over `profileKeys.me()` (the store keeps the session only, six readers moved); name/about and AI key activate/remove OPTIMISTIC; photo and add-key plain; change-password a mutation; the language PATCH moved out of the store into `useChooseLanguage` |
| Home | 1 (keys) | done |
| Exempt (reasons in DATA_LAYER.md) | uploads engine, reachability ping, readAloud's signed URL, the sign-in session | written down |

## Tests

Optimistic + rollback per optimistic hook, via `src/__tests__/queryClient.ts`,
with the server's answer held by a gate so "before it answers" is a real
moment: `useContactMutations.test.tsx` (11), `useCalendarMutations.test.tsx`
(7), `usePageMutations.test.tsx` (8), `accountMutations.test.tsx` (6),
`useChooseLanguage.test.tsx` (3), `useMe.test.tsx` (3). Planted: a missing
rollback (red), the guard in a real screen (red).

**Measured so far:** lint and tsc on every slice; Jest on slice 1's suites
(contacts 192, queryKeys, hooks, components, pages, app). **Not yet run:** the
full suite on the later slices (the box's RAM went to the Notes device pass);
queued for the next window.
