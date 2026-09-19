/**
 * Lifted from karwan-mobile, minus the rule that does not apply here.
 *
 * NOT CARRIED OVER: Karwan's `no-restricted-syntax` ban on physical spacing
 * utilities (`pl-`, `mr-`, `text-left`…). That rule exists because Karwan ships
 * Pashto and Dari and a physical utility does not flip under RTL, so it ships a
 * mirrored bug. This app is English and LTR — `config/locales/` in multi_magic
 * holds only `en.yml` — so the same rule here would be cargo: a warning with no
 * failure behind it, which teaches people to ignore warnings.
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
       */
      {
        selector: "CallExpression[callee.name='require'] > :first-child:not(Literal)",
        message:
          "require() needs a string LITERAL — Metro resolves requires statically and a variable makes the app unbundleable, while Node and Jest accept it. One try/catch per module with the name written out; see src/stores/readAloud.store.ts and docs/TESTING.md §1.",
      },
    ],
  },
  ignorePatterns: [
    "node_modules/",
    "coverage/",
    ".expo/",
    "docs/",
    "*.config.js",
  ],
};
