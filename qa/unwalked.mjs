#!/usr/bin/env node
/**
 * THE BACKWARD WALK OVER HANDLES — `node qa/unwalked.mjs`
 *
 * Every gate in this repo asks whether the handles a flow REACHES FOR exist:
 * `flow_lint.py`'s TESTID rule resolves each `id:` against the source, and a
 * flow naming a handle that is gone fails. Nothing asked the other question.
 *
 *   **Which handles does nothing reach for?**
 *
 * `docs/TESTING.md` §8's argument, applied to `testID`s instead of locale keys:
 * a handle gets written because somebody expected a test or a flow to need it,
 * so a handle nothing names is the receipt for a screen nobody walked. The
 * orphan is not the bug. It is where the bug is allowed to live.
 *
 * ── WHAT A HIT HERE IS AND IS NOT ─────────────────────────────────────────
 * It is NOT proof that a feature is untested. A test may reach a control by its
 * label or its text, which this repo PREFERS — `qa/FLOW_REGISTER.md` is explicit
 * that a row is addressed by "Options for …" rather than by a database-id
 * handle. So each hit is a question, and the answer is found by reading, not by
 * the exit code. Of the 38 in the first run, the ones that mattered were the
 * ones where nothing reached the component at all, by any route.
 *
 * It also cannot see a handle reached by a variable — `testID={row.testID}`
 * resolves to whatever the table holds, and a flow naming it would look like a
 * reference to a handle this script never recorded as defined.
 */
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import fs from "node:fs"; import path from "node:path";
const traverse = _traverse.default ?? _traverse;

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, exts, out); }
    else if (exts.some(x => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// ── defined ────────────────────────────────────────────────────────────────
const defined = new Map(); // id or prefix -> "file:line"
for (const dir of ["app", "src"]) {
  for (const f of walk(dir, [".tsx"])) {
    if (f.includes("__tests__")) continue;
    const code = fs.readFileSync(f, "utf8");
    let ast; try { ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] }); } catch { continue; }
    traverse(ast, {
      JSXAttribute(p) {
        if (p.node.name.name !== "testID" || !p.node.value) return;
        const where = `${f}:${p.node.loc.start.line}`;
        const v = p.node.value;
        if (v.type === "StringLiteral") defined.set(v.value, where);
        else if (v.type === "JSXExpressionContainer") {
          const e = v.expression;
          if (e.type === "StringLiteral") defined.set(e.value, where);
          else if (e.type === "TemplateLiteral") {
            // a prefix handle: `session-row-${id}` -> "session-row-"
            const head = e.quasis[0]?.value.cooked ?? "";
            if (head) defined.set(head + "*", where);
          }
          // identifiers / ternaries: recorded by their literal parts
          else if (e.type === "ConditionalExpression") {
            for (const side of [e.consequent, e.alternate]) {
              if (side.type === "StringLiteral") defined.set(side.value, where);
              else if (side.type === "TemplateLiteral") {
                const h = side.quasis[0]?.value.cooked ?? ""; if (h) defined.set(h + "*", where);
              }
            }
          }
        }
      },
    });
  }
}

// ── referenced ─────────────────────────────────────────────────────────────
const haystack = [];
for (const f of [...walk("qa/flows", [".yaml", ".yml"]), ...walk("app", [".tsx", ".ts"]).filter(x => x.includes("__tests__")), ...walk("src", [".tsx", ".ts"]).filter(x => x.includes("__tests__"))]) {
  haystack.push(fs.readFileSync(f, "utf8"));
}
const all = haystack.join("\n");

const orphans = [];
for (const [id, where] of defined) {
  const needle = id.endsWith("*") ? id.slice(0, -1) : id;
  if (!all.includes(needle)) orphans.push({ id, where });
}

console.log(`${defined.size} handles defined in app/ + src/`);
console.log(`${orphans.length} that NO flow and NO test ever names:\n`);
for (const o of orphans.sort((a, b) => a.where.localeCompare(b.where)))
  console.log(`  ${o.where.padEnd(46)} ${o.id}`);
