#!/usr/bin/env python3
"""
SMOOTHNESS CHECK for the notes editor (owner, 2026-11-13: "make sure editing
a note is smooth, nothing should break"). Runs on the host against the device
as it is NOW: the editor open on a [qa-edit] dev note, the caret in the body
(after flow 27 or 27f). Reads the result from the SERVER, so it measures the
whole path: keyboard → engine → codec → saver → API.

  typing    N chars in bursts of 50 via `adb input text`. Counts the tokens
            that reach the server missing or out of order (must be 0) and
            reads `dumpsys gfxinfo` (janky frames, %) for the typing.
            ── NO DOUBLED CHARACTER IN WHAT IT TYPES, and why: `adb input text`
            gives every key the same downTime, and engine B drops a key down
            whose (keyCode, downTime, repeatCount) equals the last one
            (EditorEditTextHardwareInput.kt, its duplicate-dispatch guard). So
            "aa" arrives as "a" from adb only; a real keyboard (IME commitText)
            or a physical key (its own downTime) is not affected. Measured
            2026-11-13: the title field (plain TextInput) kept "AAxx11yy", the
            body got "Ax1y", and three separate `input keyevent` Z gave "zzz".
  repeat    doubled characters typed as separate key events ("aa11bb"):
            they must all arrive (the guard above must not eat real keys).
  imetaps   doubled letters tapped on Gboard (the IME path users take),
            N ms apart (default 120; the keyboard must already be up).
  undo N    taps undo N times, then redo N times; the text must come back
            exactly (to the typed text and back again).
  offline   airplane mode, type a marker, back online: the marker is saved
            exactly once.
  kill      offline, type a marker, kill the app: the draft is on the phone
            (noteDrafts), not on the server. Then reopen (flow 27) and run
  restored  the draft reached the server, once.
  rotate    rotate with the keyboard up, then back: the app is still alive.
  locktype  type while toggling the lock: the app is still alive.

Usage: smooth_check.py <serial> <note_id> <check> [arg]
Env: QA_EMAIL, QA_PASSWORD, API (default http://localhost:3001).
Exit 0 = pass, 1 = fail. Prints one line of numbers per check.
"""
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

PKG = "com.multimagics.mobile"
API = os.environ.get("API", "http://localhost:3001")


def adb(serial, *args, timeout=60):
    return subprocess.run(["adb", "-s", serial, *args], capture_output=True, text=True, timeout=timeout).stdout


