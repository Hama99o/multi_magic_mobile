/**
 * THE LINT RULES ARE TESTED, BECAUSE ONE OF THEM COULD NOT FIRE.
 *
 * `67f698b` added a `no-restricted-syntax` rule and believed it because it
 * caught the instance in front of it. Its selector —
 * `:has(> JSXOpeningElement > JSXAttribute[…])` — is not supported by this
 * esquery. It matched **nothing**, and it linted perfectly clean while doing
 * so. In CI, in a diff and in a reviewer's eye, a rule that cannot fire is
 * identical to a rule that passes; it is worse than an absent rule, because it
 * occupies the slot where somebody would otherwise notice the gap.
 *
 * So every custom rule has a file in `eslint-fixtures/` containing exactly the
 * shape it forbids, and this runs the real ESLint over them. A rule that stops
 * firing — because a selector was edited, or esquery changed under it — turns
 * this red instead of turning everything green.
 *
 * It is the same instrument as `src/i18n/__tests__/keys.test.ts`'s inverse
 * check, pointed at the linter: every gate asks whether the code satisfies the
 * rules, and none asked whether the rules are capable of being broken.
 *
 * `clean.tsx` is the other direction. A selector that fires on the legitimate
 * form is a rule people will disable, and a disabled rule is `docs/TESTING.md`
 * §1.
 *
 * ── WHY A CHILD PROCESS AND NOT ESLint's NODE API ─────────────────────────
 * `import { ESLint } from "eslint"` dies on load under this preset:
 * `expo/src/winter/installGlobal` installs `structuredClone` as a getter, and
 * `@ungap/structured-clone` — which eslint's flat-config schema pulls in —
 * calls `Object.defineProperty` on it and throws "called on non-object". The
 * binary has no such problem, and running it is the closer analogue anyway:
 * this is the same `eslint` invocation CI makes, with the same config
 * resolution, rather than a library call that could diverge from it.
 */
import { execFileSync } from "child_process";
import path from "path";

interface LintMessage {
  ruleId: string | null;
  message: string;
  line: number;
}
interface LintResult {
  filePath: string;
  messages: LintMessage[];
}

interface Case {
  rule: string;
  fixture: string;
  /** Distinctive words from the rule's own message. */
  says: RegExp;
  /** How many places in the fixture must be flagged. */
  times: number;
}

const CASES: Case[] = [
  {
    rule: "a function `style` on Pressable",
    fixture: "pressable-function-style.tsx",
    says: /plain object/i,
    times: 1,
  },
  {
    rule: "a require() of a variable",
    fixture: "require-variable.ts",
    says: /string LITERAL/,
    times: 1,
  },
  {
    rule: "a selectable Text under a long press",
    fixture: "selectable-under-longpress.tsx",
    says: /eats the long press/i,
    times: 1,
  },
  {
    // FOUR, one per branch of the compound selector — a compound selector can
    // have dead branches and still look alive, which is this file's subject.
    rule: "a bare worded string in an accessibility attribute",
    fixture: "accessibility-literal.tsx",
    says: /screen reader reads this out/i,
    times: 4,
  },
];

const ROOT = path.resolve(__dirname, "..", "..");
const BIN = path.join(ROOT, "node_modules", ".bin", "eslint");

/** eslint exits non-zero when it finds errors, which is the expected case
 *  here, so the report is read off the failure as readily as off the success. */
function run(args: string[]): string {
  try {
    return execFileSync(BIN, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    const stdout = (e as { stdout?: string }).stdout;
    if (typeof stdout === "string" && stdout.trim() !== "") return stdout;
    throw e;
  }
}

/** `--no-ignore` — the fixtures are in `ignorePatterns` so the ordinary
 *  `npm run lint` does not fail on files that exist to fail. */
const REPORT: LintResult[] = JSON.parse(
  run(["--no-ignore", "--format", "json", "--ext", ".ts,.tsx", "eslint-fixtures"]),
) as LintResult[];

function restricted(fixture: string): LintMessage[] {
  const result = REPORT.find((r) => r.filePath.endsWith(path.join("eslint-fixtures", fixture)));
  if (!result) throw new Error(`eslint did not report on ${fixture} at all`);
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax");
}

describe("every custom rule can actually fire", () => {
  it.each(CASES)("$rule", ({ fixture, says, times }) => {
    // Matched on the rule's own words so a failure says WHICH rule went quiet.
    expect(restricted(fixture).filter((hit) => says.test(hit.message))).toHaveLength(times);
  });

  it("flags nothing in the legitimate forms of all four", () => {
    expect(restricted("clean.tsx").map((hit) => `${hit.line}: ${hit.message}`)).toEqual([]);
  });

  it("has a fixture for every custom rule, so a new rule cannot arrive untested", () => {
    // Asked of the resolved config rather than by parsing `.eslintrc.js`: a
    // rule added there without a case above fails here.
    const config = JSON.parse(run(["--print-config", "src/api/http.ts"])) as {
      rules?: Record<string, unknown[]>;
    };
    const [, ...selectors] = config.rules?.["no-restricted-syntax"] ?? [];

    expect(selectors).toHaveLength(CASES.length);
  });
});
