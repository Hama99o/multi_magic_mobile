#!/usr/bin/env node
/**
 * PANE-NAV CODEMOD (docs/design/workspace/SPEC.md §C3).
 *
 * Moves screens off expo-router's `router` singleton and `useLocalSearchParams`
 * onto `useNav()` / `useNavParams()` from `@/lib/nav`, so a screen inside a
 * Workspace pane moves its pane and not the whole app.
 *
 *   node scripts/codemods/paneNav.js            # dry run: what would change, what is skipped
 *   node scripts/codemods/paneNav.js --write    # apply
 *
 * It is MECHANICAL and IDEMPOTENT: a second run changes nothing. A branch
 * that predates it does not resolve 89 files of conflicts by hand. It takes
 * the other side and re-runs this.
 *
 * What it does, per file in app/ and src/ (tests excluded):
 * - every component or hook (a function named `Capital…` or `use…`, or a
 *   default export) that refers to the imported `router` gets
 *   `const router = useNav();` as its first statement. Callbacks inside it
 *   keep closing over the same name, so no other line changes;
 * - every call of the imported `useLocalSearchParams` becomes `useNavParams`
 *   (type arguments kept);
 * - the two names leave the `expo-router` import, and one
 *   `import { … } from "@/lib/nav";` arrives after it.
 *
 * What it SKIPS, and says so (they are the hand-fix list):
 * - a file where `router` is used outside any component or hook (a module
 *   helper, `openApp`, a deep-link handler). Those navigate the whole app on
 *   purpose, or need a nav passed in. The lint rule allows the first kind by
 *   name;
 * - a component written as an expression-bodied arrow (`() => router…`): no
 *   body to put the hook in;
 * - a type-only import (`import type { router }`).
 *
 * It edits the source TEXT at the AST's positions and never reprints, so a
 * file's formatting is untouched except on the lines it changes.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const { parse } = require(path.join(ROOT, "node_modules/@babel/parser"));
const traverse = require(path.join(ROOT, "node_modules/@babel/traverse")).default;

const NAV_MODULE = "@/lib/nav";
const isOwnerName = (name) => typeof name === "string" && (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name));

/** The name a function goes by: its own, the variable it is assigned to, or "default". */
function functionName(fnPath) {
  const n = fnPath.node;
  if (n.id && n.id.name) return n.id.name;
  if (fnPath.parentPath.isVariableDeclarator() && fnPath.parentPath.node.id.type === "Identifier") return fnPath.parentPath.node.id.name;
  if (fnPath.parentPath.isExportDefaultDeclaration()) return "default";
  return null;
}

/** The nearest enclosing component or hook, or null when the reference is at module level or in a plain helper. */
function ownerOf(refPath) {
  for (let fn = refPath.getFunctionParent(); fn; fn = fn.parentPath.getFunctionParent()) {
    const name = functionName(fn);
    if (name === "default" || isOwnerName(name)) return fn;
  }
  return null;
}

/**
 * @param {string} code
 * @param {string} file for messages only
 * @returns {{ code: string, changed: boolean, skipped: string[] }}
 */