def token():
    req = urllib.request.Request(
        API + "/users/login",
        data=json.dumps({"user": {"email": os.environ["QA_EMAIL"], "password": os.environ["QA_PASSWORD"]}}).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    return urllib.request.urlopen(req).headers["Authorization"]


def server_text(tok, note_id):
    req = urllib.request.Request(f"{API}/api/v1/note_app/notes/{note_id}", headers={"Accept": "application/json", "Authorization": tok})
    note = json.load(urllib.request.urlopen(req))["note"]
    return html.unescape(re.sub(r"<[^>]+>", " ", note.get("description") or "")), note["updated_at"]


def bounds(serial):
    xml = adb(serial, "exec-out", "uiautomator", "dump", "/dev/tty")
    xml = xml[xml.find("<?xml"):xml.rfind(">") + 1] if "<?xml" in xml else xml
    found = {}
    try:
        for node in ET.fromstring(xml).iter("node"):
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds") or "")
            if m:
                key = node.get("resource-id") or ""
                found.setdefault(key, tuple(int(g) for g in m.groups()))
                if node.get("text"):
                    found.setdefault("text:" + node.get("text"), tuple(int(g) for g in m.groups()))
    except ET.ParseError:
        pass
    return found


def tap(serial, rid, b=None):
    b = b or bounds(serial)
    r = b.get(rid)
    if not r:
        raise SystemExit(f"FAIL {rid} not on screen")
    adb(serial, "shell", "input", "tap", str((r[0] + r[2]) // 2), str((r[1] + r[3]) // 2))


def type_text(serial, text, burst=50):
    for i in range(0, len(text), burst):
        adb(serial, "shell", "input", "text", text[i:i + burst].replace(" ", "%s"))


def wait_saved(tok, note_id, needle, timeout=30):
    """The server text once it contains `needle` (or the last one seen)."""
    end = time.time() + timeout
    text = ""
    while time.time() < end:
        text, _ = server_text(tok, note_id)
        if needle in text:
            time.sleep(3)  # a burst still in the debounce
            return server_text(tok, note_id)[0]
        time.sleep(1)
    return text


def alive(serial):
    return bool(adb(serial, "shell", "pidof", PKG).strip())


def jank(serial):
    out = adb(serial, "shell", "dumpsys", "gfxinfo", PKG)
    total = re.search(r"Total frames rendered: (\d+)", out)
    janky = re.search(r"Janky frames: (\d+) \(([\d.]+)%\)", out)
    p90 = re.search(r"90th percentile: (\d+)ms", out)
    return {
        "frames": int(total.group(1)) if total else None,
        "janky": int(janky.group(1)) if janky else None,
        "jank_pct": float(janky.group(2)) if janky else None,
        "p90_ms": int(p90.group(1)) if p90 else None,
    }


def spaced(digits):
    """Digits with a letter between each, so no character repeats (see above)."""
    return "".join(f"{'abcdefghij'[i % 10]}{d}" for i, d in enumerate(digits))


def mark(prefix):
    return prefix + spaced(str(int(time.time()) % 100000))


def check_typing(serial, tok, note_id, n):
    run = spaced(str(int(time.time()) % 1000))
    tokens = [f"k{run}x{spaced(f'{i:03d}')}" for i in range(max(1, n // 15))]
    text = " ".join(tokens) + " "
    adb(serial, "shell", "dumpsys", "gfxinfo", PKG, "reset")
    t0 = time.time()
    type_text(serial, text)
    typed_s = time.time() - t0
    frames = jank(serial)
    saved = wait_saved(tok, note_id, tokens[-1], timeout=60)
    got = [m.replace("a", "").replace("b", "").replace("c", "") for m in re.findall(rf"k{run}x(a\db\dc\d)", saved)]
    want = [f"{i:03d}" for i in range(len(tokens))]
    missing = len(set(want) - set(got))
    reordered = sum(1 for a, b in zip(got, got[1:]) if int(b) != int(a) + 1)
    # A token cut in two by a lost or moved char does not match the regex: missing.
    ok = missing == 0 and reordered == 0 and len(got) == len(want)
    print(json.dumps({"check": "typing", "chars": len(text), "seconds": round(typed_s, 1), "missing_tokens": missing, "reordered": reordered, **frames, "pass": ok}))
    return ok


def check_undo(serial, tok, note_id, n):
    before, _ = server_text(tok, note_id)
    b = bounds(serial)
    if "tb-closePanel" in b:  # a panel left open replaces undo/redo
        tap(serial, "tb-closePanel", b)
        time.sleep(0.5)
        b = bounds(serial)
    for _ in range(n):
        tap(serial, "tb-undo", b)
        time.sleep(0.15)
    time.sleep(4)
    undone, _ = server_text(tok, note_id)
    b = bounds(serial)
    for _ in range(n):
        tap(serial, "tb-redo", b)
        time.sleep(0.15)
    time.sleep(4)
    redone, _ = server_text(tok, note_id)
    norm = lambda s: re.sub(r"\s+", " ", s).strip()
    ok = norm(redone) == norm(before) and alive(serial)
    print(json.dumps({"check": "undo", "steps": n, "changed_by_undo": norm(undone) != norm(before), "redo_exact": norm(redone) == norm(before), "pass": ok}))
    return ok


def check_offline(serial, tok, note_id):
    marker = mark("ofline")
    adb(serial, "shell", "cmd", "connectivity", "airplane-mode", "enable")
    time.sleep(2)
    type_text(serial, f" {marker} ")
    time.sleep(6)
    adb(serial, "shell", "cmd", "connectivity", "airplane-mode", "disable")
    saved = wait_saved(tok, note_id, marker, timeout=90)
    count = saved.count(marker)
    ok = count == 1 and alive(serial)
    print(json.dumps({"check": "offline", "marker_saved_times": count, "pass": ok}))
    return ok


def check_kill(serial, tok, note_id):
    """Killed mid-edit, offline so the text is on the phone only: the draft is
    on disk. The runner then reopens the note (flow 27) and checks `restored`."""
    marker = mark("kil")
    adb(serial, "shell", "cmd", "connectivity", "airplane-mode", "enable")
    time.sleep(2)
    type_text(serial, f" {marker}")
    time.sleep(2)  # past the keystrokes; the draft is written at once
    adb(serial, "shell", "am", "force-stop", PKG)
    adb(serial, "shell", "cmd", "connectivity", "airplane-mode", "disable")
    saved, _ = server_text(tok, note_id)
    names = adb(serial, "shell", "run-as", PKG, "ls", "files/note-drafts").split()
    drafts = "".join(adb(serial, "exec-out", "run-as", PKG, "cat", f"files/note-drafts/{n}") for n in names)
    on_phone = marker in drafts
    ok = on_phone and marker not in saved
    print(json.dumps({"check": "kill", "draft_on_phone": on_phone, "on_server_before_reopen": marker in saved, "marker": marker, "pass": ok}))
    with open(os.path.join(os.environ.get("SMOOTH_OUT", "/tmp"), "kill-marker"), "w") as f:
        f.write(marker)
    return ok


def check_restored(tok, note_id):
    """After the reopen: the killed draft reached the server, once."""
    marker = open(os.path.join(os.environ.get("SMOOTH_OUT", "/tmp"), "kill-marker")).read().strip()
    saved = wait_saved(tok, note_id, marker, timeout=60)
    count = saved.count(marker)
    print(json.dumps({"check": "restored", "marker": marker, "saved_times": count, "pass": count == 1}))
    return count == 1


def check_repeat(serial, tok, note_id):
    marker = mark("rep")
    type_text(serial, f" {marker} ")
    keys = ["KEYCODE_A", "KEYCODE_A", "KEYCODE_1", "KEYCODE_1", "KEYCODE_B", "KEYCODE_B"]
    for k in keys:
        adb(serial, "shell", "input", "keyevent", k)
    saved = wait_saved(tok, note_id, marker + " aa11bb", timeout=30)
    ok = (marker + " aa11bb") in saved
    got = saved[saved.find(marker):saved.find(marker) + len(marker) + 10] if marker in saved else None
    print(json.dumps({"check": "repeat", "sent": "aa11bb", "got": got, "pass": ok}))
    return ok


# Gboard's English layout on qa_phone3 (1080x2400, keyboard up), measured from
# a screenshot on 2026-11-13. Taps on these keys go through the IME
# (commitText / composing text), the path a user's typing takes.
GBOARD = {
    "q": (58, 1716), "w": (165, 1716), "e": (272, 1716), "r": (379, 1716), "t": (486, 1716), "y": (593, 1716),
    "u": (700, 1716), "i": (807, 1716), "o": (914, 1716), "p": (1021, 1716),
    "a": (112, 1866), "s": (218, 1866), "d": (325, 1866), "f": (432, 1866), "g": (539, 1866), "h": (646, 1866),
    "j": (753, 1866), "k": (860, 1866), "l": (967, 1866),
    "z": (218, 2022), "x": (325, 2022), "c": (432, 2022), "v": (539, 2022), "b": (646, 2022), "n": (753, 2022), "m": (860, 2022),
    " ": (592, 2178),
}


def check_imetaps(serial, tok, note_id, gap_ms):
    """Doubled letters typed on the soft keyboard, `gap_ms` apart."""
    word = "aabbccoffkeep"
    adb(serial, "shell", "input", "tap", *map(str, GBOARD[" "]))
    script = "; ".join(f"input tap {GBOARD[ch][0]} {GBOARD[ch][1]}; sleep {gap_ms / 1000:.3f}" for ch in word)
    adb(serial, "shell", script, timeout=120)
    # A tap back in the body commits the composing word as typed (Back would
    # leave the screen once the keyboard is down; the title may be scrolled off).
    tap(serial, "note-edit-body")
    saved = wait_saved(tok, note_id, word, timeout=30)
    ok = word in saved
    i = saved.rfind("aab")
    print(json.dumps({"check": "imetaps", "gap_ms": gap_ms, "sent": word, "got": saved[i:i + len(word) + 4] if i >= 0 else None, "pass": ok}))
    return ok


def check_rotate(serial):
    adb(serial, "shell", "settings", "put", "system", "accelerometer_rotation", "0")
    crashes = []
    for rot in ("1", "0", "1", "0"):
        adb(serial, "shell", "settings", "put", "system", "user_rotation", rot)
        time.sleep(3)
        if not alive(serial):
            crashes.append(rot)
    crash_log = adb(serial, "logcat", "-d", "-b", "crash")
    ok = not crashes and PKG not in crash_log
    print(json.dumps({"check": "rotate", "rotations": 4, "dead_after": crashes, "pass": ok}))
    return ok


def check_locktype(serial):
    b = bounds(serial)
    proc = subprocess.Popen(["adb", "-s", serial, "shell", "input", "text", "lockwhiletyping%s" * 6])
    for _ in range(4):
        tap(serial, "note-edit-lock", b)
        time.sleep(0.4)
    proc.wait(timeout=60)
    time.sleep(2)
    crash_log = adb(serial, "logcat", "-d", "-b", "crash")
    ok = alive(serial) and PKG not in crash_log
    print(json.dumps({"check": "locktype", "lock_taps": 4, "alive": alive(serial), "pass": ok}))
    return ok


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    serial, note_id, check = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    arg = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    tok = token()
    adb(serial, "logcat", "-c", "-b", "crash")
    ok = {
        "typing": lambda: check_typing(serial, tok, note_id, arg or 550),
        "undo": lambda: check_undo(serial, tok, note_id, arg or 30),
        "offline": lambda: check_offline(serial, tok, note_id),
        "kill": lambda: check_kill(serial, tok, note_id),
        "restored": lambda: check_restored(tok, note_id),
        "repeat": lambda: check_repeat(serial, tok, note_id),
        "imetaps": lambda: check_imetaps(serial, tok, note_id, arg or 120),
        "rotate": lambda: check_rotate(serial),
        "locktype": lambda: check_locktype(serial),
    }[check]()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
