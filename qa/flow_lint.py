#!/usr/bin/env python3
"""Static lint for this rig's Maestro flows.

Ported from `karwan-mobile/qa/flow_lint.py` (same author, same campaign) and
re-pointed at THIS repo's layout — which is the step the Karwan copy itself got
wrong once: it globbed a locale path that did not exist, so two of its checks
could never fire and it reported zero findings while looking perfect. This app
has no locale files at all; every user-visible string is typed straight into
JSX. So the string table is harvested from `app/` and `src/`, and the harvest
joins a JSX text node across line breaks the way React Native does, because
the node Maestro matches against is the WHOLE paragraph.

Each class is a failure already paid for, here or in the sibling rig:

  TESTID     An `id:` selector that matches no `testID` in app/ or src/. It
             lints clean and fails on the device with "Element not found",
             which then gets read as a missing button. Every id in a flow must
             resolve to a literal testID or to a template one (`session-row-
             ${session.id}` resolves `session-row-.*`).
  DBID       A selector that resolves ONLY through a testID built on a
             database id (`${session.id}`, `${notification.id}`). Hamma9901's
             rule: a testID that is a database id is a FINDING, not a
             selector — the flow cannot name the row it means, so it taps
             "whichever comes first" and calls that coverage. Tap by the
             row's label instead, and mark the site `# lint: dbid-ok — <why>`
             only where "any row" genuinely is the assertion.
  ANCHORED   A literal that is a strict SUBSTRING of a real UI string. Maestro
             matches an anchored full-string regex, so "Changing your email
             signs you out" can never match the two-line caption it opens.
  SELFTYPED  A literal that is only PART of text the flow itself typed.
  TOOTHLESS  `optional: true` on an assert — it cannot fail, so it reads as
             coverage while asserting nothing.
  OPTIONAL   `optional: true` on anything else. Karwan's F-64: optional turns
             "did not work" into "did not happen". Legitimate on a system
             dialog that may not appear; never on the step that is the point
             of the flow. Every one needs `# lint: optional-ok — <why>` on its
             own command, so a NEW one stands out.
  JSFUNC     ${visible(...)} / ${selectorExists(...)} — not in Maestro's JS
             sandbox; raises TypeError and asserts nothing.
  REGEXMETA  An unescaped `$` or `( )` used as text — an end-anchor and a
             group, not a dollar sign and brackets.
  HIDEKEY    `hideKeyboard` with no justification. On Android it can reach the
             app as a BACK press when no IME is up, and on a pushed screen
             that pops the screen; the flow then fails somewhere else. The
             sign-in shape (after a password on the auth root) is exempt;
             everywhere else say why Back is safe, or `pressKey: Enter` on a
             single-line field instead.
  DATE       A hardcoded year.
  RUNFLOW    A `runFlow:` pointing at a file that does not exist.
  APPID      A flow whose `appId` is not `${APP_ID}`. The rig drives EITHER
             Expo Go or the dev build (`qa.config.sh`); a literal package ties
             the flow to one of them and fails silently on the other.
  BADTYPE    `timeout:` (etc.) that parses as a string — a comment run onto
             the end of the line is the usual cause; Maestro rejects the flow.
  UNREGISTERED  A flow file with no row in `qa/FLOW_REGISTER.md`. The
             register's whole job is the "does NOT cover" column; a flow with
             no row has coverage nobody can read and a verdict nobody can see.

Reports only; every hit needs a human read, and the markers exist so this
report converges to zero and a genuine new hit is not buried under known ones.
Exit 1 on any finding, 0 on none.

  python3 qa/flow_lint.py                      # every flow in qa/flows
  python3 qa/flow_lint.py qa/flows/10-*.yaml   # just these
  python3 qa/flow_lint.py --selftest           # prove every check still fires
"""
import glob
import html
import io
import itertools
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLOWS = os.path.join(ROOT, "qa", "flows")
REGISTER = os.path.join(ROOT, "qa", "FLOW_REGISTER.md")

CODE_GLOBS = ["app/**/*.tsx", "src/**/*.tsx", "src/**/*.ts"]


def code_files():
    out = []
    for pat in CODE_GLOBS:
        out += glob.glob(os.path.join(ROOT, pat), recursive=True)
    return sorted(p for p in set(out) if "__tests__" not in p and not p.endswith(".test.tsx"))


