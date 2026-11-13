#!/usr/bin/env python3
"""patches/*.patch hold source changes only. The engine B patch once carried
1577 diffs of Android build output (1.2 MB, binary .dex/.jar, and the
machine's own /home/... paths in a public repo) around its 2 real source
changes (2026-11-13). Runs in test:qa; needs nothing installed.

Usage: patches_test.py [patch ...]   (default: every file in patches/)
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = re.compile(rb"/(?:build|\.cxx|\.gradle|Pods|DerivedData)/")
LOCAL = re.compile(rb"/(?:home|Users)/[A-Za-z0-9._-]+/")
FAILS = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}{'' if ok else f'  ({detail})'}")
    if not ok:
        FAILS.append(name)


paths = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "patches", "*.patch")))
check("there are patches to check", bool(paths))
for p in paths:
    name = os.path.basename(p)
    data = open(p, "rb").read()
    targets = re.findall(rb"(?m)^diff --git a/(\S+)", data)
    built = [t.decode(errors="replace") for t in targets if BUILD.search(t)]
    check(f"{name}: no build output patched", not built, f"{len(built)} e.g. {built[:2]}")
    local = LOCAL.findall(data)
    check(f"{name}: no local machine paths", not local, f"{len(local)} e.g. {local[:1]}")
    check(f"{name}: no binary diffs", b"GIT binary patch" not in data and b"Binary files" not in data)
    check(f"{name}: under 100 KB", len(data) < 100_000, f"{len(data)} bytes")

print(f"patches: {len(FAILS)} failed" if FAILS else "patches: all ok")
sys.exit(1 if FAILS else 0)
