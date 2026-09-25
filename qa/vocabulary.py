#!/usr/bin/env python3
"""STRICT vocabulary pairs: every value the SERVER sends that the app must
handle, checked against what the app actually names (karwan-mobile's
practice, 2026-09-25). Reads the sibling multi_magic checkout.

Two kinds of pair, because a value can matter in two directions:
- EXHAUSTIVE (server ⊆ app): the app must handle every value the server can
  send. A server value the app does not name FAILS. App-only values are
  "app ahead", allowed.
- EXISTS (app ⊆ server): a code the app BRANCHES ON must still exist on the
  server. A rename there would leave the app's branch matching nothing.

Traps karwan-42 paid for, guarded here:
- An EMPTY capture is BROKEN, never "same": two empty sets compare equal.
- Comments are stripped before scraping, so prose cannot become values.
- Captures are SCOPED (one file, one construct), so an unrelated `role: 'tool'`
  (an LLM call) or a UI state `kind === "menu"` is not swept in.
- A pair that cannot be read reports BROKEN; it never passes silently.

Not pairable, and why (so nobody adds a sloppy scrape): MessageRole has no
server enum (the messages table has no constraint), and a scrape of
`role: '…'` sweeps in LLM and Flow roles.

Exit 0 all good · 1 a STRICT mismatch · 2 BROKEN · 3 NOT MEASURED (no sibling
multi_magic checkout, as in CI).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.environ.get("MULTI_MAGIC_DIR", os.path.join(os.path.dirname(ROOT), "multi_magic"))


def read(base, rel, lang):
    path = os.path.join(base, rel)
    if not os.path.exists(path):
        return None
    text = open(path, encoding="utf-8").read()
    if lang == "ruby":
        text = re.sub(r"(?m)^\s*#.*$", "", text)
    else:
        text = re.sub(r"/\*[\s\S]*?\*/", "", text)
        text = re.sub(r"(?m)^\s*//.*$", "", text)
    return text


def scrape(base, rel, lang, pattern, inner=None):
    text = read(base, rel, lang)
    if text is None:
        return None
    values = set()
    for m in re.finditer(pattern, text):
        block = m.group(1)
        values.update(re.findall(inner, block) if inner else [block])
    return values


# (name, mode, server capture, app capture). A capture is
# (file, lang, pattern, optional inner pattern applied to group 1).
PAIRS = [
    ("thumb ratings", "exhaustive",
     ("app/models/ai_feedback.rb", "ruby", r"RATINGS\s*=\s*%w\[([^\]]*)\]", r"[a-z_]+"),
     ("src/api/ai.ts", "ts", r"export type Rating\s*=\s*([^;]+);", r'"([a-z_]+)"')),
    ("key_problem codes", "exhaustive",
     ("app/jobs/ai/rag_chat_job.rb", "ruby", r"(?:\[\s*'([a-z_]+)',|'key_problem' => '([a-z_]+)')", None),
     ("src/api/ai.ts", "ts", r"export const KEY_PROBLEMS\s*=\s*\[([^\]]*)\]", r'"([a-z_]+)"')),
    ("document statuses", "exhaustive",
     ("app/models/ai_document.rb", "ruby", r"enum :status,\s*\{([^}]*)\}", r"([a-z_]+):"),
     ("src/api/ai.ts", "ts", r'status:\s*("pending"[^;]*);', r'"([a-z_]+)"')),
    ("password refusal code", "exists",
     ("app/controllers/api/v1/users_controller.rb", "ruby", r"code: '([a-z_]+)'", None),
     ("src/api/profile.ts", "ts", r'code === "([a-z_]+)"', None)),
    ("notification kinds the app branches on", "exists",
     ("app/services/ai/morning_brief.rb", "ruby", r"kind: '([a-z_.]+)'", None),
     ("src/screens/people/NotificationRow.tsx", "ts", r'notification\.kind === "([a-z_.]+)"', None)),
]


def flatten(values):
    out = set()
    for v in values or []:
        if isinstance(v, tuple):
            out.update(x for x in v if x)
        elif v:
            out.add(v)
    return out


def capture(base, spec):
    rel, lang, pattern, inner = spec
    text = read(base, rel, lang)
    if text is None:
        return None
    if inner:
        return scrape(base, rel, lang, pattern, inner)
    found = set()
    for m in re.finditer(pattern, text):
        found.update(g for g in m.groups() if g)
    return found


def main():
    if not os.path.isdir(os.path.join(SERVER, "app")):
        print(f"NOT MEASURED: no multi_magic checkout at {SERVER}")
        return 3
    if len(PAIRS) < 5:
        print("BROKEN: the pair list was emptied")
        return 2
    status = 0
    for name, mode, server_spec, app_spec in PAIRS:
        server = flatten(capture(SERVER, server_spec))
        app = flatten(capture(ROOT, app_spec))
        if not server or not app:
            side = "server" if not server else "app"
            print(f"  BROKEN    {name}: the {side} side captured nothing (a moved file or a changed shape)")
            status = max(status, 2)
            continue
        missing = (server - app) if mode == "exhaustive" else (app - server)
        where = "the app does not handle" if mode == "exhaustive" else "the server no longer sends"
        if missing:
            print(f"  MISMATCH  {name}: {where} {sorted(missing)}  (server {len(server)}, app {len(app)})")
            status = max(status, 1)
        else:
            print(f"  ok        {name} [{mode}]: server {len(server)}, app {len(app)}")
    return status


if __name__ == "__main__":
    sys.exit(main())
