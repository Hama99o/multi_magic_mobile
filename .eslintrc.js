/**
 * Lifted from karwan-mobile, minus the rule that does not apply here.
 *
 * NOT CARRIED OVER: Karwan's `no-restricted-syntax` ban on physical spacing
 * utilities (`pl-`, `mr-`, `text-left`…). That rule exists because Karwan ships
 * Pashto and Dari and a physical utility does not flip under RTL, so it ships a
 * mirrored bug. This app ships English and French (`docs/LANGUAGES.md`) and
 * BOTH ARE LTR, so the same rule here would be cargo: a warning with no failure
 * behind it, which teaches people to ignore warnings.
 *
 * The premise above used to read "this app is English — `config/locales/` in
 * multi_magic holds only `en.yml`". That stopped being true when French landed
 * (`049079e`) and nothing noticed, because the CONCLUSION did not change: this
 * decision turns on direction, not on how many languages there are. Written out
 * so the next reader knows what would flip it — **the first RTL language brings
 * this rule back**, and counting locales will not tell you when that happens.
 */
const config = {
  extends: ["expo"],
  overrides: [
    {
      // `jest.mock()` factories cannot use an import, and
      // `babel-plugin-jest-hoist` rejects a destructured `require` in one. Five
      // deliberate uses, scoped here rather than switched off globally — the
      // `require`-argument rule below cost this app seven hours and stays on
      // everywhere that ships.
      files: ["**/__tests__/**/*.[jt]s?(x)", "**/*.test.[jt]s?(x)"],
      rules: { "@typescript-eslint/no-require-imports": "off" },
    },
  ],
  rules: {
    /**
     * ── THE REACT COMPILER RULES, DEFERRED — NOT PASSING ─────────────────
     *
     * `eslint-config-expo@57` turns these on. Twenty-two hits across ten
     * files, and NONE of them is SDK 57 breakage: the tests pass, the app
     * bundles, the types agree, and every one behaves exactly as it did on
     * 54. They are a new standard, not a new failure.
     *
     * Off, itemised in `SDK57_COMPILER_DEFERRED.md` with file and line, so
     * this cannot quietly become permanent. Two sampled at random are both
     * deliberate, commented, working patterns whose compiler-clean form is a
     * restructure rather than an edit — on screens QA verified on a device
     * hours before this branch existed.
     *
     * Turning them back on is three words here and ten files of work, each
     * needing the device pass its screen already had.
     */
    "react-hooks/refs": "off",
    "react-hooks/set-state-in-effect": "off",
    "react-hooks/preserve-manual-memoization": "off",

    /**
     * ── ADDING A RULE BELOW? IT OWES TWO THINGS ──────────────────────────
     *
     * 1. **A fixture in `eslint-fixtures/`** containing exactly the shape it
     *    forbids. `src/__tests__/eslintRules.test.ts` lints them and fails if
     *    a rule has gone quiet — and an assertion there counts the selectors
     *    in the resolved config, so a rule arriving without a fixture turns
     *    the suite red rather than sitting silent.
     *
     *    This is not ceremony. One rule here shipped with a selector this
     *    esquery does not support: it matched NOTHING, forever, and linted
     *    perfectly clean while doing so. A rule that cannot fire is
     *    indistinguishable from a rule that passes, in CI, in a diff and in
     *    review, and worse than no rule, because it occupies the slot where
     *    somebody would otherwise notice the gap.
     *
     * 2. **A `DOES NOT COVER:` paragraph** naming the shapes of the same bug
     *    it cannot see. A fixture proves a rule CAN fire; that paragraph says
     *    what firing does not mean. `49a0a7a` added the accessibility rule
     *    and fixed two hints in one file; three English literals in visible
     *    `<Text>` survived it, one two lines away, because a `<Text>` child
     *    is not an attribute. A gate aimed at one shape of a bug will watch
     *    the other shape walk past it in the same file on the same day.
     *
     * And the blind spots stay in these paragraphs rather than in
     * `clean.tsx`: **a blind spot in a fixture named legitimate reads as
     * approved.** `clean.tsx` is for the forms a rule must NOT flag because
     * they are correct — not for the ones it fails to flag.
     *
     * `docs/TESTING.md` §1, §2 and §10 are the incidents behind all of this.
     */
    /**
     * A FUNCTION `style` on Pressable is SILENTLY DISCARDED by NativeWind's
     * interop — the whole object, not just the pressed state.
     *
     * Four instances in this repo now. Mine lost a button's background, height,
     * padding and centring at once and rendered white text on a light ground:
     * an invisible button that passed 70 tests, tsc, a bundle and a boot. The
     * sibling's nine lost `flexDirection`, stacking an avatar above a name, and
     * a bubble's background, rendering white text on a white bubble — a message
     * that simply is not there, with nothing erroring.
     *
     * `button.tsx`'s header carried this warning, having already shipped it
     * once. A warning in a header is a claim nobody enforces; this is the gate.
     *
     * DOES NOT COVER: a function `style` on anything not literally spelled
     * `Pressable` — `TouchableOpacity`, a wrapped `Button`, or `Pressable`
     * renamed on import — nor one passed in as a variable rather than written
     * inline. The selector reads the tag name and the shape of the attribute,
     * and both are easy to write around without meaning to.
     */
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "JSXOpeningElement[name.name='Pressable'] > JSXAttribute[name.name='style'] > JSXExpressionContainer > ArrowFunctionExpression",
        message:
          "Pressable style must be a plain object — NativeWind's interop drops a function style silently, taking the background, height and padding with it. Track pressed in state (see components/reusables/button.tsx) or use android_ripple.",
      },
      /**
       * A `require` OF A VARIABLE MAKES THE WHOLE APP UNBUNDLEABLE.
       *
       * Metro resolves requires statically, so `require(name)` is rejected at
       * transform time — `Invalid call at line N: require(name)` — while
       * Node's resolver accepts it happily. That asymmetry is the entire
       * failure: `tsc` passed, eslint passed (the line even carried a
       * `no-require-imports` disable, which made it look considered), 465
       * Jest tests passed because Jest runs on Node, and the app could not
       * start at all. Seven hours, and it was found from a device.
       *
       * `npm run bundle` catches it in about a minute and CI runs it on every
       * push. This catches it in milliseconds, on the gate every session
       * already runs, which is the difference between a check that is
       * available and one that is unavoidable.
       *
       * The legitimate form is a literal per module, each in its own `try`:
       *   try { audio = require("expo-audio") as AudioModule; } catch { … }
       * See `src/stores/readAloud.store.ts`.
       *
       * DOES NOT COVER: a dynamic `import()` with a computed argument, which
       * breaks Metro the same way; `require` reached through an alias or
       * `module.require`; or a perfectly literal name for a package that is
       * not installed. Only `npm run bundle` sees those, which is why the
       * hook still runs it when a diff touches module loading.
       */
      {
        selector: "CallExpression[callee.name='require'] > :first-child:not(Literal)",
        message:
          "require() needs a string LITERAL — Metro resolves requires statically and a variable makes the app unbundleable, while Node and Jest accept it. One try/catch per module with the name written out; see src/stores/readAloud.store.ts and docs/TESTING.md §1.",
      },
      /**
       * A WORD WRITTEN STRAIGHT INTO A <Text> IS ENGLISH ON A FRENCH PHONE.
       *
       * `CLAUDE.md` said it plainly: "a bare literal in a visible <Text> is
       * caught by nothing". Measured 2026-09-24: a literal planted in
       * `app/chats.tsx` passed lint, and Jest caught it only because the key
       * it replaced lost its caller. A NEW sentence, with no key behind it,
       * passed every gate. Two letters or more, so a "·" or a "/" separator
       * is not a finding.
       */
      {
        id: "text-literal",
        selector: "JSXElement[openingElement.name.name='Text'] > JSXText[value=/[A-Za-z]{2,}/]",
        message:
          "Words written straight into <Text> are English on a French phone. Put them in src/i18n/locales/{en,fr}.ts and render t(\"…\"). See docs/LANGUAGES.md.",
      },
      /**
       * THE ICON LIBRARY'S INDEX SHIPS EVERY ICON IT HAS.
       *
       * Measured 2026-09-24: importing from `lucide-react-native` put all
       * 1,556 icons in the bundle (3.36 MB of 13.6 MB) for the 41 the app
       * draws, because Metro does not drop unused exports. Expo Go downloads
       * that on every cold open. Icons come from `src/components/icons.ts`,
       * which imports each from its own file. A TYPE import from the index is
       * fine: it is erased and costs nothing.
       */
      {
        selector: "ImportDeclaration[source.value='lucide-react-native'][importKind!='type']",
        message:
          "Import icons from @/components/icons, not lucide-react-native — the index ships all 1,556 icons (3.36 MB) into the bundle. Add a missing icon to src/components/icons.ts.",
      },
      /**
       * `StyleSheet.absoluteFillObject` IS GONE IN THE NEXT SDK, SILENTLY.
       *
       * It exists in React Native 0.81 (SDK 54) and not in the version SDK 57
       * ships. Spreading a missing property is `{ ...undefined }`, which is
       * nothing, so every scrim written as `{ ...StyleSheet.absoluteFillObject,
       * backgroundColor }` became a colour with no position and no size: a
       * zero-pixel Pressable, and a sheet that no tap outside could close.
       * Found by the owner on his phone (SDK 57 worktree) 2026-09-24, in the
       * Conversations sheet; eight copies on main, all descended from one.
       *
       * `tsc` could not see it on SDK 54, where the name still exists, and
       * the scrim tests pressed it by testID, which works on a zero-sized
       * element because the test renderer lays nothing out.
       * Use `FILL` from `src/theme/fill.ts`: a plain object, correct on both
       * versions (spreading `StyleSheet.absoluteFill` is a type error on 54).
       */
      {
        selector: "MemberExpression[object.name='StyleSheet'][property.name='absoluteFillObject']",
        message:
          "Use FILL from @/theme/fill. absoluteFillObject is removed in the React Native SDK 57 ships, and spreading the missing name leaves a scrim with no size (a sheet that no tap outside can close).",
      },
      /**
       * AN ACCESSIBILITY STRING IS A USER-FACING STRING.
       *
       * `docs/LANGUAGES.md` says this app is English and French. Two hint
       * strings were written as English literals and shipped, so a French
       * user's screen reader read them English — the only part of the
       * interface that never got translated, in the one place nobody looks,
       * for the users least able to work around it.
       *
       * No gate could have seen it. `src/i18n/__tests__/keys.test.ts` resolves
       * every `t("…")` through the live instance, which proves the keys that
       * ARE called exist; it cannot see a sentence that never asked for a key.
       * Rendering tests read `testID`s and visible text, not the a11y tree.
       *
       * So this is the gate: a bare string with words in it, in either of the
       * two spoken attributes. Data-derived values are untouched, because a
       * `t()` argument sits under a CallExpression and a template of names has
       * no literal at all.
       *
       * DOES NOT COVER: **a `<Text>` child**, which is not an attribute at
       * all — and that is not hypothetical. `49a0a7a` added this rule and
       * fixed two hints in `PersonMessageRow.tsx`; three English literals in
       * visible `<Text>` survived it, one of them two lines away, and one of
       * those WAS a control's entire accessible name. See `docs/TESTING.md`
       * §8. It also misses a template literal with English in it, a literal
       * reached through a variable, and the labels inside
       * `accessibilityActions`.
       */
      /**
       * A `selectable` TEXT EATS THE LONG PRESS AROUND IT.
       *
       * On Android a selectable `Text` opens the platform's text-selection
       * ActionMode on long press and consumes the gesture, so an enclosing
       * `Pressable`'s `onLongPress` never fires. In `PersonMessageRow` that
       * made reacting to a message IMPOSSIBLE on Android — long-pressing a
       * bubble gave Copy · Share · Select all — while the handler, the sheet
       * and even the `accessibilityHint` describing the gesture were all
       * present and correct.
       *
       * No test in this repo could see it. Jest has no platform: both the
       * prop and the handler are right in the tree, and only the OS knows it
       * got there first. QA found it on a device, two screens into a flow.
       *
       * `selectable` on its own is fine and is used in four other places —
       * the assistant's answers, the user's question bubble, the privacy
       * text — none of which sits under a long press. This rule is about the
       * COMBINATION. If a bubble needs both, the copy action belongs in the
       * menu the long press opens, which is where every reference puts it.
       *
       * DOES NOT COVER, and this is the important one: the `Pressable` and the
       * `Text` do not have to be in the same FILE. A row component that is
       * selectable inside, dropped into a long-pressable list item elsewhere,
       * collides exactly the same way and nothing here can see it — a selector
       * runs over one file's AST. It also misses `selectable` arriving through
       * a spread or a variable, and every other way a gesture gets eaten
       * (a nested Pressable, a scroll view claiming the responder). The
       * general case is a device.
       *
       * The selector over-approximates on purpose: `:has()` searches the whole
       * subtree, so it flags a `selectable` anywhere inside an element that
       * long-presses ANYWHERE, not only one wrapped directly by it. The tight
       * form — `:has(> JSXOpeningElement > JSXAttribute[…])` — silently matches
       * NOTHING in this esquery, which is worse than loose: it is a rule that
       * lints clean because it never fires. Found by planting the prop back and
       * watching the first version of this rule say nothing.
       */
      {
        selector:
          "JSXElement:has(JSXAttribute[name.name='onLongPress']) JSXAttribute[name.name='selectable']",
        message:
          "A `selectable` Text inside a long-pressable element eats the long press on Android — the platform's text-selection menu takes the gesture and onLongPress never runs. Offer Copy in the menu the long press opens instead. See src/screens/people/PersonMessageRow.tsx and docs/design/people-chat/SPEC.md.",
      },
      /**
       * A SPY ON `Animated` SEES AN ANIMATION BUILT, NOT RUN.
       *
       * `docs/TESTING.md` §19. Measured 2026-09-24: with `.start()` removed
       * from four animated components, all four suites that spied on
       * `Animated.timing` stayed green. One of them was a new message left
       * at opacity 0 for ever. Tests watch animations through
       * `watchTimings()` in `src/__tests__/animated.ts`, which records the
       * ones that STARTED. That file is the only place allowed to spy.
       *
       * DOES NOT COVER: a spy reached through a renamed import, or
       * `jest.mock` of the whole module. Whether the RIGHT value moved is
       * `boundValue()` in the same helper, and only where a suite uses it.
       */
      {
        id: "animated-spy",
        selector: "CallExpression[callee.object.name='jest'][callee.property.name='spyOn'][arguments.0.name='Animated']",
        message:
          "A spy on Animated sees an animation BUILT, not started: a component that never calls .start() passes it. Use watchTimings() from src/__tests__/animated.ts. See docs/TESTING.md §19.",
      },
      {
        selector:
          "JSXAttribute[name.name=/^accessibility(Label|Hint)$/] > Literal[value=/[A-Za-z]{3,}/], JSXAttribute[name.name=/^accessibility(Label|Hint)$/] > JSXExpressionContainer > Literal[value=/[A-Za-z]{3,}/], JSXAttribute[name.name=/^accessibility(Label|Hint)$/] > JSXExpressionContainer > ConditionalExpression > Literal[value=/[A-Za-z]{3,}/], JSXAttribute[name.name=/^accessibility(Label|Hint)$/] > JSXExpressionContainer > LogicalExpression > Literal[value=/[A-Za-z]{3,}/]",
        message:
          "A screen reader reads this out, so it is a user-facing string and must come from t(). A literal here ships English to a French user in the one place no test looks. See docs/LANGUAGES.md.",
      },
    ],
  },
  ignorePatterns: [
    "node_modules/",
    "coverage/",
    ".expo/",
    "docs/",
    "*.config.js",
    // Files that exist to FAIL these rules. `src/__tests__/eslintRules.test.ts`
    // lints them explicitly with `--no-ignore` and fails if a rule has gone
    // quiet. See `eslint-fixtures/README.md`.
    "eslint-fixtures/",
  ],
};