# ── THE STRING TABLE ────────────────────────────────────────────────────────
#
# No locale files here, so the strings a flow can assert are the ones typed
# into JSX. Two harvests:
#   1. JSX text nodes, `>…<`, joined across line breaks and whitespace-collapsed
#      — because React Native renders `<Text>a\n  b</Text>` as "a b" and that
#      single node is what Maestro compares against;
#   2. quoted string literals (labels, placeholders, hints, error copy).
# Noise in (2) only ADDS strings, which can hide an ANCHORED hit but cannot
# invent one. Identifier-shaped lowercase tokens are dropped so testIDs and
# style keys do not swell the table for nothing.
JSX_TEXT = re.compile(r">\s*([^<>]+?)\s*<", re.S)
QUOTED = re.compile(r'"((?:[^"\\\n]|\\.)*)"|\'((?:[^\'\\\n]|\\.)*)\'')
IDENTISH = re.compile(r"^[a-z][A-Za-z0-9_./:@-]*$")


def ui_strings():
    out = set()
    for p in code_files():
        src = io.open(p, encoding="utf-8").read()
        for m in JSX_TEXT.finditer(src):
            text = html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()
            if text and not text.startswith("{") and len(text) >= 2:
                out.add(text)
                # A node with an expression in it — "At least {N} characters." —
                # renders around the value; keep the literal halves too.
                for part in re.split(r"\{[^}]*\}", text):
                    part = part.strip()
                    if len(part) >= 2:
                        out.add(part)
        for m in QUOTED.finditer(src):
            lit = m.group(1) if m.group(1) is not None else m.group(2)
            lit = lit.replace('\\"', '"').replace("\\'", "'")
            if len(lit) >= 2 and not IDENTISH.match(lit):
                out.add(lit)
    return out


# ── THE TESTID TABLE ────────────────────────────────────────────────────────
#
# Literal `testID="x"` / `testID: "x"`, and template `testID={`x-${y}`}`. A
# template becomes (regex, samples, db_id): the regex resolves a plain flow id,
# the samples resolve a regex flow id, and `db_id` is true when any
# interpolation is a record id — the thing DBID reports.
# The whole expression after `testID=` / `testID:` — a quoted string, a
# template, or a braced expression with one level of nesting (a ternary with a
# template in it). Strings and templates are then read out of it, templates
# first so a quoted alternative inside `${a ? "x" : "y"}` is not also counted
# as a literal id.
ID_EXPR = re.compile(r'testID\s*[=:]\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|`[^`]*`)')
TPL_IN = re.compile(r"`([^`]+)`")
LIT_IN = re.compile(r'"([^"]+)"')
INTERP = re.compile(r"\$\{([^}]*)\}")
DB_ID = re.compile(r"\.id\b|\b[a-z]\w*Id\b")


def _alternatives(expr):
    """The strings an interpolation can take, when they are written down."""
    quoted = re.findall(r'"([^"]*)"', expr)
    if quoted and "?" in expr:
        return quoted
    return None


def testids():
    literals = set()
    templates = []  # (source_text, regex, samples, db_id)
    for p in code_files():
        src = io.open(p, encoding="utf-8").read()
        tpls = []
        for m in ID_EXPR.finditer(src):
            expr = m.group(1)
            tpls += TPL_IN.findall(expr)
            literals.update(LIT_IN.findall(TPL_IN.sub("", expr)))
        for tpl in tpls:
            regex, samples, db = "", [""], False
            pos = 0
            for m in INTERP.finditer(tpl):
                static = tpl[pos:m.start()]
                regex += re.escape(static)
                samples = [s + static for s in samples]
                expr = m.group(1).strip()
                alts = _alternatives(expr)
                if alts:
                    regex += "(?:" + "|".join(re.escape(a) for a in alts) + ")"
                    samples = [s + a for s, a in itertools.product(samples, alts)]
                else:
                    regex += ".*"
                    samples = [s + "X" for s in samples]
                    if DB_ID.search(expr):
                        db = True
                pos = m.end()
            static = tpl[pos:]
            regex += re.escape(static)
            samples = [s + static for s in samples]
            templates.append((tpl, regex, samples, db))
    return literals, templates


def is_plain(lit):
    """No regex metacharacters — so an anchored match means literal equality."""
    return not re.search(r"[.*+?\[\]()|\\^$]", lit)


