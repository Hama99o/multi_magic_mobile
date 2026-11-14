#!/usr/bin/env python3
"""
EPOCH PROBE: the note size above which engine B refuses to edit a note.

Device QA 2026-11-13: a 900 KB note fails in B with
`POSITION_EPOCH_LIMIT_EXCEEDED: position epoch exceeds
maxPositionEpochRetainedBytes`. The editor then shows the read view
(`note-edit-cannot-open`) and sends nothing. Small dev notes edit fine. The
size in between was NOT MEASURED, because the earlier probe went through the
list and search and kept losing its way in the app. This one never navigates:
  1. seeds an INVENTED note "[qa-edit] epoch <kb>k" of that many KB (the
     shapes of a long note: headings, paragraphs with bold, lists, tables).
     It never touches any other note;
  2. stops the app and opens the note by deep link:
     multimagic://notes/edit?id=<id>;
  3. waits for the editor (`note-edit-body`) or the read view
     (`note-edit-cannot-open`);
  4. in the editor, types a token into the body and checks that the server
     got it, that the read view did not come up, and that logcat has no
     "engine B" warning;
  5. tries a ladder of sizes, then halves the gap between the largest
     editable size and the smallest refused one, down to `--step` KB.

Needs: the dev build installed and SIGNED IN to the QA account, Metro
running, the API at $API (default http://localhost:3001), QA_EMAIL and
QA_PASSWORD. The box is short of RAM: it refuses to start under 2 GB free
(ask Hello for the device slot first).

Usage: epoch_probe.py <serial> [--ladder 100,200,400,600,800] [--step 25]
                      [--out results.jsonl] [--dev-url http://10.0.2.2:3041]
A dev build opens its launcher on a cold deep link: with --dev-url the
probe first loads the app from that Metro, then sends the note's link
(device, 2026-11-14).
Prints one JSON line per size, then a summary line. Exit 0 = a threshold was
bracketed (or every size edited); exit 1 = it could not tell.

The typed token has no doubled character: `adb input text` drops the second
of two identical keys in engine B (see smooth_check.py).
"""
import argparse
import html as htmllib
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

PKG = "com.multimagics.mobile"
API = os.environ.get("API", "http://localhost:3001")
WORDS = ("river lantern copper meadow orbit velvet harbor quiet pixel maple "
         "ember canyon falcon garnet island jasmine kettle lemon marble nectar").split()
TITLE = "[qa-edit] epoch {kb}k"


# ── pure parts (epoch_probe_test.py) ───────────────────────────────────
def note_html(target_bytes, seed=7):
    """Invented HTML of at least `target_bytes`, the same every run."""
    r = random.Random(seed)

    def sent(n):
        return " ".join(r.choice(WORDS) for _ in range(n)).capitalize() + "."

    parts = ["<p>Long invented note for the epoch probe.</p>"]
    size = len(parts[0])
    i = 0
    while size < target_bytes:
        i += 1
        block = [f"<h2>Section {i}</h2>"]
        block += [f"<p>{sent(40)} <strong>{sent(5)}</strong> {sent(30)}</p>" for _ in range(2)]
        if i % 2 == 0:
            block.append("<ul>" + "".join(f"<li><p>{sent(8)}</p></li>" for _ in range(3)) + "</ul>")
        if i % 6 == 0:
            block.append("<table><tbody>" + "".join(
                "<tr>" + "".join(f"<td><p>{sent(3)}</p></td>" for _ in range(3)) + "</tr>"
                for _ in range(3)) + "</tbody></table>")
        parts += block
        size += sum(map(len, block))
    return "".join(parts)


def note_stats(h):
    text = htmllib.unescape(re.sub(r"<[^>]+>", "", h))
    blocks = len(re.findall(r"<(?:p|h[1-6]|ul|ol|table|pre|blockquote|hr)\b", h)) - \
        len(re.findall(r"<(?:li|td|th)>\s*<p\b", h))
    return {"html_bytes": len(h.encode()), "text_chars": len(text), "blocks": blocks}


def _settled(results):
    """Verdicts that count as bounds: an 'unclear' size retried once and
    still unclear is stored as 'unclear!' and skipped."""
    return {k: v for k, v in results.items() if v in ("editable", "refused")}


def bounds_kb(results):
    s = _settled(results)
    ok = [k for k, v in s.items() if v == "editable"]
    no = [k for k, v in s.items() if v == "refused"]
    return (max(ok) if ok else None), (min(no) if no else None)


