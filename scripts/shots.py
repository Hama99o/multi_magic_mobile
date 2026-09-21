#!/usr/bin/env python3
"""Upload screenshots to App Store Connect.

Apple's flow is three steps and all three must complete or the asset is left
in a broken state that the console shows as a red placeholder:

  1. POST /appScreenshots      reserve -- returns uploadOperations
  2. PUT  each operation       the bytes, in the chunks Apple asks for
  3. PATCH /appScreenshots/id  uploaded: true + md5 of the WHOLE file

The md5 is Apple's own integrity check. Sending it wrong fails the asset later,
at submission, rather than here -- so it is computed from the same bytes that
were sent rather than from the file a second time.
"""
import hashlib, json, os, sys, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc


def existing(set_id):
    r = asc.call("GET", f"/appScreenshotSets/{set_id}/appScreenshots?limit=20", soft=True)
    return [] if r.get("_error") else r["data"]


def find_or_make_set(loc_id, display_type):
    r = asc.call("GET", f"/appStoreVersionLocalizations/{loc_id}/appScreenshotSets")
    for s in r["data"]:
        if s["attributes"]["screenshotDisplayType"] == display_type:
            return s["id"]
    r = asc.call("POST", "/appScreenshotSets", {"data": {
        "type": "appScreenshotSets",
        "attributes": {"screenshotDisplayType": display_type},
        "relationships": {"appStoreVersionLocalization": {"data": {
            "type": "appStoreVersionLocalizations", "id": loc_id}}},
    }}, soft=True)
    if r.get("_error"):
        raise SystemExit(f"could not create set {display_type}: {r['_error']}")
    return r["data"]["id"]


def upload_one(set_id, path):
    data = open(path, "rb").read()
    name = os.path.basename(path)

    res = asc.call("POST", "/appScreenshots", {"data": {
        "type": "appScreenshots",
        "attributes": {"fileSize": len(data), "fileName": name},
        "relationships": {"appScreenshotSet": {"data": {
            "type": "appScreenshotSets", "id": set_id}}},
    }}, soft=True)
    if res.get("_error"):
        return f"reserve failed: {res['_error']}"

    sid = res["data"]["id"]
    for op in res["data"]["attributes"]["uploadOperations"]:
        chunk = data[op["offset"]: op["offset"] + op["length"]]
        req = urllib.request.Request(op["url"], data=chunk, method=op["method"])
        for h in op.get("requestHeaders", []):
            req.add_header(h["name"], h["value"])
        try:
            urllib.request.urlopen(req, timeout=180).read()
        except Exception as e:
            return f"chunk at {op['offset']} failed: {e}"

    done = asc.call("PATCH", f"/appScreenshots/{sid}", {"data": {
        "type": "appScreenshots", "id": sid,
        "attributes": {"uploaded": True,
                       "sourceFileChecksum": hashlib.md5(data).hexdigest()},
    }}, soft=True)
    return done.get("_error") if done.get("_error") else None


def run(loc_id, display_type, files):
    set_id = find_or_make_set(loc_id, display_type)
    have = existing(set_id)
    print(f"  set {display_type}  id={set_id}  already holds {len(have)}")
    for i, f in enumerate(files, 1):
        err = upload_one(set_id, f)
        mark = "ok" if err is None else "x "
        print(f"    {mark} {i}. {os.path.basename(f)}" + (f"  -- {err}" if err else ""))


if __name__ == "__main__":
    cfg = json.load(open(sys.argv[1], encoding="utf-8"))
    for block in cfg:
        print(f"\n[{block['locale']}] {block['displayType']}")
        run(block["localizationId"], block["displayType"], block["files"])
