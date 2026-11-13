#!/usr/bin/env python3
"""
KEYBOARD OCCLUSION CHECK for the notes editor (owner, 2026-11-13: "make sure
we check the keyboard hiding places"). Maestro cannot see the soft keyboard,
so this runs on the host against the device as it is NOW, with the keyboard
up:

  - the keyboard's top edge, from `dumpsys window` (the InputMethod window's
    frame, or the IME insets);
  - the bounds of the note toolbar (testID note-toolbar), the body
    (note-edit-body), the save state (note-edit-state) and any element the
    caller names, from a uiautomator dump.

PASS when the toolbar sits on or above the keyboard's top, the body ends at
or above the toolbar's top, and every named element is fully above the
keyboard. The caret line itself is not in the view tree (the engine draws
it), so the screenshot taken alongside is what shows it: the body ending
above the toolbar is the condition that makes a visible caret possible.

Usage: keyboard_check.py <serial> [extra-resource-id ...]
Exit 0 = pass, 1 = fail, 2 = keyboard not up / cannot read.
"""
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


def adb(serial, *args):
    return subprocess.run(["adb", "-s", serial, *args], capture_output=True, text=True, timeout=60).stdout


def keyboard_top(serial):
    out = adb(serial, "shell", "dumpsys", "input_method")
    if not re.search(r"mInputShown=true|mIsInputViewShown=true|isInputViewShown=true", out):
        return None
    win = adb(serial, "shell", "dumpsys", "window", "InputMethod")
    tops = [int(m.group(1)) for m in re.finditer(r"(?:mFrame|frame)=\[\d+,(\d+)\]\[\d+,\d+\]", win)]
    tops = [t for t in tops if t > 0]
    if tops:
        return max(tops)
    ins = adb(serial, "shell", "dumpsys", "window", "windows")
    m = re.search(r"imeInsets.*?Rect\(\d+, (\d+) - \d+, \d+\)", ins)
    return int(m.group(1)) if m else None


def bounds(serial):
    xml = adb(serial, "exec-out", "uiautomator", "dump", "/dev/tty")
    xml = xml[xml.find("<?xml"):xml.rfind(">") + 1] if "<?xml" in xml else xml
    found = {}
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return found
    for node in root.iter("node"):
        rid = node.get("resource-id") or ""
        m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds") or "")
        if rid and m:
            found.setdefault(rid, tuple(int(g) for g in m.groups()))
    return found


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    serial, extra = sys.argv[1], sys.argv[2:]
    top = keyboard_top(serial)
    if top is None:
        print("NO KEYBOARD: the soft keyboard is not up (or its frame could not be read)")
        return 2
    b = bounds(serial)
    problems = []
    toolbar = b.get("note-toolbar")
    body = b.get("note-edit-body")
    if not toolbar:
        problems.append("note-toolbar not on screen")
    elif toolbar[3] > top:
        problems.append(f"toolbar bottom {toolbar[3]} is under the keyboard top {top}")
    if body and toolbar and body[3] > toolbar[1]:
        problems.append(f"body bottom {body[3]} runs under the toolbar top {toolbar[1]}")
    for rid in ["note-edit-state", *extra]:
        r = b.get(rid)
        if r is None:
            if rid in extra:
                problems.append(f"{rid} not on screen")
            continue
        if r[3] > top:
            problems.append(f"{rid} bottom {r[3]} is under the keyboard top {top}")
    if problems:
        print("FAIL keyboard top", top, "|", "; ".join(problems))
        return 1
    print(f"PASS keyboard top {top}; toolbar {toolbar}; body {body}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