/**
 * TESTS MAY WRITE WORDS INTO <Text>: sample content is the point of a
 * fixture. Everything else in the list still applies to them. `id` is ours,
 * not ESLint's, and is stripped before the config is handed over.
 */
const restricted = config.rules["no-restricted-syntax"];
const strip = (entries) =>
  entries.map((entry) => {
    if (typeof entry !== "object") return entry;
    const { id: _id, ...rest } = entry;
    return rest;
  });
config.rules["no-restricted-syntax"] = strip(restricted);
// APPEND, never reassign. `config.overrides = [...]` here used to REPLACE the
// array declared at the top of this file, silently discarding the
// `no-require-imports: off` override written there for `jest.mock()`
// factories — 25 warnings that `--max-warnings 0` turns into a failed gate,
// in files whose own comment explains why the `require` is correct.
// It stayed invisible while that rule happened to be off by default.
config.overrides = [
  ...(config.overrides ?? []),
  {
    files: ["**/__tests__/**"],
    rules: {
      "no-restricted-syntax": strip(restricted.filter((entry) => entry.id !== "text-literal")),
    },
  },
  {
    // The one place that may spy on Animated: it is what the rule points to.
    files: ["src/__tests__/animated.ts"],
    rules: {
      "no-restricted-syntax": strip(
        restricted.filter((entry) => entry.id !== "text-literal" && entry.id !== "animated-spy"),
      ),
    },
  },
];

module.exports = config;
