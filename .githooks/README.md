# The hook in here is off

Nothing in this directory runs until someone points git at it. Git only ever
looks in `.git/hooks`, which is not tracked, so a file committed here changes
nothing for anybody — including a session mid-run on this repo right now.

Turning it on is one line, and it is **per clone, per person**:

```sh
git config core.hooksPath .githooks
```

Off again:

```sh
git config --unset core.hooksPath
```

## What `pre-commit` does

`npm run lint`, then `npm run typecheck`, then `npm run bundle` — but the last
one **only when the staged diff touches how a module is loaded**: a config file
that decides resolution, an added `require(`, an added dynamic `import(`, or an
added import of a package rather than a relative path or the `@/` alias. It
prints which way it decided. `MM_BUNDLE=1` forces the export, `MM_BUNDLE=0`
skips it.

Measured on this machine: **19 s** when it skips the export, **42 s** when it
runs it.

It does not run the tests, and it cannot see your index. Both are argued in the
hook's own comments.

## It checks your node first, and that is not a formality

A git hook runs in a bare, non-interactive environment. nvm has never been
sourced there, so `node` is the system default — on this machine that is v18
while `.nvmrc` says v22. Under node 18 the export dies thirty seconds in with

```
TypeError: configs.toReversed is not a function
```

thrown from inside `metro-config`, naming neither node nor a version nor
anything you touched. It reads exactly like a broken tree.

The hook therefore compares `node -v` against `.nvmrc` before it runs anything,
and refuses in milliseconds with a sentence saying your commit is fine and your
PATH is not. This was not theoretical: it is what happened the first time the
hook was run for real.

## Why it is worth having, and why it is off anyway

The case for it is `5e37367`: a `require()` with a variable argument, green on
three gates, and an app that could not start for seven hours. The bundle gate
was in CI the whole time and nobody ran it locally. `docs/TESTING.md` §1 has
the full account.

The case against enabling it for everyone is thinner than it looks, but real:

- **The eslint rule is the better half of this answer.** `.eslintrc.js` now
  rejects a `require()` whose argument is not a string literal, which catches
  that exact class in milliseconds on a gate that already runs everywhere,
  including CI and every editor. This hook is the belt to that rule's braces —
  it catches the *other* ways a tree stops bundling, which are rarer.
- **A slow hook gets `--no-verify`d**, and a gate that is routinely bypassed is
  worse than one that was never installed, because people believe it ran. That
  is why the export is conditional rather than unconditional.
- **It changes how committing feels for every session working in this repo**,
  and that is not a decision a single session should make on its own behalf.

So: tracked, argued, and left for whoever owns the repo to switch on.
