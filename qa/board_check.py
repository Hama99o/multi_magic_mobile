#!/usr/bin/env python3
"""THE DESIGN BOARD'S STATUSES, AGAINST THE TREE (2026-09-25).

    python3 qa/board_check.py                 # docs/design/README.md
    python3 qa/board_check.py --board FILE    # another copy, e.g. a replay

`docs/design/README.md` carries a status per screen, kept by hand. Four were
stale on one day: row 9 said SPECIFIED while `SourceChips.tsx` and
`SourceSheet.tsx` were built and wired, and rows 0, 13 and 15 were the same
shape. A board that reports a built thing as unbuilt gets it rebuilt; one
that reports an unbuilt thing as ready gets it relied on.

Karwan's version of this (karwan-mobile qa/board_check.py, karwan-42) taught
the lesson this one keeps: path rules alone found none of their real
failures, because the lies were BEHAVIOUR claims beside real paths. Theirs
checks the over-claim direction and leaves out the under-claim, which is
exactly this board's failure. So this reads the row itself, columns by
header name, in both directions:

  UNDER  a SPECIFIED or RESEARCHING row that names a client file already in
         app/ or src/: built, but marked unbuilt (row 9's shape)
  WISH   a SPECIFIED or RESEARCHING row that names NO client identifier: the
         board's own rule, "a spec that names no identifier is a wish", and a
         status nobody can check (rows 0, 9 and 15 before 2026-09-25)
  PATH   a backticked client file (with an optional :line) that does not
         exist, or a line past its end
  CLAIM  a backticked `NAME = value` that the source does not say
  FORM   a DONE row whose linked SPEC does not say DONE, or whose ours/ lacks
         a 360, 411 or 800 shot (the board's definition of DONE)

A wrong status is a FAILURE (exit 1), not a warning.

What it cannot see, and says so: a behaviour claim in words ("the banner
still says DRAFT"), which was row 13's lie. The convention that helps more
than any parser is karwan-42's: behaviour claims go in Notes as checkable
`NAME = value` or file references, never as prose in the status column.
"""
import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGN = os.path.join(ROOT, "docs", "design")
UNBUILT = ("SPECIFIED", "RESEARCHING")
WIDTHS = ("360", "411", "800")


def client_files(tests=False):
    """Every .ts/.tsx under app/ and src/. With tests=False, the app's own
    code only: a test file existing is not the thing being BUILT (UNDER),
    but it is a real file a row may name (PATH)."""
    out = {}
    for base in ("app", "src"):
        for dirpath, _, files in os.walk(os.path.join(ROOT, base)):
            if "node_modules" in dirpath or (not tests and "__tests__" in dirpath):
                continue
            for f in files:
                if f.endswith((".ts", ".tsx")):
                    rel = os.path.relpath(os.path.join(dirpath, f), ROOT)
                    out.setdefault(f, []).append(rel)
                    out.setdefault(rel, []).append(rel)
    return out


def source_text():
    text = []
    for base in ("app", "src"):
        for dirpath, _, files in os.walk(os.path.join(ROOT, base)):
            if "node_modules" in dirpath or "__tests__" in dirpath:
                continue
            for f in files:
                if f.endswith((".ts", ".tsx")):
                    text.append(open(os.path.join(dirpath, f), encoding="utf-8").read())
    return "\n".join(text)


def rows(board):
    lines = open(board, encoding="utf-8").read().splitlines()
    header = None
    for i, line in enumerate(lines):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if header is None:
            if "Design" in cells and "#" in cells:
                header = cells
            continue
        if not line.startswith("|"):
            header = None
            continue
        if set(line.replace("|", "").strip()) <= set("-: "):
            continue
        if len(cells) != len(header):
            continue
        yield i + 1, dict(zip(header, cells))


def status_of(cell):
    m = re.search(r"`(RESEARCHING|SPECIFIED|IN PROGRESS|BLOCKED|NEEDS HAMMA9900|DONE)`", cell)
    return m.group(1) if m else None


def check(board):
    files = client_files(tests=True)
    built = client_files(tests=False)
    source = source_text()
    findings = []
    for line_no, row in rows(board):
        where = f"row {row.get('#')} (line {line_no})"
        status = status_of(row.get("Design", ""))
        whole = " ".join(row.values())
        tokens = re.findall(r"`([^`]+)`", whole)

        # PATH: client files named anywhere in the row must exist.
        named_client = []
        for tok in tokens:
            m = re.match(r"^([\w./\[\]-]+\.(?:tsx|ts))(?::(\d+)(?:-(\d+))?)?$", tok)
            if not m:
                continue
            path, ln = m.group(1), m.group(3) or m.group(2)
            hits = files.get(path) or files.get(os.path.basename(path))
            if not hits:
                findings.append(f"PATH   {where}: `{tok}` names no file in app/ or src/")
                continue
            if built.get(path) or built.get(os.path.basename(path)):
                named_client.append(path)
            if ln:
                length = sum(1 for _ in open(os.path.join(ROOT, hits[0]), encoding="utf-8"))
                if int(ln) > length:
                    findings.append(f"PATH   {where}: `{tok}` is past the end of {hits[0]} ({length} lines)")

        # CLAIM: `NAME = value` must be what the source says.
        for tok in tokens:
            m = re.match(r"^([A-Z][A-Z0-9_]{2,})\s*=\s*(.+)$", tok)
            if m and not re.search(rf"\b{re.escape(m.group(1))}\s*=\s*{re.escape(m.group(2).strip())}", source):
                findings.append(f"CLAIM  {where}: `{tok}` is not what the source says")

        if status in UNBUILT:
            if named_client:
                findings.append(f"UNDER  {where}: {status}, yet it names {', '.join(sorted(set(named_client)))}, "
                                "which already exists: built, but marked unbuilt")
            else:
                findings.append(f"WISH   {where}: {status} and names no client identifier to build, "
                                "so nobody can check the status (\"a spec that names no identifier is a wish\")")

        if status == "DONE":
            link = re.search(r"\]\(([\w-]+)/SPEC\.md\)", row.get("Design", ""))
            if link:
                folder = os.path.join(DESIGN, link.group(1))
                spec = open(os.path.join(folder, "SPEC.md"), encoding="utf-8").read() if os.path.exists(os.path.join(folder, "SPEC.md")) else ""
                if not re.search(r"\*\*Status: `?DONE", spec):
                    findings.append(f"FORM   {where}: DONE on the board, but {link.group(1)}/SPEC.md does not say DONE")
                shots = os.listdir(os.path.join(folder, "ours")) if os.path.isdir(os.path.join(folder, "ours")) else []
                missing = [w for w in WIDTHS if not any(s.startswith(f"{w}-") for s in shots)]
                if missing:
                    findings.append(f"FORM   {where}: DONE, but {link.group(1)}/ours/ has no {', '.join(missing)} shot")
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", default=os.path.join(DESIGN, "README.md"))
    args = ap.parse_args()
    findings = check(args.board)
    for f in findings:
        print(f"  {f}")
    counted = sum(1 for _ in rows(args.board))
    print(f"board_check: {len(findings)} finding(s) over {counted} rows of {os.path.relpath(args.board, ROOT)}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
