/**
 * ONE KEY, ONE SHAPE (2026-09-25).
 *
 * A React Query key is a promise about what is stored under it. df9b1f2 broke
 * one: the calendar screen stored a PAGE under ["calendar","upcoming",7] and
 * the assistant's suggestions read the same key as an ARRAY. Whichever loaded
 * last owned the shape, and calendar → back crashed the assistant. No test
 * could see it: every test gives each screen its own QueryClient, which is
 * right for a unit test and makes a shared-cache bug structurally invisible.
 *
 * So this reads the SHAPES, not the keys. The TypeScript compiler resolves,
 * for every cache access in app/ and src/:
 *   useQuery / useInfiniteQuery   the awaited return type of `queryFn`
 *   setQueryData                  its type argument, else the value's type
 *   getQueryData                  its type argument
 * and any two accesses whose keys can be EQUAL must have mutually assignable
 * types (and agree on infinite-or-not, since an infinite query stores pages).
 *
 * Keys: a string or number literal (or a const that resolves to one, like
 * WINDOW_DAYS) is itself; anything else is a wildcard, because a variable can
 * take any value, including the other screen's literal.
 *
 * The plant is the bug it exists for: put `calendarApi.upcoming(7)` back in
 * useStarterPrompts and this goes red.
 *
 * What it cannot see: a key built at runtime (none today; a non-literal key
 * FAILS here rather than being skipped), and invalidation, which reads no data.
 */
import path from "path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");

type Access = { where: string; key: string[]; type: ts.Type; infinite: boolean; what: string };

function program() {
  const config = ts.getParsedCommandLineOfConfigFile(path.join(ROOT, "tsconfig.json"), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  });
  if (!config) throw new Error("tsconfig.json could not be read");
  return ts.createProgram(config.fileNames, config.options);
}

function collect(): { accesses: Access[]; unreadable: string[]; checker: ts.TypeChecker } {
  const prog = program();
  const checker = prog.getTypeChecker();
  const accesses: Access[] = [];
  const unreadable: string[] = [];

  const keyOf = (node: ts.Expression, where: string): string[] | null => {
    if (!ts.isArrayLiteralExpression(node)) {
      unreadable.push(`${where}: a key that is not an array literal`);
      return null;
    }
    return node.elements.map((el) => {
      const t = checker.getTypeAtLocation(el);
      if (t.isStringLiteral()) return JSON.stringify(t.value);
      if (t.isNumberLiteral()) return String(t.value);
      return "*";
    });
  };
  const awaited = (t: ts.Type) => checker.getAwaitedType(t) ?? t;

  for (const file of prog.getSourceFiles()) {
    const rel = path.relative(ROOT, file.fileName);
    if (rel.startsWith("..") || rel.includes("node_modules") || rel.includes("__tests__") || /\.test\.tsx?$/.test(rel)) continue;
    if (!rel.startsWith("app/") && !rel.startsWith("src/")) continue;

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const where = `${rel}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
        const callee = node.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";

        if ((name === "useQuery" || name === "useInfiniteQuery") && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
          const props = new Map(
            node.arguments[0].properties
              .filter(ts.isPropertyAssignment)
              .map((p) => [p.name.getText(), p.initializer] as const),
          );
          const keyNode = props.get("queryKey");
          const fnNode = props.get("queryFn");
          if (keyNode && fnNode) {
            const key = keyOf(keyNode, where);
            const sig = checker.getTypeAtLocation(fnNode).getCallSignatures()[0];
            if (key && sig) {
              accesses.push({ where, key, type: awaited(checker.getReturnTypeOfSignature(sig)), infinite: name === "useInfiniteQuery", what: name });
            } else if (key) {
              unreadable.push(`${where}: a queryFn whose type the compiler could not read`);
            }
          }
        }

        if ((name === "setQueryData" || name === "getQueryData") && ts.isPropertyAccessExpression(callee) && node.arguments[0]) {
          const key = keyOf(node.arguments[0], where);
          let type: ts.Type | undefined;
          if (node.typeArguments?.[0]) type = checker.getTypeFromTypeNode(node.typeArguments[0]);
          else if (name === "setQueryData" && node.arguments[1]) {
            const value = checker.getTypeAtLocation(node.arguments[1]);
            // An updater function stores what it returns.
            const sig = value.getCallSignatures()[0];
            type = sig ? checker.getReturnTypeOfSignature(sig) : value;
          }
          // An untyped getQueryData reads `unknown`, which claims nothing.
          if (key && type) accesses.push({ where, key, type: checker.getNonNullableType(type), infinite: false, what: name });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { accesses, unreadable, checker };
}

const canBeEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i] || x === "*" || b[i] === "*");

describe("one query key, one shape", () => {
  const { accesses, unreadable, checker } = collect();

  it("reads every cache access in app/ and src/ (a gate that finds nothing measures nothing)", () => {
    expect(unreadable).toEqual([]);
    // Counted a second, dumber way: a regex over the same files. The two
    // must agree, so an access the walk misses (a new API, a wrapper) fails
    // here instead of passing unread. 24 on 2026-09-25.
    const files = ts.sys
      .readDirectory(ROOT, [".ts", ".tsx"], ["node_modules"], ["app/**/*", "src/**/*"])
      .filter((f) => !f.includes("__tests__") && !/\.test\.tsx?$/.test(f));
    const pattern = /\buse(?:Infinite)?Query(?:<[^>]*>)?\(\{|\.setQueryData(?:<[^>]*>)?\(|\.getQueryData<[^>]*>\(/g;
    const counted = files.reduce((n, f) => n + (ts.sys.readFile(f)?.match(pattern)?.length ?? 0), 0);
    expect(accesses.length).toBe(counted);
    expect(counted).toBeGreaterThan(20);
  });

  it("has keys shared between files, which is the case it exists for", () => {
    const shared = accesses.filter((a) =>
      accesses.some((b) => b !== a && b.where.split(":")[0] !== a.where.split(":")[0] && canBeEqual(a.key, b.key)),
    );
    // ["calendar","upcoming",7] (calendar + suggestions) and ["profile"]
    // (profile + the morning brief row), at least.
    expect(shared.length).toBeGreaterThanOrEqual(4);
  });

  it("stores and reads the same shape under every key that can be equal", () => {
    const clashes: string[] = [];
    for (let i = 0; i < accesses.length; i++) {
      for (let j = i + 1; j < accesses.length; j++) {
        const a = accesses[i];
        const b = accesses[j];
        if (!canBeEqual(a.key, b.key)) continue;
        const same =
          a.infinite === b.infinite &&
          checker.isTypeAssignableTo(a.type, b.type) &&
          checker.isTypeAssignableTo(b.type, a.type);
        if (!same) {
          clashes.push(
            `[${a.key.join(",")}]\n    ${a.where} ${a.what}: ${a.infinite ? "infinite " : ""}${checker.typeToString(a.type)}\n    ${b.where} ${b.what}: ${b.infinite ? "infinite " : ""}${checker.typeToString(b.type)}`,
          );
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});