def resolve_id(sel, literals, templates):
    """('literal'|'template'|None, db_id) for a flow's `id:` selector."""
    if sel in literals:
        return "literal", False
    try:
        pat = re.compile(sel)
    except re.error:
        pat = None
    if pat and not is_plain(sel):
        # A regex selector: does it match any literal testID exactly?
        if any(pat.fullmatch(lit) for lit in literals):
            return "literal", False
    hit, db_only = None, True
    for _, regex, samples, db in templates:
        matched = bool(re.fullmatch(regex, sel))
        if not matched and pat:
            matched = any(pat.fullmatch(s) for s in samples)
        if matched:
            hit = "template"
            if not db:
                db_only = False
    if hit:
        return hit, db_only
    return None, False


def block_range(lines, i):
    """Line span of the command enclosing line i (1-indexed, inclusive).

    Markers must bind to their OWN command: the block runs from the enclosing
    `- command:` up to the line before the next one, and a marker comment
    directly above that command counts as part of it.
    """
    start = i - 1
    while start > 0 and not re.match(r"\s*-\s+\w", lines[start]):
        start -= 1
    while start > 0 and lines[start - 1].strip().startswith("#"):
        start -= 1
    end = i
    while end < len(lines) and not re.match(r"\s*-\s+\w", lines[end]):
        end += 1
    return start, end


def block_text(lines, i):
    bs, be = block_range(lines, i)
    return " ".join(lines[bs:be])


def owner_of(lines, i):
    for k in range(i - 2, -1, -1):
        if re.match(r"\s*-\s+\w", lines[k]):
            return lines[k].strip().lstrip("- ").rstrip(":")
    return None


