"""
Contacts against the REAL API (docs/QA_REPORT_2026-11-12.md), as the QA
ACCOUNT from .env (never the owner's; RIG_CONTRACT.md §3).

Run it against the server that has the contacts-api branch:

  EXPO_PUBLIC_API_URL_LOCAL=http://localhost:3002 python3 qa/scripts/contacts_cases.py [cards.vcf]

Checks the owner's second-email bug end to end (list, detail, search), the
bulk import of a synthetic .vcf (qa/scripts/make_contacts_vcf.py) and its
re-import (everything "already there"), export all; then DESTROYS
PERMANENTLY every contact it created, even when a check fails.
Exit 0 all pass, 1 a finding, 3 not measured.
"""
import json, os, sys, uuid, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
API = os.environ.get("EXPO_PUBLIC_API_URL_LOCAL", "http://localhost:3001")
BASE = "/api/v1/contact_app/contacts"
env = {}
for line in open(os.path.join(ROOT, ".env")):
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.strip().split("=", 1)
        env[k] = v.strip().strip('"').strip("'")


def call(method, path, body=None, token=None, raw=False):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "Accept": "application/json",
                                          **({"Authorization": token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
            return r.status, r.headers, (data.decode() if raw else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read()
        try:
            return e.code, e.headers, json.loads(data or b"{}")
        except ValueError:
            return e.code, e.headers, data.decode(errors="replace")
    except urllib.error.URLError as e:
        print(f"NOT MEASURED: backend unreachable ({e})"); sys.exit(3)


status, headers, _ = call("POST", "/users/login", {"user": {"email": env["QA_EMAIL"], "password": env["QA_PASSWORD"]}})
token = headers.get("Authorization")
if status != 200 or not token:
    print(f"NOT MEASURED: QA sign-in answered {status}"); sys.exit(3)

findings = []


def check(name, ok, detail):
    print(("ok    " if ok else "FAIL  ") + name + ": " + detail)
    if not ok:
        findings.append(name + ": " + detail)


def all_ids():
    ids, page = [], 1
    while True:
        s, _, b = call("GET", f"{BASE}?page={page}&per_page=100", None, token)
        ids += [c["id"] for c in b.get("contacts", [])]
        if page >= b.get("meta", {}).get("pagy", {}).get("pages", 1):
            return ids
        page += 1


before = set(all_ids())
tag = uuid.uuid4().hex[:6]
try:
    s, _, b = call("POST", BASE, {"contact": {"firstname": "Qa", "lastname": f"Probe{tag}",
                                              "phones": [{"label": "mobile", "value": "0701234567"}, {"label": "work", "value": "+33 6 39 98 00 01"}],
                                              "emails": [{"label": "home", "value": f"first.{tag}@example.test"}, {"label": "work", "value": f"second.{tag}@example.test"}]}}, token)
    check("create", s == 201, f"answered {s}")
    cid = b["contact"]["id"]
    s, _, b = call("GET", f"{BASE}?per_page=100&search=second.{tag}@example.test", None, token)
    rows = b.get("contacts", [])
    check("search by the SECOND email", [r["id"] for r in rows] == [cid], f"found {[r['id'] for r in rows]}")
    check("list row carries every email", len(rows) == 1 and len(rows[0].get("emails", [])) == 2, json.dumps(rows[0].get("emails") if rows else None))
    s, _, b = call("GET", f"{BASE}?per_page=100&search=39980001", None, token)
    check("search by the second number's digits", cid in [r["id"] for r in b.get("contacts", [])], f"{len(b.get('contacts', []))} rows")
    s, _, b = call("GET", f"{BASE}/{cid}", None, token)
    check("detail carries every phone and email", len(b["contact"]["phones"]) == 2 and len(b["contact"]["emails"]) == 2, "")

    if len(sys.argv) > 1:
        text = open(sys.argv[1], encoding="utf-8").read()
        cards = [c for c in text.split("BEGIN:VCARD") if c.strip()]
        total = created = skipped = failed = 0
        for i in range(0, len(cards), 50):
            chunk = "".join("BEGIN:VCARD" + c for c in cards[i:i + 50])
            s, _, b = call("POST", f"{BASE}/import_vcard", {"vcf": chunk}, token)
            sm = b.get("summary", {}) if isinstance(b, dict) else {}
            total += sm.get("total", 0); created += sm.get("created", 0); skipped += sm.get("skipped", 0); failed += sm.get("failed", 0)
        check("bulk import reads every card", total == len(cards), f"{total} of {len(cards)}")
        check("bulk import: nothing failed", failed == 0, f"created {created}, skipped {skipped}, failed {failed}")
        print(f"      import summary: created {created}, already there {skipped}, failed {failed}")
        s, _, b = call("POST", f"{BASE}/import_vcard", {"vcf": text}, token)
        sm = b.get("summary", {})
        check("re-import: every card already there", sm.get("created") == 0 and sm.get("skipped") == len(cards), json.dumps(sm))

    s, _, body = call("GET", f"{BASE}/export_multiple_contacts?all=true", None, token, raw=True)
    check("export all", s == 200 and body.count("BEGIN:VCARD") == len(all_ids()), f"{body.count('BEGIN:VCARD')} cards")
finally:
    mine = [i for i in all_ids() if i not in before]
    for i in mine:
        call("DELETE", f"{BASE}/{i}", None, token)
        call("DELETE", f"{BASE}/{i}/destroy_permanently", None, token)
    left = [i for i in all_ids() if i not in before]
    print(f"clean-up: removed {len(mine)} contacts the probe made; left behind: {len(left)}")

sys.exit(1 if findings else 0)
