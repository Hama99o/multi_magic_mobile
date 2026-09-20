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
import subprocess
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



# A lucide icon hands its `testID` to BOTH its wrapper and the Svg inside it,
# so one handle resolves to TWO nodes in the rendered tree. Nothing in this
# file can see that by reading source — the source says `testID={...}` once —
# which is why it is detected by SHAPE here: a lucide icon is the element that
# takes `size` and `color` and renders no children.
#
# da found it on 2026-09-19 while walking handles backwards. No flow taps one
# today; this exists so the first flow that does finds out from the linter
# rather than from a device at 3am.
# The brace half must tolerate `${...}` NESTED inside the expression, which a
# flat `\{[^}]*\}` stops at — so it reuses ID_EXPR's own nesting pattern.
# Caught by this detector finding `event-repeats` and silently missing the two
# template handles it exists for.
ICON_ID = re.compile(
    r"<[A-Z][A-Za-z]*\s+(?=[^>]*\bsize=)(?=[^>]*\bcolor=)[^>]*?"
    r"testID\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|\"[^\"]*\")"
)


def icon_testids():
    """Handles that sit on an icon, and so resolve to two nodes each."""
    out = set()
    for path in code_files():
        src = io.open(path, encoding="utf-8").read()
        for m in ICON_ID.finditer(src):
            expr = m.group(1)
            out.update(LIT_IN.findall(expr))
            for tpl in TPL_IN.findall(expr):
                # `session-scoped-${id}` -> the stable head, which is what a
                # flow would match on.
                head = INTERP.split(tpl)[0] if INTERP.search(tpl) else tpl
                if head:
                    out.add(head.rstrip("-"))
    return out


# ── VERDICT — A ROW THAT DESCRIBES COVERAGE IS NOT A ROW THAT REPORTS A RUN ──
# Five times in one file, found three separate times by three separate people:
# `09-keyboard`, `05-upload`, `03-dictation`, `04-delete-conversation` and
# `02-sign-in` all sat in FLOW_REGISTER.md reading as coverage while having
# never executed — or, worse, while carrying a verdict written BEFORE the flow
# was rewritten. A gap is visible; prose that reads like a result is not.
#
# The register's shape allowed it, so the fix is structural rather than
# diligence. Every flow's row must carry one of PASS, FAIL, NOT MEASURED or
# UNRUN, **and a verdict must not predate the flow's own last change** — a
# verdict for content that no longer exists is the same lie one step subtler.
VERDICT_WORD = re.compile(r"\b(PASS|FAIL|NOT MEASURED|UNRUN)\b")
ROW_DATE = re.compile(r"\b(20\d\d)-(\d\d)-(\d\d)\b")


def _last_changed(path):
    """When the flow itself last changed, from git. None if git cannot say."""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%ad", "--date=format:%Y-%m-%d", "--", path],
            cwd=ROOT, capture_output=True, text=True, timeout=10,
        ).stdout.strip()
        return out or None
    except Exception:
        return None


def verdicts(paths, register):
    """Rows that report nothing, and verdicts older than the flow they describe."""
    try:
        text = io.open(register, encoding="utf-8").read()
    except OSError:
        return
    rows = {}
    for line in text.splitlines():
        m = re.match(r"\|\s*`([^`]+\.yaml)`\s*\|", line)
        if m:
            rows.setdefault(m.group(1), line)

    helper_set = helpers(sorted(glob.glob(os.path.join(FLOWS, "*.yaml"))))
    for path in paths:
        name = os.path.basename(path)
        if os.path.abspath(path) in helper_set:
            continue                      # a helper reports no verdict of its own
        row = rows.get(name)
        if row is None:
            continue                      # UNREGISTERED already covers this
        # ONLY THE VERDICT COLUMN. The "does NOT cover" column legitimately
        # says NOT MEASURED as prose — "stops as NOT MEASURED if the account is
        # at the cap" — and reading the whole row let that count as a verdict.
        # The first version of this check passed `03-dictation` and
        # `04-delete-conversation` for exactly that reason, which is the same
        # mistake in the instrument as in the thing it audits.
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        verdict_cell = cells[1] if len(cells) > 1 else ""
        word = VERDICT_WORD.search(verdict_cell)
        if not word:
            yield (name, "VERDICT",
                   "the row describes coverage and reports no run — say PASS, FAIL, "
                   "NOT MEASURED or UNRUN in the same column, or it is prose")
            continue
        if word.group(1) == "UNRUN":
            continue                      # honest, and says so
        changed = _last_changed(path)
        dates = ["-".join(d) for d in ROW_DATE.findall(verdict_cell)]
        if changed and dates and max(dates) < changed:
            yield (name, "VERDICT",
                   f"the newest date in the row is {max(dates)} but the flow last "
                   f"changed on {changed} — the verdict is for content that no "
                   f"longer exists")

