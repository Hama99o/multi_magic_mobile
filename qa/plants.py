#!/usr/bin/env python3
"""CAN THE INSTRUMENTS STILL FAIL? Re-plant each one's proving defect, on demand.

    python3 qa/plants.py              # every plant in qa/plants/plants.json
    python3 qa/plants.py "store"      # only instruments whose name contains it

Every check in this repo was proved able to fail the day it was written. None
is re-proved after that, and a check that could fail this morning may not be
able to now: a renamed testID, a helper that stops seeing array children, a
sweep that quietly stops visiting a screen. The suite stays green either way.
This makes "it can still fail" a command, not a claim in a commit message.

For each plant: run the check on a CLEAN tree, where the expected reason must
be ABSENT (so a Jest reason is a FAILURE marker, `✕ <test>`: a bare test
name is printed on a pass too, and matched a clean tree on 2026-09-25); apply the plant (its target text must occur exactly once); run the
check, which must FAIL giving that reason; revert.

    BITES        red for the stated reason: the instrument still works
    DEAD         planted, and the check did not go red for that reason: it
                 stopped being able to, or it never could. A FINDING, not
                 something to fix quietly: say which, and why
    TARGET GONE  the planted text is no longer in the file; the plant needs
                 rewriting, and until then the instrument is unproved
    BASELINE     the reason already shows on a clean tree, so the plant
                 proves nothing
    NOT MEASURED the check fails on a CLEAN tree (the rig, not the plant):
                 nothing is proved either way

IT NEVER TOUCHES YOUR WORKING COPY. This tree is shared by several sessions,
and planting in it is how a sibling's `npm test` goes red on files it does not
own (CLAUDE.md, "Plant the break you claim to catch"). Every run happens in a
TEMPORARY `git worktree` of HEAD, removed on exit, on Ctrl-C and on TERM. So
it proves what is COMMITTED, not uncommitted edits, and it says so.

A person runs this. It is not in `npm test` and not in CI: it breaks things
on purpose, and it takes minutes.

Exit 0 every plant bites · 1 a finding (DEAD, TARGET GONE, BASELINE) · 3 not
measured (the rig could not be set up).
"""
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.environ.get("PLANTS_MANIFEST", os.path.join(ROOT, "qa", "plants", "plants.json"))
TMP = tempfile.mkdtemp(prefix="mm-plants-")
WT = os.path.join(TMP, "wt")


CHILD = [None]


def sh(cmd, cwd, env=None):
    """Each check in its OWN process group, so a signal can stop all of it
    (npx, node, Jest's workers), not only the shell, before the worktree it
    is running in is deleted from under it."""
    p = subprocess.Popen(cmd, cwd=cwd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, env=env, start_new_session=True)
    CHILD[0] = p
    out, _ = p.communicate()
    CHILD[0] = None
    return p.returncode, out


def cleanup(*_):
    """The trap: the running check and the worktree go, whatever happened."""
    child = CHILD[0]
    if child and child.poll() is None:
        try:
            os.killpg(child.pid, signal.SIGTERM)
            child.wait(timeout=10)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    if os.path.isdir(WT):
        subprocess.run(["git", "-C", ROOT, "worktree", "remove", "--force", WT], capture_output=True)
    subprocess.run(["git", "-C", ROOT, "worktree", "prune"], capture_output=True)
    shutil.rmtree(TMP, ignore_errors=True)


def on_signal(signum, _frame):
    cleanup()
    sys.exit(128 + signum)


def node_env():
    """Node 20+ for Jest, the .nvmrc one if this shell has an older one."""
    env = dict(os.environ)
    want = open(os.path.join(ROOT, ".nvmrc")).read().strip().lstrip("v")
    nvm_bin = os.path.expanduser(f"~/.nvm/versions/node/v{want}/bin")
    if os.path.isdir(nvm_bin):
        env["PATH"] = nvm_bin + os.pathsep + env["PATH"]
    return env


def main():
    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    plants = json.load(open(MANIFEST))
    only = sys.argv[1].lower() if len(sys.argv) > 1 else None
    if only:
        plants = [p for p in plants if only in p["instrument"].lower()]
    head = subprocess.run(["git", "-C", ROOT, "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()

    rc, out = sh(f'git worktree add --detach "{WT}" HEAD', ROOT)
    if rc != 0:
        print(f"NOT MEASURED: could not make a worktree of HEAD:\n{out}")
        return 3
    os.symlink(os.path.join(ROOT, "node_modules"), os.path.join(WT, "node_modules"))
    env = node_env()
    print(f"proving {len(plants)} instrument(s) at HEAD {head}, in a throwaway worktree (your working copy is not touched)")

    findings = 0
    unmeasured = 0
    for p in plants:
        name, expect = p["instrument"], re.compile(p["expect"])
        # A check that reads a SIBLING checkout (vocabulary.py reads
        # ../multi_magic) cannot find it from a worktree in /tmp: `env`
        # passes paths through, `{ROOT}` meaning the real checkout's root.
        env_p = dict(env, **{k: v.replace("{ROOT}", ROOT) for k, v in p.get("env", {}).items()})
        rc0, base = sh(p["check"], WT, env_p)
        # A clean baseline must PASS (unless the plant says its check is red
        # at baseline for another reason). A crash here is the RIG failing,
        # and on 2026-09-25 this runner first reported exactly that as DEAD:
        # a `git clean` had taken the node_modules symlink, and every Jest
        # run after it died on "Preset jest-expo not found".
        if rc0 != 0 and not p.get("baseline_red"):
            print(f"  NOT MEASURED {name}: the check fails on a CLEAN tree, so nothing can be proved: "
                  + (base.strip().splitlines() or ["(no output)"])[-1][:160])
            unmeasured += 1
            continue
        if expect.search(base):
            print(f"  BASELINE     {name}: the reason already shows on a clean tree; the plant proves nothing")
            findings += 1
            continue
        if "script" in p:
            rc, out = sh(p["script"], WT, env_p)
            if rc != 0:
                print(f"  TARGET GONE  {name}: the plant script failed: {out.strip()[:200]}")
                findings += 1
                continue
        else:
            path = os.path.join(WT, p["file"])
            text = open(path).read() if os.path.exists(path) else ""
            if text.count(p["old"]) != 1:
                print(f"  TARGET GONE  {name}: {p['file']} holds the planted text {text.count(p['old'])} times, not once")
                findings += 1
                continue
            open(path, "w").write(text.replace(p["old"], p["new"], 1))
        rc1, planted = sh(p["check"], WT, env_p)
        # `-e node_modules`: the symlink is untracked, and a plain clean took it.
        sh("git checkout -- . && git clean -fdq -e node_modules", WT)
        if rc1 != 0 and expect.search(planted):
            print(f"  BITES        {name}: \"{p['plant']}\" → red, for the stated reason")
        else:
            why = "the check passed" if rc1 == 0 else "it failed, but not for the stated reason"
            print(f"  DEAD         {name}: \"{p['plant']}\" → {why}. Either it stopped being able to fail, or it never could this way; find out which.")
            tail = "\n".join(planted.strip().splitlines()[-6:])
            print("               last lines:\n               " + tail.replace("\n", "\n               "))
            findings += 1
    print(f"proved at HEAD {head}: committed code only. Uncommitted edits in the working copy are NOT proved by this run.")
    if findings:
        return 1
    return 3 if unmeasured else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        cleanup()
