#!/usr/bin/env python3
"""epoch_probe.py's decisions, with no device and no server: the invented
note it seeds, the next size it tries, the verdict it gives one size, and the
token it types. Run: python3 qa/scripts/epoch_probe_test.py (exit 1 = a FAIL).
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import epoch_probe as p  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}{'' if ok else f'  ({detail})'}")
    if not ok:
        FAILS.append(name)


# ── the seeded note: invented, the size asked for, the same every run ──
for kb in (10, 100, 450):
    h = p.note_html(kb * 1000)
    check(f"note_html {kb} KB reaches the size", kb * 1000 <= len(h) < kb * 1000 + 4000, len(h))
check("note_html is the same every run", p.note_html(50_000) == p.note_html(50_000))
h = p.note_html(120_000)
check("note_html has the shapes of a long note", all(t in h for t in ("<h2>", "<ul>", "<table>", "<strong>")))
words = set(re.findall(r"[a-z]+", re.sub(r"<[^>]+>", " ", h).lower()))
allowed = set(p.WORDS) | {"long", "invented", "note", "for", "the", "epoch", "probe", "section"}
check("note_html uses only the invented word list", words <= allowed, sorted(words - allowed)[:5])

st = p.note_stats(p.note_html(30_000))
check("note_stats counts bytes, text and top-level blocks",
      st["html_bytes"] >= 30_000 and 0 < st["text_chars"] < st["html_bytes"] and st["blocks"] > 10, st)

# ── the next size: the ladder first, then halve the gap ────────────────
L = [100, 200, 400]
check("first size is the ladder's first", p.next_kb({}, L, 25) == 100)
check("ladder goes on while editable", p.next_kb({100: "editable"}, L, 25) == 200)
check("the first refused size stops the ladder and bisects",
      p.next_kb({100: "editable", 200: "refused"}, L, 25) == 150)
check("bisects inside the narrowest gap",
      p.next_kb({100: "editable", 150: "refused", 200: "refused"}, L, 25) == 125)
check("stops once the gap is within the resolution",
      p.next_kb({100: "editable", 125: "refused"}, L, 25) is None)
check("rounds to whole KB", p.next_kb({100: "editable", 101: "refused"}, L, 1) is None)
check("all editable: stops after the ladder", p.next_kb({k: "editable" for k in L}, L, 25) is None)
check("smallest refused: probes below it",
      p.next_kb({100: "refused"}, L, 25) == 50)
check("an unclear size is retried once, then skipped as a bound",
      p.next_kb({100: "editable", 200: "unclear"}, L, 25) == 200
      and p.next_kb({100: "editable", 200: "unclear!"}, L, 25) == 400)
lo, hi = p.bounds_kb({100: "editable", 125: "refused", 150: "refused", 90: "editable"})
check("bounds are the largest editable and the smallest refused", (lo, hi) == (100, 125), (lo, hi))
check("a refused size BELOW an editable one is reported, not hidden",
      p.inconsistent({100: "refused", 150: "editable"}) == [(100, 150)])

# ── the verdict for one size ───────────────────────────────────────────
ok = dict(seen={"note-edit-body"}, typed=True, saved=True, b_errors=0, refused_after=False)
check("verdict editable: body, typed, saved, no B error", p.verdict(**ok) == "editable")
check("verdict refused: the cannot-open view", p.verdict(**{**ok, "seen": {"note-edit-cannot-open"}}) == "refused")
check("verdict refused: B error after typing", p.verdict(**{**ok, "b_errors": 1}) == "refused")
check("verdict refused: cannot-open shown after typing", p.verdict(**{**ok, "refused_after": True}) == "refused")
check("verdict unclear: the typed token never reached the server", p.verdict(**{**ok, "saved": False}) == "unclear")
check("verdict unclear: nothing opened", p.verdict(**{**ok, "seen": set(), "typed": False, "saved": False}) == "unclear")

# ── the typed token: adb drops a doubled character in engine B ─────────
for seed in range(200):
    t = p.token(seed)
    # Digits only: Gboard autocorrects a letter token on the next space
    # ("epqzk7" -> "epqz", device 2026-11-14), so the server never had it.
    if re.search(r"(.)\1", t) or not re.fullmatch(r"[1-9][0-9]{7,}", t):
        check("token has no doubled character", False, t)
        break
else:
    check("token has no doubled character (200 seeds)", True)
check("tokens differ", len({p.token(s) for s in range(200)}) == 200)

print(f"epoch_probe: {len(FAILS)} failed" if FAILS else "epoch_probe: all ok")
sys.exit(1 if FAILS else 0)
