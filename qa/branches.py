#!/usr/bin/env python3
"""Which branch each flow ACTUALLY took, read from the run rather than the file.

  python3 qa/branches.py                       # the newest run under ~/.maestro/tests
  python3 qa/branches.py 2026-09-23_095651     # that run
  python3 qa/branches.py --all                 # include helpers' branches (login.yaml …)

── WHY THIS EXISTS ────────────────────────────────────────────────────────
`qa/FLOW_REGISTER.md`, "What run 9 would need", item 5: "A sweep that does not
name its branches is a number, not a result." `07` and `08` pass on their
EMPTY branches because the QA account has no notifications and no events, and
`15`'s at-limit branch has never executed. A PASS says none of that. The exit
code is the same whichever side of a `runFlow: when:` ran.

The answer is already on disk. Maestro writes every command of a flow to
`~/.maestro/tests/<run>/<flow>/commands.json`, and a conditional `runFlow`
there carries its `condition` and a status: COMPLETED when the branch ran,
SKIPPED when its condition was false. This prints those, per flow, so the
report of a sweep can say "07: notifications-empty RAN, the populated branch
SKIPPED" instead of "07: PASS".

── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────
- A branch nested inside one that was skipped never appears at all — Maestro
  does not record commands it never reached. Printed as absent, not skipped.
- It reports the CONDITION, not your intent. `notVisible: sessions-at-limit`
  is the "not at the cap" branch because the flow's comment says so; this
  script does not know that.
- A flow that failed before reaching a branch has no entry for it either.
  Read the status column with the flow's own verdict beside it.

Helpers' branches (`login.yaml`'s dev-menu and signed-in probes) are attributed
to the helper, through the `sourceDescription` Maestro puts on a file
`runFlow`, and hidden unless `--all`: they are the same every flow and would
bury the ones that differ.

Exit 3 when there is no run to read — NOT MEASURED, as everywhere in `qa/`.
"""
import glob
import json
import os
import sys
from collections import OrderedDict

RUNS = os.path.expanduser("~/.maestro/tests")


def describe(cond):
    """`{"visible": {"idRegex": "x"}}` → `visible id=x`."""
    parts = []
    for kind in ("visible", "notVisible"):
        sel = cond.get(kind)
        if not sel:
            continue
        bits = [f"{k.replace('Regex', '')}={v}" for k, v in sel.items()
                if k.endswith("Regex")]
        parts.append(f"{kind} " + " ".join(bits))
    if cond.get("platform"):
        parts.append(f"platform={cond['platform']}")
    if cond.get("scriptCondition"):
        parts.append(f"true={cond['scriptCondition']}")
    return " AND ".join(parts) or json.dumps(cond)


def branches(commands):
    """[(source, condition, status)] for every conditional runFlow, in order."""
    out = []
    stack = []  # (depth, source) for each open file runFlow
    for entry in commands:
        meta = entry.get("metadata", {})
        depth = meta.get("depth", 0)
        while stack and depth <= stack[-1][0]:
            stack.pop()
        source = stack[-1][1] if stack else None
        cmd = entry.get("command", {}).get("runFlowCommand")
        if not cmd:
            continue
        if cmd.get("sourceDescription"):
            stack.append((depth, cmd["sourceDescription"]))
        if cmd.get("condition"):
            out.append((source, describe(cmd["condition"]), meta.get("status", "?")))
    return out


def main(argv):
    show_all = "--all" in argv
    args = [a for a in argv if not a.startswith("--")]
    runs = sorted(os.listdir(RUNS)) if os.path.isdir(RUNS) else []
    run = args[0] if args else (runs[-1] if runs else None)
    if not run or not os.path.isdir(os.path.join(RUNS, run)):
        print(f"NOT MEASURED — no run at {RUNS}/{run or '<none>'}")
        return 3

    print(f"Branches taken in {run}")
    flows = sorted(glob.glob(os.path.join(RUNS, run, "*", "commands.json")))
    if not flows:
        print("  NOT MEASURED — no flow in this run wrote a commands.json")
        return 3
    for path in flows:
        flow = os.path.basename(os.path.dirname(path))
        try:
            with open(path) as f:
                taken = branches(json.load(f))
        except (OSError, ValueError) as e:
            print(f"\n{flow}\n  unreadable commands.json: {e}")
            continue
        # A branch inside a `repeat` is recorded once per iteration; fold them.
        tally = OrderedDict()
        for source, cond, status in taken:
            if source and not show_all:
                continue
            tally.setdefault((source, cond), OrderedDict())
            tally[(source, cond)][status] = tally[(source, cond)].get(status, 0) + 1
        print(f"\n{flow}")
        if not tally:
            print("  (no branches of its own)")
        for (source, cond), statuses in tally.items():
            # FAILED outranks everything; a branch inside a `repeat` that ran
            # once and was skipped on the next pass RAN; RUNNING means the
            # run ended inside it — it started and was never finished.
            if "FAILED" in statuses:
                ran = "FAILED "
            elif "COMPLETED" in statuses:
                ran = "RAN    "
            elif "RUNNING" in statuses:
                ran = "STOPPED"
            else:
                ran = "skipped"
            counts = ", ".join(f"{s.lower()} ×{n}" for s, n in statuses.items())
            where = f"[{source}] " if source else ""
            print(f"  {ran} {where}{cond}   ({counts})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