def inconsistent(results):
    """(refused, editable) pairs where a smaller size was refused but a
    larger one edited: the limit is not only about size."""
    s = _settled(results)
    return sorted((a, b) for a, va in s.items() for b, vb in s.items()
                  if va == "refused" and vb == "editable" and a < b)


def next_kb(results, ladder, step):
    """The next size to try (KB), or None when done."""
    for k, v in results.items():
        if v == "unclear":
            return k
    lo, hi = bounds_kb(results)
    if hi is None:
        for k in ladder:
            if k not in results:
                return k
        return None
    lo = lo if lo is not None and lo < hi else 0
    if hi - lo <= step:
        return None
    mid = (lo + hi) // 2
    return mid if mid not in results and lo < mid < hi else None


def verdict(seen, typed, saved, b_errors, refused_after):
    if "note-edit-cannot-open" in seen or b_errors or refused_after:
        return "refused"
    if "note-edit-body" in seen and typed and saved:
        return "editable"
    return "unclear"


def token(seed):
    """ep + base-36 digits of the seed and the clock, with no character
    twice in a row."""
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    n = seed * 7919 + int(time.time() * 1000) % 10**9 * 1000 + seed
    out = "ep"
    while n or len(out) < 8:
        n, d = divmod(n, 36)
        c = alphabet[d]
        if c == out[-1]:
            c = alphabet[(d + 1) % 36]
        out += c
    return out


# ── device and server ──────────────────────────────────────────────────
def adb(serial, *args, timeout=120):
    return subprocess.run(["adb", "-s", serial, *args], capture_output=True, text=True, timeout=timeout).stdout


def api(method, path, tok=None, body=None):
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if tok:
        h["Authorization"] = tok
    req = urllib.request.Request(API + path, method=method, headers=h,
                                 data=json.dumps(body).encode() if body is not None else None)
    return urllib.request.urlopen(req, timeout=60)


def login():
    return api("POST", "/users/login", body={"user": {"email": os.environ["QA_EMAIL"],
                                                       "password": os.environ["QA_PASSWORD"]}}).headers["Authorization"]


def seed_note(tok, kb):
    """Create or reset the invented note for `kb`. Only ever a note whose
    title is exactly TITLE.format(kb)."""
    title = TITLE.format(kb=kb)
    h = note_html(kb * 1000)
    q = json.load(api("GET", "/api/v1/note_app/notes?search=" + urllib.parse.quote(title[1:]), tok))
    found = [n for n in q["notes"] if n.get("title") == title]
    if found:
        nid = found[0]["id"]
        api("PUT", f"/api/v1/note_app/notes/{nid}", tok, {"title": title, "description": h})
    else:
        nid = json.load(api("POST", "/api/v1/note_app/notes", tok, {"title": title, "description": h}))["note"]["id"]
    return nid, h


def server_has(tok, nid, needle):
    note = json.load(api("GET", f"/api/v1/note_app/notes/{nid}", tok))["note"]
    return needle in (note.get("description") or "")