def check(path, strings, literals, templates):
    hits = []
    text = io.open(path, encoding="utf-8").read()
    lines = text.split("\n")
    here = os.path.dirname(os.path.abspath(path))

    # ── RUNFLOW ─────────────────────────────────────────────────────────────
    for i, raw in enumerate(lines, 1):
        m = re.match(r'\s*-?\s*runFlow:\s*"?([^"\s#]+\.ya?ml)"?\s*$', raw)
        if m and not os.path.isfile(os.path.join(here, m.group(1))):
            hits.append((i, "RUNFLOW",
                         f"runFlow points at {m.group(1)!r}, which does not exist — "
                         f"lints clean and fails the moment it is run"))

    # ── YAML: parses, appId is the rig's, numbers are numbers ──────────────
    try:
        docs = list(yaml.safe_load_all(io.open(path, encoding="utf-8")))
    except Exception as e:  # noqa: BLE001 — the message is the finding
        hits.append((1, "YAMLPARSE", f"does not parse as YAML: {e}"))
        docs = []
    if docs and isinstance(docs[0], dict):
        app_id = docs[0].get("appId")
        if app_id != "${APP_ID}":
            hits.append((1, "APPID",
                         f"appId is {app_id!r}, not ${{APP_ID}} — ties the flow to one "
                         f"binary when the rig drives Expo Go OR the dev build"))
    elif docs:
        hits.append((1, "APPID", "no `appId: ${APP_ID}` header document"))

    def walk(steps):
        for step in steps or []:
            if not isinstance(step, dict):
                continue
            for cmd, body in step.items():
                if not isinstance(body, dict):
                    continue
                for field in ("timeout", "index", "times", "visibilityPercentage",
                              "maxRetries", "speed"):
                    if field in body and not isinstance(body[field], (int, float)):
                        hits.append((1, "BADTYPE",
                                     f"{cmd}.{field} is {body[field]!r} "
                                     f"({type(body[field]).__name__}), not a number — "
                                     f"a comment run onto the end of the line is the "
                                     f"usual cause"))
                if cmd == "runFlow" and isinstance(body.get("commands"), list):
                    walk(body["commands"])

    for doc in docs:
        if isinstance(doc, list):
            walk(doc)

    # Text this flow types, for SELFTYPED.
    typed = [m.group(1) for m in
             (re.match(r'-?\s*inputText:\s*"([^"]+)"', x.strip())
              for x in lines if not x.strip().startswith("#")) if m]

    # ── HIDEKEY ─────────────────────────────────────────────────────────────
    for i, raw in enumerate(lines, 1):
        if raw.strip() != "- hideKeyboard":
            continue
        prev = ""
        for k in range(i - 2, -1, -1):
            st = lines[k].strip()
            if st and not st.startswith("#") and st != "- waitForAnimationToEnd":
                prev = st
                break
        justified = any(
            lines[k].strip().startswith("#")
            and re.search(r"(?i)hideKeyboard|Back press|IME|keyboard", lines[k])
            for k in range(max(0, i - 8), i - 1)
        )
        # The sign-in shape only: password typed on the auth root, where a stray
        # Back pops nothing. It is the one place Back is provably harmless.
        login_shape = bool(re.search(r"(?i)password", prev))
        if not justified and not login_shape:
            hits.append((i, "HIDEKEY",
                         f"hideKeyboard after {prev[:30]!r} — can reach the app as BACK "
                         f"with no IME up and pop a pushed screen; justify it in a "
                         f"comment above, or `pressKey: Enter` on a single-line field"))

    for i, raw in enumerate(lines, 1):
        line = raw.strip()
        if line.startswith("#"):
            continue

        # ── optional: true ───────────────────────────────────────────────
        if re.match(r"-?\s*optional:\s*true", line):
            owner = owner_of(lines, i)
            near = block_text(lines, i)
            if "lint: optional-ok" in near:
                pass
            elif owner and owner.startswith("assert"):
                hits.append((i, "TOOTHLESS", f"optional {owner} cannot fail"))
            else:
                hits.append((i, "OPTIONAL",
                             f"optional {owner or 'step'} — 'did not work' becomes 'did "
                             f"not happen' (F-64); justify with `# lint: optional-ok — "
                             f"<why>` on this command, or drop it"))

        if re.search(r"\$\{[^}]*\b(visible|selectorExists|exists)\s*\(", line):
            hits.append((i, "JSFUNC", "no such function in Maestro's JS sandbox"))

        # ── id: selectors ────────────────────────────────────────────────
        mid = re.match(r'^(?:-\s*)?id:\s*"([^"]+)"', line)
        if mid:
            sel = mid.group(1)
            if "${" not in sel:
                kind, db_only = resolve_id(sel, literals, templates)
                near = block_text(lines, i)
                if kind is None:
                    hits.append((i, "TESTID",
                                 f"id {sel!r} matches no testID in app/ or src/ — "
                                 f"fails on the device as 'Element not found'"))
                elif db_only and "lint: dbid-ok" not in near:
                    hits.append((i, "DBID",
                                 f"id {sel!r} resolves only through a testID built on a "
                                 f"database id — a finding, not a selector; tap by the "
                                 f"row's label, or `# lint: dbid-ok — <why>`"))

        # ── text literals: asserts, taps, text: operands ─────────────────
        mt = re.search(r'(assert(?:Not)?Visible|tapOn|longPressOn):\s*"([^"]+)"', line)
        mx = re.match(r'^\s*(?:-\s*)?text:\s*"([^"]+)"', line)
        if not (mt or mx):
            continue
        lit = mt.group(2) if mt else mx.group(1)
        probe = re.sub(r"\$\{[^}]*\}", "", lit)
        near = block_text(lines, i)
        if "$" in probe and "\\$" not in probe:
            hits.append((i, "REGEXMETA", f"{lit!r} has an unescaped $ — a regex end-anchor"))
        elif re.search(r"(?<!\\)[()]", probe) and "lint: regex-ok" not in near:
            hits.append((i, "REGEXMETA",
                         f"{lit!r} has unescaped ( ) — regex grouping, not brackets"))
        elif re.fullmatch(r'"?(19|20)\d\d"?', lit):
            hits.append((i, "DATE", f"hardcoded year {lit!r}"))
        elif is_plain(lit) and (len(lit) > 2 or (len(lit) == 2 and lit.isascii() and not lit.isdigit())):
            exact = lit in strings
            ok = "lint: anchored-ok" in near
            self_typed = [t for t in typed if lit in t and lit != t]
            sub = [s for s in strings if lit in s and s != lit]
            if exact or ok:
                pass
            elif self_typed:
                hits.append((i, "SELFTYPED", f"{lit!r} is only part of {self_typed[0][:38]!r}"))
            elif sub:
                hits.append((i, "ANCHORED",
                             f"{lit!r} is a substring of {sorted(sub, key=len)[0][:60]!r} — "
                             f"Maestro matches the whole node; assert all of it or end in .*"))
    return hits


def helpers(flow_paths):
    """Files another flow calls with runFlow — run BY flows, not counted as one."""
    out = set()
    for p in flow_paths:
        here = os.path.dirname(os.path.abspath(p))
        for raw in io.open(p, encoding="utf-8"):
            m = re.match(r'\s*-?\s*runFlow:\s*"?([^"\s#]+\.ya?ml)"?\s*$', raw)
            if m:
                out.add(os.path.abspath(os.path.join(here, m.group(1))))
    return out