# ── THE FOUR BUCKETS, BECAUSE A LIST OF SIXTY-ONE BECOMES WALLPAPER ─────────
# Only the first is a backlog. The other three are answers, not debt, and
# keeping them in the same list as the real gaps is how the real gaps stop
# being read.
#
# Each entry carries its REASON, so the next session can disagree with the
# judgement rather than with the bucket.
BUCKETS = {
    # ── 1. FORBIDDEN — a rule says never press it ──────────────────────────
    "delete-account-confirm": ("forbidden", "RIG_CONTRACT.md §3: no test may call account deletion against a real account"),

    # ── 2. UNREACHABLE — the rig cannot produce the state ──────────────────
    # Everything here needs a server made to fail, a second signed-in account,
    # or a moment this suite cannot manufacture against HIS REAL BACKEND.
    "ai-keys-error":        ("unreachable", "needs the provider check to fail"),
    "attach-error":         ("unreachable", "needs an upload to fail"),
    "chat-answer-failed":   ("unreachable", "needs the answer job to fail"),
    "chat-load-failed":     ("unreachable", "needs the history fetch to fail"),
    "chat-rate-limited":    ("unreachable", "tripping the limit locks the QA account out of the suite"),
    "chat-send-failed":     ("unreachable", "needs the send to fail"),
    "delete-error":         ("unreachable", "needs the delete to fail"),
    "password-error":       ("unreachable", "the 422 path IS covered by 14; this is the transport failure"),
    "profile-error":        ("unreachable", "needs the save to fail"),
    "sessions-error":       ("unreachable", "needs the list fetch to fail"),
    "answer-undo-error":    ("unreachable", "needs the undo to fail"),
    "composer-offline":     ("unreachable", "needs the device to lose the network mid-flow"),
    "composer-mic-problem": ("unreachable", "needs the recogniser to error rather than refuse"),
    "sign-in-notice":       ("unreachable", "needs a specific server response the rig cannot ask for"),
    "thinking-slow":        ("unreachable", "needs an answer slow enough to cross the threshold"),
    "ai-keys-borrowed":     ("unreachable", "needs a key granted by another user"),
    "thread-typing":        ("unreachable", "needs a SECOND signed-in account typing"),
    "unread-divider":       ("unreachable", "needs a message from somebody else"),

    # ── 3. UNIT-ONLY — not an interactive control, and a test covers it ────
    # Counters, captions and labels. A flow asserting these proves the render,
    # which is what the render tests already do more cheaply and at three
    # widths.
    "attach-count":            ("unit-only", "a counter; asserted in the render tests"),
    "attach-limits":           ("unit-only", "a caption; asserted in the render tests"),
    "rename-count":            ("unit-only", "a counter"),
    "delete-conversation-safe":("unit-only", "the guarantee sentence — 04 and 15 assert its TEXT, which is the point"),
    "answer-undone":           ("unit-only", "a transient confirmation"),
    "answer-copied":           ("unit-only", "a transient confirmation"),
    "calendar-updated":        ("unit-only", "a freshness caption; Freshness.test covers it"),
    "notifications-updated":   ("unit-only", "a freshness caption; Freshness.test covers it"),
    "updated-line":            ("unit-only", "a freshness caption; Freshness.test covers it"),
    "answer-actions":          ("unit-only", "the wrapper; its children are what matter"),
    "answer-read-controls":    ("unit-only", "the wrapper; its children are what matter"),
    "pending-files":           ("unit-only", "a container"),
    "source-chips":            ("unit-only", "a container"),
    "file-preview":            ("unit-only", "a container"),
}


