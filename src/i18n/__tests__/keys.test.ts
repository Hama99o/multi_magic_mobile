/**
 * EVERY KEY THE APP CALLS RESOLVES — in both languages.
 *
 * i18next's answer to a key it does not have is THE KEY ITSELF, rendered on
 * the screen: a row that should read "12 messages" reads `sessions.messages`.
 * Nothing throws, `tsc` is happy — the key is a string — and a component test
 * that asserts on a testID never looks at the words. So this file walks the
 * source, collects every `t("…")` actually written, and asks the initialised
 * instance for each one.
 *
 * ── It reads the SOURCE rather than a list ───────────────────────────────
 * A written list would agree with itself. This greps the files the app ships,
 * so a key added to a screen tomorrow is checked tomorrow without anybody
 * remembering this file exists.
 *
 * ── And it is the reason a static check is not enough ────────────────────
 * Written after a sibling session's line-based scan of `en.ts` reported 15
 * keys as missing. They were all present; their VALUES sit on the following
 * line, and a parser reading `key: "value"` pairs one line at a time cannot
 * see them. Resolving through i18next is the only check that cannot be fooled
 * by the formatting — and it catches the real thing the scan was looking for.
 */
import fs from "fs";
import path from "path";
import i18n from "..";

const ROOTS = ["app", "src"];
/**
 * `t("…")` and `translate("…")`.
 *
 * `translate` is `import { t as translate }` — the module-level `t`, aliased
 * because these call sites are outside a component and cannot use the hook
 * (`DeleteConfirm.tsx:28`, `sign-up.tsx:38`). The first version of this grep
 * knew only about `t(`, so every key reached through the alias was never
 * resolved by the test below and never counted as called by the one at the
 * foot of the file. `ALIASES` is checked against the source, so a third
 * spelling fails here instead of quietly shrinking what is covered.
 */
const ALIASES = ["translate"];
// All three quote characters, per `docs/TESTING.md` §10 applied to this file:
// the first version matched a double quote only, which is a hypothesis about
// how people write rather than a fact about the code. Nothing in the repo uses
// the other two today and nothing enforces that, which is the whole point —
// the spelling a grep knows is the finding waiting to happen.
const CALL = new RegExp(
  `\\b(?:t|${ALIASES.join("|")})\\(\\s*(["'\`])([a-zA-Z][\\w.]*)\\1`,
  "g",
);
const ALIASED_IMPORT = /\bt\s+as\s+(\w+)/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "node_modules" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every `t("…")` written in a shipped file, with where it was written. */
function calledKeys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(CALL)) {
        if (!found.has(match[2])) found.set(match[2], file);
      }
    }
  }
  return found;
}

/**
 * Keys built at the call site from a variable — `t(\`session.${reason}\`)`,
 * `t(app.labelKey)`. The grep cannot see them, so they are listed, and the
 * list is short on purpose: a key a reader cannot grep for is a key nobody
 * can find when it is wrong.
 */
const COMPOSED = [
  "session.expired",
  "session.revoked",
  "appearance.system",
  "appearance.light",
  "appearance.dark",
  "scope.notes",
  "scope.pages",
  "scope.contacts",
  "scope.todos",
  "scope.money",
  "scope.flow",
  "scope.calendar",
  "signUp.firstName",
  "signUp.lastName",
  "signUp.email",
  "signUp.password",
  "signUp.missingFirstName",
  "signUp.missingLastName",
  "signUp.missingEmail",
  "signUp.missingPassword",
];

/** Plurals live as `key_one` / `key_other`; the call site asks for `key`. */
const PLURAL = new Set(["sessions.messages", "sessions.files", "deleteConversation.questionWithFiles"]);

const CALLED = calledKeys();
const ALL = [...new Set([...CALLED.keys(), ...COMPOSED])].sort();

describe("the keys the app actually calls", () => {
  it("found a realistic number of them, so the grep is not silently broken", () => {
    expect(CALLED.size).toBeGreaterThan(200);
  });

  it("knows every name `t` is imported under, so the grep cannot go blind", () => {
    const unknown = new Set<string>();
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        for (const match of fs.readFileSync(file, "utf8").matchAll(ALIASED_IMPORT)) {
          if (!ALIASES.includes(match[1])) unknown.add(`${match[1]} (in ${file})`);
        }
      }
    }
    // Add the alias to ALIASES above — not to this expectation.
    expect([...unknown]).toEqual([]);
  });

  describe.each(["en", "fr"])("in %s", (language) => {
    beforeAll(async () => {
      await i18n.changeLanguage(language);
    });
    afterAll(async () => {
      await i18n.changeLanguage("en");
    });

    it("resolves every one to a sentence rather than to the key", () => {
      const unresolved = ALL.filter((key) => {
        const resolved = PLURAL.has(key) ? i18n.t(key, { count: 2 }) : i18n.t(key);
        return typeof resolved !== "string" || resolved === key || resolved.trim() === "";
      }).map((key) => `${key} (called in ${CALLED.get(key) ?? "a composed call"})`);

      expect(unresolved).toEqual([]);
    });

    it("leaves no interpolation unfilled in a key that takes one", () => {
      const leaky = ALL.filter((key) => {
        const raw = i18n.getResource(language, "translation", key);
        if (typeof raw !== "string" || !raw.includes("{{")) return false;
        // Filled with every placeholder the string names.
        const values = Object.fromEntries(
          [...raw.matchAll(/\{\{(\w+)\}\}/g)].map((m) => [m[1], "x"]),
        );
        return i18n.t(key, values).includes("{{");
      });

      expect(leaky).toEqual([]);
    });
  });
});

describe("the plural keys", () => {
  it.each([...PLURAL])("%s has a form for one and for many", (key) => {
    expect(i18n.t(key, { count: 1 })).not.toBe(key);
    expect(i18n.t(key, { count: 5 })).not.toBe(key);
    expect(i18n.t(key, { count: 1 })).not.toBe(i18n.t(key, { count: 5 }));
  });
});

/**
 * THE OTHER DIRECTION, WHICH NOTHING ASKED UNTIL A KEY WENT UNUSED.
 *
 * Everything above starts from the calls and asks whether the key exists.
 * `calendar.event` was the reverse: written in `en.ts`, written in `fr.ts`,
 * asserted by `locales.test.ts`, listed in `docs/LANGUAGES.md` — and called
 * by nobody, while `EventRow` interpolated its own English template beside
 * it. Three gates agreed the translation was present. None of them asked
 * whether anything wanted it.
 *
 * An unused key is not a broken screen, which is why it can sit for weeks. It
 * is the SIGN of one: a key is written because a string was going somewhere,
 * so a key with no caller means the string went somewhere else, and "somewhere
 * else" is a literal in a component — untranslated by definition.
 *
 * Deliberately no allowlist. A key kept for later is a key nobody can tell
 * from a key that was forgotten.
 */
describe("the keys the app defines", () => {
  /** `{ a: { b: "x" } }` → `a.b`, with plural suffixes folded back to the
   *  name the call site actually writes. */
  function definedKeys(node: unknown, prefix = ""): string[] {
    if (typeof node !== "object" || node === null) return [];
    return Object.entries(node).flatMap(([key, value]) => {
      const dotted = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") {
        return [dotted.replace(/_(zero|one|two|few|many|other)$/, "")];
      }
      return definedKeys(value, dotted);
    });
  }

  it("is called by something, every one of them", () => {
    const wanted = new Set(ALL);
    const orphans = [...new Set(definedKeys(i18n.getResourceBundle("en", "translation")))]
      .filter((key) => !wanted.has(key))
      .sort();

    expect(orphans).toEqual([]);
  });
});
