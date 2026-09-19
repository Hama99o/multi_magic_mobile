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
module.exports = {
  extends: ["expo"],
  rules: {
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
