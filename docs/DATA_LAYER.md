# The data layer: server data lives in React Query

The owner, 2026-11-13: *"make sure it's in ALL apps, it's important."* This
file is the rule, the guard that enforces it, what is exempt and why, and
how the audit that wrote it was done. Notes keeps its own (the Notes session
applies the same rules there).

## The rules

1. **Server data is read with `useQuery` / `useInfiniteQuery` and written
   with `useMutation`.** Not with a request inside `useEffect`, not with
   `await xxxApi.m()` in an event handler whose answer goes into
   `useState`, not by copying it into a zustand store. Stores hold UI and
   device state only: theme, language choice, drafts, the upload engine's
   queue (below).
2. **Every key comes from a factory** in `src/api/keys.ts`, one per app:
   `profileKeys`, `aiKeys`, `conversationKeys`, `notificationKeys`,
   `calendarKeys`, `contactsKeys`, `pagesKeys`, `safezoneKeys`. Each has
   `all`, the prefix that invalidates the whole app; the other members name
   one thing once. A literal key at a call site is how Home and the chat
   header came to fetch the unread count under two names.
3. **A mutation whose result the person sees at once is optimistic:**
   `onMutate` cancels the affected queries, snapshots them and writes the
   new state; `onError` puts the snapshot back; `onSettled` invalidates
   exactly the keys the write touched (the list AND the detail, never just
   one). Each is tested for both the optimistic write and the rollback with
   `src/__tests__/queryClient.ts`.
4. **SafeZone's secrets never enter the cache.** Its lists are stripped in
   the API function before React Query sees them
   (`docs/design/safezone/SECURITY.md` §0). An item's detail is fetched
   outside React Query on purpose: React Query caches the RAW response
   BEFORE `select`, so even a `select` that strips the secrets would leave
   them in the cache. `safezoneKeys` therefore has no detail key.

## The guard

`.eslintrc.js`, rule id `api-in-effect` (a `no-restricted-syntax`): an
`xxxApi.m()`, `http.m()` or `fetch()` call anywhere inside a `useEffect` /
`useLayoutEffect` callback fails lint. Calling a mutation's `mutate()` from
an effect is allowed (a write fired on open, like mark-read), and so is
`xxxApi.parse*()` (pure parsers for cable frames).

It is proven both ways by `src/__tests__/eslintRules.test.ts`: the fixture
`eslint-fixtures/api-in-effect.tsx` must be flagged three times (an `…Api`
call, `http`, `fetch`), and `eslint-fixtures/clean.tsx` holds the allowed
forms, which must not be.

**What it does not cover:** a request reached through a helper defined
outside the effect, an API object not named `…Api`, and server data put
into `useState` from an event handler. The audit's scan (below) is the
wider net, run by hand.

## Exempt, with the reason

| Where | Why it is not React Query |
|---|---|
| `src/stores/uploads.store.ts` | the resumable upload engine: a queue of device files, chunked PUTs and retries that outlive any screen. It is device state; it tells React Query when it is done by invalidating `pagesKeys.all` |
| `src/stores/reachability.store.ts` | a health ping, not data: it answers "is the server there", and the offline banner reads that |
| SafeZone `item.tsx` `safezoneApi.show` | secrets (rule 4) |
| `src/stores/readAloud.store.ts` `speechApi.forMessage` | the playback engine asks for a SIGNED audio URL at the moment of playing; a cached one can expire under it, so there is nothing a cache would add but a dead link |
| the sign-in answer in `auth.store` | it IS the session, like the token; the profile itself is `useMe()` → `profileKeys.me()` |

## How it was found

A TypeScript-AST scan of `app/` and `src/` (outside `src/api/`) for: API
calls inside effects; API calls outside any `useQuery`/`useMutation`
option object; mutations without `onMutate`; literal query keys. Every hit
was then classified by hand. The audit's findings per app and what was done
about each are in `docs/REACT_QUERY_AUDIT_2026-11-13.md`.

## In CLAUDE.md

Applied to CLAUDE.md ("Data layer") on 2026-11-13, at the owner's request.
