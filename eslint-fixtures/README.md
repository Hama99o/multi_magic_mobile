# Files that are SUPPOSED to fail lint

Every custom `no-restricted-syntax` rule in `.eslintrc.js` has a fixture here
containing exactly the shape it forbids, and
`src/__tests__/eslintRules.test.ts` runs ESLint over them and fails if a rule
does not fire.

It exists because of `67f698b`. A rule was added, believed because it caught
the instance in front of it, and its first selector — `:has(> JSXOpeningElement
> JSXAttribute[…])` — is not supported by this esquery. It matched **nothing**,
forever, and linted perfectly clean while doing so. A rule that cannot fire is
indistinguishable in CI from a rule that passes, and it is worse than no rule
because it occupies the slot where somebody would notice the gap.

`clean.tsx` is the other half: the legitimate forms each rule must NOT flag. A
rule that fires on everything is caught by the same test.

These files are excluded from `tsconfig.json` and from the normal lint run, and
nothing imports them. The test lints them explicitly with `--no-ignore`.

**When you add a custom rule, add a fixture. When you change a selector, run
`npx jest eslintRules`.**

## Every rule here has a written blind spot

Each rule in `.eslintrc.js` carries a `DOES NOT COVER:` paragraph naming the
shapes of the same bug it cannot see — a function `style` on a component not
spelled `Pressable`, a dynamic `import()`, a `selectable` and a long press in
two different files, an English sentence in a `<Text>` child.

That last one is why the habit exists. The commit that added the accessibility
rule fixed two hints in `PersonMessageRow.tsx`; three English literals in
visible text survived it, one of them two lines away, and one of those was a
button's entire accessible name. A gate aimed at one shape of a bug will watch
the other shape walk past it in the same file on the same day.

**So name the shape a rule does not cover, in the rule.** A fixture proves a
rule can fire; the paragraph beside it says what firing does not mean.