function transform(code, file = "<input>") {
  let ast;
  try {
    ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
  } catch (e) {
    return { code, changed: false, skipped: [`${file}: does not parse (${e.message})`] };
  }

  let importDecl = null;
  let routerLocal = null;
  let paramsLocal = null;
  traverse(ast, {
    ImportDeclaration(p) {
      if (p.node.source.value !== "expo-router" || p.node.importKind === "type") return;
      for (const s of p.node.specifiers) {
        if (s.type !== "ImportSpecifier" || s.importKind === "type") continue;
        if (s.imported.name === "router") routerLocal = s.local.name;
        if (s.imported.name === "useLocalSearchParams") paramsLocal = s.local.name;
      }
      if (routerLocal || paramsLocal) importDecl = p;
    },
  });
  if (!importDecl) return { code, changed: false, skipped: [] };

  const skipped = [];
  const edits = []; // [start, end, text]
  const owners = new Map(); // function node -> path
  const depArrays = new Map(); // a hook's dependency array that must now list router -> node
  let routerOk = Boolean(routerLocal);
  let paramsUsed = false;

  traverse(ast, {
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const binding = p.scope.getBinding(p.node.name);
      if (!binding || binding.kind !== "module" || binding.path.parentPath.node !== importDecl.node) return;
      if (p.node.name === routerLocal) {
        const owner = ownerOf(p);
        if (!owner) {
          routerOk = false;
          skipped.push(`${file}:${p.node.loc.start.line}: router used outside a component or hook`);
          return;
        }
        if (owner.node.body.type !== "BlockStatement") {
          routerOk = false;
          skipped.push(`${file}:${p.node.loc.start.line}: router in an expression-bodied component`);
          return;
        }
        owners.set(owner.node, owner);
        // router becomes a local of the component: a hook callback that uses it must list it
        // (react-hooks/exhaustive-deps). Outside a pane it is the same stable singleton, so
        // nothing re-runs.
        for (let q = p.parentPath; q && q.node !== owner.node; q = q.parentPath) {
          if (!q.isCallExpression()) continue;
          const callee = q.node.callee;
          const name = callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" && callee.property.type === "Identifier" ? callee.property.name : null;
          if (!/^use(Effect|LayoutEffect|Callback|Memo|ImperativeHandle|FocusEffect)$/.test(name || "")) continue;
          const deps = q.node.arguments[q.node.arguments.length - 1];
          if (q.node.arguments.length < 2 || !deps || deps.type !== "ArrayExpression") break;
          if (!deps.elements.some((e) => e && e.type === "Identifier" && e.name === routerLocal)) depArrays.set(deps.start, deps);
          break;
        }
      } else if (p.node.name === paramsLocal) {
        paramsUsed = true;
        edits.push([p.node.start, p.node.end, "useNavParams"]);
      }
    },
  });

  if (routerOk) {
    for (const owner of owners.values()) {
      const body = owner.node.body;
      const first = body.body[0];
      // Indent like the body's first statement, or two more than the function's own line.
      const lineStart = code.lastIndexOf("\n", (first ? first.start : body.start) - 1) + 1;
      const indent = first ? code.slice(lineStart, first.start).match(/^[ \t]*/)[0] : `${code.slice(code.lastIndexOf("\n", owner.node.start - 1) + 1).match(/^[ \t]*/)[0]}  `;
      edits.push([body.start + 1, body.start + 1, `\n${indent}const ${routerLocal} = useNav();`]);
    }
    for (const deps of depArrays.values()) {
      const last = deps.elements[deps.elements.length - 1];
      if (last) edits.push([last.end, last.end, `, ${routerLocal}`]);
      else edits.push([deps.start + 1, deps.start + 1, routerLocal]);
    }
  }

  const takeRouter = routerOk && owners.size > 0;
  const takeParams = paramsUsed;
  // A `router` imported and never used at all also leaves (nothing to inject).
  const routerUnused = routerLocal && routerOk && owners.size === 0;
  if (!takeRouter && !takeParams && !routerUnused) return { code, changed: false, skipped };

  // Rebuild the expo-router import from its remaining specifiers' own text.
  const decl = importDecl.node;
  const keep = decl.specifiers.filter((s) => {
    if (s.type !== "ImportSpecifier") return true;
    if ((takeRouter || routerUnused) && s.local.name === routerLocal) return false;
    if (takeParams && s.local.name === paramsLocal) return false;
    return true;
  });
  const navNames = [takeRouter ? "useNav" : null, takeParams ? "useNavParams" : null].filter(Boolean);
  const navImport = navNames.length ? `import { ${navNames.join(", ")} } from "${NAV_MODULE}";` : "";
  let replacement;
  if (keep.length === 0) {
    replacement = navImport;
  } else {
    const named = keep.filter((s) => s.type === "ImportSpecifier").map((s) => code.slice(s.start, s.end));
    const other = keep.filter((s) => s.type !== "ImportSpecifier").map((s) => code.slice(s.start, s.end));
    const head = [...other, named.length ? `{ ${named.join(", ")} }` : null].filter(Boolean).join(", ");
    replacement = `import ${head} from "expo-router";${navImport ? `\n${navImport}` : ""}`;
  }
  edits.push([decl.start, decl.end, replacement]);

  edits.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let out = code;
  for (const [start, end, text] of edits) out = out.slice(0, start) + text + out.slice(end);
  return { code: out, changed: out !== code, skipped };
}

function sourceFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__" && e.name !== "node_modules") sourceFiles(f, acc);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) acc.push(f);
  }
  return acc;
}

function run(root, { write }) {
  const changed = [];
  const skipped = [];
  for (const dir of ["app", "src"]) {
    for (const file of sourceFiles(path.join(root, dir))) {
      const rel = path.relative(root, file);
      if (rel === path.join("src", "lib", "nav.ts")) continue;
      const code = fs.readFileSync(file, "utf8");
      const res = transform(code, rel);
      skipped.push(...res.skipped);
      if (res.changed) {
        changed.push(rel);
        if (write) fs.writeFileSync(file, res.code);
      }
    }
  }
  return { changed, skipped };
}

module.exports = { transform, run };

if (require.main === module) {
  const write = process.argv.includes("--write");
  const { changed, skipped } = run(ROOT, { write });
  console.log(`${write ? "changed" : "would change"} ${changed.length} file(s)`);
  for (const f of changed) console.log(`  ${f}`);
  // One line per file: the hand-fix list (or, for the files that navigate the whole app on purpose, the lint allowlist).
  const byFile = new Map();
  for (const s of skipped) {
    const [file, line, ...why] = s.split(":");
    const entry = byFile.get(file) ?? { lines: [], why: why.join(":").trim() };
    entry.lines.push(line);
    byFile.set(file, entry);
  }
  console.log(`skipped ${byFile.size} file(s), ${skipped.length} site(s):`);
  for (const [file, { lines, why }] of byFile) console.log(`  ${file}:${[...new Set(lines)].join(",")}  ${why}`);
}
