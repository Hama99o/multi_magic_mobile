# Instruments for the web: a recipe, from the mobile audit of 2026-09-24

Each instrument below found real bugs in `multi_magic_mobile` in one
evening. The web has none of them yet. **This is written to be executed by
someone working in `multi_magic`**: what each asks, how it enumerates, what it
cannot see, and the traps that made each one lie before it worked. The
mobile code is cited so you can read the working version.

Two rules come before every instrument, because every trap below broke one
of them.

1. **Plant the bug you claim to catch, watch it go red, restore.** A check
   that has never failed is a hypothesis. Eight of mobile's instruments were
   green on their first run and blind; every one was found by a plant.
   After a fix, **plant again**, because a fix can blind the check.
2. **Enumerate from what RENDERED, not from a list someone wrote.** A list of
   components to check misses the one nobody listed. Collect what is on
   screen and test that.

---

## 1. French render-twice: is anything untranslated?

**Asks:** does any string on screen stay the same in English and French?
A string that went through `t()` differs by construction; hard-coded English
is identical in both.

**How (mobile: `src/__tests__/i18nSweep.ts`, `identicalIn`):** render each page
in English and collect every text node, `aria-label`, `title` and
`placeholder`. Render it again in French and collect the same. Fail on any
string present in both, after two exemptions:
- **fixture data**: strings the test itself fed in (a note title, an event
  name), which are the user's words and not the app's;
- **a short allowlist** of words genuinely the same in both ("Notes",
  "Contacts", "Document", "Assistant", language names in themselves). Each
  entry names its key in the locale test's own same-in-both list, so the two
  lists cannot drift.

Keep a second, weaker net beside it: fail on any French-render string with
an English-only word (`the|you|your|is|are|what|when|with|this|that|…`, with
words shared by both languages left out). It fails on different things.

**What it found on mobile:** English "Today"/"Yesterday", "Sep 18" and "11:30
AM" in a French UI (dates followed the phone's region, not the app language),
"12.0 MB" beside "10 Mo" in one sentence, a whole chats list with no `t()`,
suggested questions that SENT English, and a hint naming a note by its
English title when the server names it in French.

**Cannot see:** whether French FITS (no layout, see §4), and text the SERVER
sends.

**Traps that made it lie, in order found:**
- **Sweeping before the page loaded.** It fired on the page title and found
  two strings on a list of fifteen: a sweep of the starting state is green
  for anything. Wait on named content: every handle, plus any text that
  arrives on its own request.
- **Fixture exemption fed by COMMENTS.** Excusing every quoted string in the
  test file excused the bugs the comments quoted ("11:30 AM"). Take literals
  from code only.
- **Quote-pairing slip.** A regex requiring 4+ characters inside quotes
  desynchronised after `"Qa"` and matched `", lastName: "` as a string. Match
  every literal, then drop short ones.
- **Excusing what the test ASSERTS.** A test titled "Ask again …" that asserts
  `getByText("Ask again")` excused a hard-coded "Ask again". Skip strings in
  test titles, query arguments and matcher arguments.
- **Whole-string allowlist.** "Assistant. <server sentence>" is legitimately
  identical. Cut allowed words and fixtures out, and test the residue.

## 2. States, not just the success path

**Asks:** does each FAILED, EMPTY and LOADING branch say something true, and
in French?

**How:** for each list or page, make its request fail twice, as a server error
and as a network failure with no response, and render. Then make it return
nothing and render. Run §1 and §5 on each. Mobile:
`screens.render.test.tsx` (FAILURES, EMPTIES), `chat.test.tsx` (every
assistant state).

**The claim to check by eye in each:** an empty state and a failed state must
never look the same. Mobile's worst finding: a conversation list that failed
to load rendered as "no conversations", beside a "New" button whose two
decisions read that empty list, so it made duplicates.

**Trap:** **a wait on a mock's call HISTORY passes on stale calls.** Rendering
twice in one test, the wait for "session loaded" matched the FIRST render's
call. Clear mocks between renders.

## 3. Claims: what does each surface assert, and can it be wrong?

**Asks, per page:** what does it claim (a time, a count, a status, a name),
where does the value come from, and can it be stale, absent or someone
else's?

**Search for these shapes:**
- **`??` fallbacks** where the app substitutes its own value when the server
  sends none. Mobile had English "Untitled" written into the model, which
  then became a suggested question.
- **The phone's clock computing a server fact.** Mobile's lent-key reset
  used the local month while the server counts UTC: in the first hours of a
  month in Paris it said a key returns in a month when it was minutes away.
- **A page read as the whole.** Mobile read page 1 of a 15-per-page list, so
  the sixteenth conversation was unreachable. Notifications were "bounded
  by 90 days", which bounds TIME, not count.
- **A spinner with no deadline:** a poll that never stops if a job never runs.
- **UI copy naming a server-generated thing** (a note title, a status word):
  both sides can be right and drift apart.

## 4. Does it FIT? Say honestly what can be measured

jsdom has no layout, and neither does mobile's renderer, so nothing there
measures a pixel. **The web has a real browser (`qa/web/run.sh`), so here
it can be measured.** At a narrow width in French, check for clipped or
overflowing text: `scrollWidth > clientWidth` on text containers, and any
`text-overflow: ellipsis` on a translated sentence. Where only a length proxy
exists, use it only against a FIXED width, and say that in the test.

## 5. Accessibility over what rendered

**Asks (mobile: `src/__tests__/a11ySweep.ts`):**
- every control has a name: a button or link by `aria-label` or its text, an
  input by its label or placeholder, a switch or checkbox by its label;
- nothing spoken is a raw key (`answer.bad`, what i18next returns for a
  missing one);
- a radio, checkbox or toggle exposes WHICH state (`aria-checked`,
  `aria-pressed`, `aria-selected`), not just a colour.

**Trap:** **"has a state" passed a silent radio**, because the framework adds
an empty state object by default. Ask which state, not whether one exists.
The same applies to any attribute a library fills in for you.

**Cannot see:** whether a name is RIGHT (a screen reader saying "button" for
everything passes), focus order, and target size. axe-core in the real
browser covers some of this; a person with a screen reader covers the rest.

## 6. Animation and async: assert the OUTCOME, and that it could fail

- **A spy on a constructor sees construction, not execution.** Mobile's
  animation tests spied on `Animated.timing` and passed for components that
  never called `.start()`, including a message left invisible. Assert what
  STARTED, and better, where the value ENDED UP.
- **An outcome assertion that holds at the starting state proves nothing.**
  "Ends visible" on something that starts visible is true before the feature
  exists. Make sure the asserted state had to be reached.

## 7. Across the seam

For every backend change, ask whether each client actually reads it. Mobile's
best finding of the night was here: the backend localised every pre-sign-in
error by `Accept-Language`, and **the phone sent no `Accept-Language`**, so
all of it would have arrived in English. Both sides were correct alone.
Check what the web SENDS as well as what it shows.
