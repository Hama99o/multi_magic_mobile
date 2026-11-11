#!/usr/bin/env python3
"""
The calendar's hard cases, against the REAL API (docs/QA_REPORT_2026-11-11.md).

Signs in as the QA ACCOUNT from .env (never the owner's; RIG_CONTRACT.md §3),
creates one event per case, reads back exactly what the phone reads
(`events/occurrences`, `events/:id`), checks it, and DESTROYS PERMANENTLY
everything it created, even when a check fails. Writes the answers to
src/api/__tests__/fixtures/calendar_cases.json so the Jest tests run on the
server's real shapes.

  python3 qa/scripts/calendar_cases.py          # exit 0 all pass, 1 a finding, 3 not measured
"""
import json, os, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
API = os.environ.get("EXPO_PUBLIC_API_URL_LOCAL", "http://localhost:3001")
env = {}
for line in open(os.path.join(ROOT, ".env")):
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.strip().split("=", 1)
        env[k] = v.strip().strip('"').strip("'")

def call(method, path, body=None, token=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "Accept": "application/json",
                                          **({"Authorization": token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, json.loads(e.read() or b"{}")
    except urllib.error.URLError as e:
        print(f"NOT MEASURED: backend unreachable ({e})"); sys.exit(3)

status, headers, _ = call("POST", "/users/login", {"user": {"email": env["QA_EMAIL"], "password": env["QA_PASSWORD"]}})
token = headers.get("Authorization")
if status != 200 or not token:
    print(f"NOT MEASURED: QA sign-in answered {status}"); sys.exit(3)

made, findings, captured = [], [], {}

def create(name, event, reminders=None):
    s, _, b = call("POST", "/api/v1/calendar_app/events", {"event": event, "reminders": reminders or []}, token)
    if s != 201:
        findings.append(f"{name}: create answered {s} {b}"); return None
    made.append(b["event"]["id"]); captured[name + ":event"] = b["event"]; return b["event"]

def window(name, frm, to):
    s, _, b = call("GET", f"/api/v1/calendar_app/events/occurrences?from={frm}&to={to}", None, token)
    captured[name + ":occurrences"] = b
    return [o for o in b.get("occurrences", []) if o["event"]["id"] in made]

def check(name, ok, detail):
    print(("ok    " if ok else "FAIL  ") + name + ": " + detail)
    if not ok: findings.append(name + ": " + detail)

BASE = dict(description=None, location=None, kind="event", all_day=False, starts_on=None, ends_on=None,
            starts_at=None, ends_at=None, recurrence="none", recurrence_until=None, color="blue")
try:
    # 1. DST, spring: weekly 09:00 Paris from Mon 23 Mar (08:00Z, CET) over 29 Mar.
    e = create("dst-spring", {**BASE, "title": "QA case DST spring", "recurrence": "weekly",
                              "starts_at": "2026-03-23T08:00:00Z", "ends_at": "2026-03-23T09:00:00Z"})
    if e:
        occ = [o for o in window("dst-spring", "2026-03-23", "2026-04-06") if o["event"]["id"] == e["id"]]
        got = [(o["on"], o["starts_at"]) for o in occ]
        # 09:00 Paris is 08:00Z before 29 Mar and 07:00Z after (CEST, UTC+2).
        want = [("2026-03-23", "08:00"), ("2026-03-30", "07:00"), ("2026-04-06", "07:00")]
        check("dst-spring", [(on, at[11:16]) for on, at in got] == want, f"want {want}, got {got}")

    # 2. DST, autumn: weekly 09:00 Paris from Mon 19 Oct (07:00Z) over 25 Oct.
    e = create("dst-autumn", {**BASE, "title": "QA case DST autumn", "recurrence": "weekly",
                              "starts_at": "2026-10-19T07:00:00Z", "ends_at": "2026-10-19T08:00:00Z"})
    if e:
        occ = [o for o in window("dst-autumn", "2026-10-19", "2026-11-02") if o["event"]["id"] == e["id"]]
        got = [(o["on"], o["starts_at"][11:16]) for o in occ]
        want = [("2026-10-19", "07:00"), ("2026-10-26", "08:00"), ("2026-11-02", "08:00")]
        check("dst-autumn", got == want, f"want {want}, got {got}")

    # 3. Yearly on 29 Feb (2024): a real day in a non-leap year.
    e = create("leap", {**BASE, "title": "QA case leap birthday", "kind": "birthday", "all_day": True,
                        "starts_on": "2024-02-29", "recurrence": "yearly"})
    if e:
        on = [o["on"] for o in window("leap", "2027-02-01", "2027-03-31") if o["event"]["id"] == e["id"]]
        check("leap", on in (["2027-02-28"], ["2027-03-01"]), f"2027 lands on {on} (one real day expected)")
        on28 = [o["on"] for o in window("leap-2028", "2028-02-01", "2028-03-31") if o["event"]["id"] == e["id"]]
        check("leap-2028", on28 == ["2028-02-29"], f"2028 lands on {on28}")

    # 4. Across midnight and several days: Fri 22:00 Paris to Sun 02:00 Paris.
    e = create("span", {**BASE, "title": "QA case weekend span", "starts_at": "2026-11-13T21:00:00Z",
                        "ends_at": "2026-11-15T01:00:00Z"})
    if e:
        occ = [o for o in window("span", "2026-11-12", "2026-11-16") if o["event"]["id"] == e["id"]]
        check("span", [o["on"] for o in occ] == ["2026-11-13"], f"occurrences on {[o['on'] for o in occ]} (once, on its first day)")

    # 5. A zero-minute event.
    e = create("zero", {**BASE, "title": "QA case zero minutes", "starts_at": "2026-11-20T10:00:00Z",
                        "ends_at": "2026-11-20T10:00:00Z"})
    check("zero", e is not None, "accepted" if e else "refused")

    # 6. Long title (the server's limit is 200) and long notes.
    long_title = "QA case " + "x" * 192
    e = create("long", {**BASE, "title": long_title, "description": "line\n" * 400,
                        "starts_at": "2026-11-21T10:00:00Z"})
    check("long", bool(e) and e["title"] == long_title, "200-char title and 2000-char notes stored")
    s, _, b = call("POST", "/api/v1/calendar_app/events", {"event": {**BASE, "title": "y" * 201, "starts_at": "2026-11-21T10:00:00Z"}}, token)
    check("too-long", s == 422, f"201-char title answered {s}")
    if s == 201: made.append(b["event"]["id"])
    captured["too-long:refusal"] = b

    # 7. Editing a recurring event edits the SERIES (the web has no per-occurrence edit).
    e = create("series", {**BASE, "title": "QA case series", "recurrence": "daily",
                          "starts_at": "2026-11-23T09:00:00Z", "recurrence_until": "2026-11-25"})
    if e:
        call("PUT", f"/api/v1/calendar_app/events/{e['id']}", {"event": {"title": "QA case series renamed"}, "reminders": []}, token)
        titles = {o["event"]["title"] for o in window("series", "2026-11-23", "2026-11-26") if o["event"]["id"] == e["id"]}
        check("series", titles == {"QA case series renamed"}, f"every occurrence reads {titles}")
finally:
    for event_id in made:
        call("DELETE", f"/api/v1/calendar_app/events/{event_id}", None, token)
        call("DELETE", f"/api/v1/calendar_app/events/{event_id}/destroy_permanently", None, token)
    left = [o for o in call("GET", "/api/v1/calendar_app/events?search=QA%20case", None, token)[2].get("events", [])]
    print(f"cleanup: {len(made)} created, {len(left)} 'QA case' events left")

with open(os.path.join(ROOT, "src/api/__tests__/fixtures/calendar_cases.json"), "w") as f:
    json.dump({"request": "qa/scripts/calendar_cases.py", "body": captured}, f, indent=1)
print(f"{len(findings)} finding(s)")
sys.exit(1 if findings else 0)
