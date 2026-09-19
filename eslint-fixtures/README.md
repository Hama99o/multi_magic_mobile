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