def unregistered(flow_paths, register_path):
    """Every flow file must have a row in the register — its coverage column
    is the only place 'what this does NOT prove' is written down."""
    hits = []
    try:
        reg = io.open(register_path, encoding="utf-8").read()
    except OSError as e:
        return [(os.path.basename(register_path), "REGISTER", f"cannot be read: {e}")]
    helper_set = helpers(flow_paths)
    for p in sorted(flow_paths):
        if os.path.abspath(p) in helper_set:
            continue
        name = os.path.basename(p)
        if f"`{name}`" not in reg:
            hits.append((name, "UNREGISTERED",
                         "no row in qa/FLOW_REGISTER.md — its coverage and its verdict "
                         "are invisible"))
    return hits


def main(argv):
    strings = ui_strings()
    literals, templates = testids()

    if "--selftest" in argv:
        fixture = os.path.join(ROOT, "qa", "testdata", "lint_synthetic.yaml")
        # The fixture asserts against a synthetic string table and id table so
        # the selftest cannot go stale when the app's copy changes.
        s = {"Create an account", "Changing your email signs you out of live updates until "
             "you sign in again, so it is done on the website for now."}
        lits = {"sign-in-email", "composer-input"}
        tpls = [("session-menu-${session.id}", r"session\-menu\-.*", ["session-menu-X"], True),
                ("theme-${option.key}", r"theme\-.*", ["theme-X"], False)]
        hits = check(fixture, s, lits, tpls)
        got = {k for _, k, _ in hits}
        need = {"TESTID", "DBID", "ANCHORED", "SELFTYPED", "TOOTHLESS", "OPTIONAL", "JSFUNC",
                "REGEXMETA", "HIDEKEY", "DATE", "RUNFLOW", "APPID", "BADTYPE"}
        for line, kind, why in hits:
            print(f"  L{line:<3} {kind:<12} {why[:64]}")
        missing = need - got
        # The marked commands must be silent: identify them by content.
        over = [f"L{l}: {w}" for l, _, w in hits if "'theme-dark'" in w or "'Continue'" in w]
        # UNREGISTERED must fire on a synthetic pair, and stay quiet on a bound one.
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            for n in ("bound.yaml", "orphan.yaml", "helper.yaml"):
                io.open(os.path.join(tmp, n), "w").write("appId: ${APP_ID}\n---\n- runFlow: helper.yaml\n" if n != "helper.yaml" else "appId: x\n")
            regp = os.path.join(tmp, "REG.md")
            io.open(regp, "w").write("| `bound.yaml` | x | y |\n")
            u = unregistered([os.path.join(tmp, n) for n in ("bound.yaml", "orphan.yaml", "helper.yaml")], regp)
            reg_ok = [n for n, _, _ in u] == ["orphan.yaml"]
            if reg_ok:
                print(f"  L--  {'UNREGISTERED':<12} {u[0][2][:64]}")
            else:
                print(f"  FAIL — UNREGISTERED fired on {[n for n, _, _ in u]}, expected ['orphan.yaml']")
        ok = not missing and not over and reg_ok
        print()
        if missing:
            print(f"  FAIL — these checks did not fire: {sorted(missing)}")
        if over:
            print(f"  FAIL — a marker did not suppress its own command: {over}")
        if ok:
            print(f"  PASS — all {len(need)} checks fire, UNREGISTERED fires once and only "
                  f"on the orphan, markers scoped to one command")
        return 0 if ok else 1

    targets = [a for a in argv if a.endswith((".yaml", ".yml"))]
    all_flows = sorted(glob.glob(os.path.join(FLOWS, "*.yaml")))
    paths = [os.path.abspath(t) for t in targets] or all_flows

    total = 0
    for p in paths:
        for line, kind, why in check(p, strings, literals, templates):
            print(f"  {kind:<12} qa/flows/{os.path.basename(p)}:{line}  {why}")
            total += 1
    for name, kind, why in unregistered(paths, REGISTER):
        # Helpers are decided against EVERY flow on disk, not only the targets.
        if os.path.join(FLOWS, name) in helpers(all_flows):
            continue
        print(f"  {kind:<12} qa/flows/{name}  {why}")
        total += 1

    helper_set = helpers(all_flows)
    n_flows = len([p for p in all_flows if os.path.abspath(p) not in helper_set])
    print(f"\n  {total} finding(s) · {len(paths)} file(s) linted · {n_flows} flows and "
          f"{len(helper_set)} helper(s) on disk · {len(literals)} literal and "
          f"{len(templates)} template testIDs · {len(strings)} UI strings")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