def bucket_for(name):
    """Which of the four a handle belongs in, and why.

    Anything not named above is a BACKLOG item by default — a control a person
    can reach on the QA account that no flow has ever touched. Defaulting to
    backlog rather than to 'probably fine' is deliberate: the failure this
    whole check exists to catch is a gap that looked like coverage.
    """
    if name in BUCKETS:
        return BUCKETS[name]
    return ("backlog", "reachable on the QA account; no flow touches it")


def untouched(literals, templates):
    """WHICH testIDs EXIST AND NO FLOW HAS EVER TOUCHED.

    Every other check here runs FORWARDS: take what a flow says and ask
    whether it resolves. That direction cannot see a handle the app offers
    and nothing uses — and both sibling rigs were bitten by the same
    asymmetry on 2026-09-19. e7 had a key sitting in both locales, asserted
    by a locale test and listed in the docs, called by nothing, while the
    component wrote the sentence as an English literal two lines below it:
    four places agreed the translation existed. Karwan's literal check read
    `en.ts` while its rig forced Pashto, so it compared two disjoint sets and
    reported clean by construction.

    A handle with no flow is NOT automatically wrong — plenty are reached
    only by unit tests, and some mark a state a flow cannot reach. That is
    exactly why this prints a list and does not fail the gate: the value is
    in reading it, and a check that cried wolf here would be turned off.
    """
    used = set()
    for path in sorted(glob.glob(os.path.join(FLOWS, "*.yaml"))):
        text = io.open(path, encoding="utf-8").read()
        for m in re.finditer(r'id:\s*"([^"]+)"', text):
            used.add(m.group(1))
        for m in re.finditer(r"id:\s*'([^']+)'", text):
            used.add(m.group(1))

    def touched(lit):
        if lit in used:
            return True
        # A flow may address it by regex — `ai-keys-(list|empty)` covers both.
        for u in used:
            try:
                if re.fullmatch(u, lit):
                    return True
            except re.error:
                pass
        return False

    return sorted(l for l in literals if not touched(l))


def main(argv):
    strings = ui_strings()
    literals, templates = testids()

    if "--untouched" in argv:
        orphans = untouched(literals, templates)
        print()
        print(f"  {len(literals)} literal testIDs in the app; "
              f"{len(literals) - len(orphans)} are reached by a flow.")
        order = [
            ("backlog",     "BACKLOG — reachable, and nothing has ever touched it"),
            ("unreachable", "the rig cannot produce this state against his real backend"),
            ("unit-only",   "not an interactive control; a unit test covers it"),
            ("forbidden",   "a rule says never press it"),
        ]
        grouped = {}
        for o in orphans:
            b, why = bucket_for(o)
            grouped.setdefault(b, []).append((o, why))
        for key, title in order:
            rows = grouped.get(key, [])
            print()
            print(f"  {len(rows):>3}  {title}")
            for name, why in rows:
                print(f"         {name:<28} {why}")
        print()
        print(f"  ONLY THE FIRST {len(grouped.get('backlog', []))} ARE A BACKLOG.")
        return 0

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
    # ICON — a handle that resolves to two nodes, not one.
    icons = icon_testids()
    for path in paths:
        for n, line in enumerate(io.open(path, encoding="utf-8").read().splitlines(), 1):
            m = re.search(r'id:\s*["\']([^"\']+)["\']', line)
            if not m:
                continue
            sel = m.group(1)
            hit = next((i for i in icons if sel == i or sel.startswith(i)), None)
            if hit:
                print(f"  {'ICON':<12} qa/flows/{os.path.basename(path)}:{n}  "
                      f"`{sel}` sits on a lucide icon, which hands its testID to BOTH "
                      f"its wrapper and the Svg inside — TWO nodes, not one")
                total += 1

    for name, kind, why in verdicts(paths, REGISTER):
        print(f"  {kind:<12} qa/flows/{name}  {why}")
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