def screen(serial):
    """resource-id -> centre, for what is on screen now."""
    xml = adb(serial, "exec-out", "uiautomator", "dump", "/dev/tty")
    xml = xml[xml.find("<?xml"):xml.rfind(">") + 1] if "<?xml" in xml else ""
    found = {}
    try:
        for node in ET.fromstring(xml).iter("node"):
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds") or "")
            rid = node.get("resource-id") or ""
            if m and rid.startswith("note-"):
                x1, y1, x2, y2 = map(int, m.groups())
                found.setdefault(rid, ((x1 + x2) // 2, (y1 + y2) // 2))
    except ET.ParseError:
        pass
    return found


def b_errors(serial):
    log = adb(serial, "logcat", "-d", "-s", "ReactNativeJS:*")
    return len(re.findall(r"engine B (?:error|refused|did not keep)", log))


def free_gb():
    with open("/proc/meminfo") as f:
        kb = int(re.search(r"MemAvailable:\s+(\d+)", f.read()).group(1))
    return kb / 1024 / 1024


def open_app(serial, dev_url, timeout=120):
    """Cold start of a dev build from Metro; True once the app is up."""
    adb(serial, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
        "-d", "multimagic://expo-development-client/?url=" + urllib.parse.quote(dev_url, safe=""), PKG)
    t0 = time.time()
    while time.time() - t0 < timeout:
        xml = adb(serial, "exec-out", "uiautomator", "dump", "/dev/tty")
        if 'text="Continue"' in xml:  # the dev menu's first-run sheet
            m = re.search(r'text="Continue"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml)
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                adb(serial, "shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
        if 'resource-id="home-' in xml or 'resource-id="notes-' in xml:
            return True
        time.sleep(3)
    return False


def probe(serial, tok, kb, n, open_timeout=150, dev_url=None):
    nid, h = seed_note(tok, kb)
    row = {"kb": kb, "id": nid, **note_stats(h)}
    adb(serial, "shell", "am", "force-stop", PKG)
    if dev_url and not open_app(serial, dev_url):
        return {**row, "verdict": "unclear", "seen": [], "why": "dev build did not load"}
    adb(serial, "logcat", "-c")
    t0 = time.time()
    adb(serial, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
        "-d", f"multimagic://notes/edit?id={nid}", PKG)
    seen, ids = set(), {}
    while time.time() - t0 < open_timeout:
        ids = screen(serial)
        seen |= {k for k in ids if k in ("note-edit-body", "note-edit-cannot-open", "note-load-failed")}
        if seen:
            break
        time.sleep(3)
    row["open_s"] = round(time.time() - t0, 1)
    typed = saved = refused_after = False
    if "note-edit-body" in seen and "note-edit-cannot-open" not in seen:
        time.sleep(5)  # B reports some refusals a moment after drawing
        ids = screen(serial)
        if "note-edit-cannot-open" in ids:
            refused_after = True
        elif "note-edit-body" in ids:
            tk = token(n)
            x, y = ids["note-edit-body"]
            adb(serial, "shell", "input", "tap", str(x), str(y))
            time.sleep(1)
            adb(serial, "shell", "input", "text", f"%s{tk}%s")
            typed = True
            row["token"] = tk
            end = time.time() + 45
            while time.time() < end and not saved:
                time.sleep(2)
                saved = server_has(tok, nid, tk)
            refused_after = "note-edit-cannot-open" in screen(serial)
    row.update(seen=sorted(seen), typed=typed, saved=saved, b_errors=b_errors(serial),
               refused_after=refused_after)
    row["verdict"] = verdict(seen, typed, saved, row["b_errors"], refused_after)
    adb(serial, "shell", "am", "force-stop", PKG)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("serial")
    ap.add_argument("--ladder", default="100,200,400,600,800")
    ap.add_argument("--step", type=int, default=25)
    ap.add_argument("--out")
    ap.add_argument("--min-free-gb", type=float, default=2.0)
    ap.add_argument("--dev-url", help="Metro URL as the device sees it, for a dev build")
    a = ap.parse_args()
    if free_gb() < a.min_free_gb:
        sys.exit(f"STOP only {free_gb():.1f} GB free (need {a.min_free_gb}); ask Hello for the slot")
    if a.serial not in adb(a.serial, "get-serialno"):
        sys.exit(f"STOP device {a.serial} not attached")
    if "package:" not in adb(a.serial, "shell", "pm", "path", PKG):
        sys.exit(f"STOP {PKG} not installed on {a.serial}")
    ladder = [int(x) for x in a.ladder.split(",")]
    tok = login()
    results, rows, n = {}, [], 0
    out = open(a.out, "a") if a.out else None
    while (kb := next_kb(results, ladder, a.step)) is not None:
        n += 1
        row = probe(a.serial, tok, kb, n, dev_url=a.dev_url)
        if row["verdict"] == "unclear" and results.get(kb) == "unclear":
            row["verdict"] = "unclear!"
        results[kb] = row["verdict"]
        rows.append(row)
        line = json.dumps(row)
        print(line, flush=True)
        if out:
            out.write(line + "\n")
            out.flush()
    lo, hi = bounds_kb(results)
    bad = inconsistent(results)
    by = {r["kb"]: r for r in rows}
    summary = {
        "summary": True,
        "editable_up_to_kb": lo, "refused_from_kb": hi,
        "editable_stats": by.get(lo, {}).get("html_bytes") and {k: by[lo][k] for k in ("html_bytes", "text_chars", "blocks")},
        "refused_stats": by.get(hi, {}).get("html_bytes") and {k: by[hi][k] for k in ("html_bytes", "text_chars", "blocks")},
        "inconsistent": bad, "unclear": [k for k, v in results.items() if v.startswith("unclear")],
    }
    print(json.dumps(summary), flush=True)
    if out:
        out.write(json.dumps(summary) + "\n")
    sys.exit(0 if (hi is not None or lo is not None) and not bad else 1)


if __name__ == "__main__":
    main()
