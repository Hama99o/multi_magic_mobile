#!/usr/bin/env python3
"""Apple's App Store Connect API, driven directly. No fastlane, no eas metadata.

Credentials come from the environment and NEVER from a file in the repo --
this repo is public and the .p8 can rewrite a live App Store listing:

    export ASC_KEY_ID=XXXXXXXXXX
    export ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    export ASC_P8=~/.appstoreconnect/AuthKey_XXXXXXXXXX.p8

Commands:
    show            read the app, its version, and every localization (READ ONLY)
    push <file>     apply a metadata JSON; add --write or it only prints the diff
"""
import json, os, sys, time, urllib.error, urllib.request

import jwt

BASE = "https://api.appstoreconnect.apple.com/v1"

# Which app to act on, most explicit first. Nothing about this file is specific
# to one app: point it at another bundle id and it drives that listing instead.
#   1. --bundle com.example.app        on the command line
#   2. "bundleId" in the metadata JSON
#   3. ASC_BUNDLE_ID in the environment
#   4. expo.ios.bundleIdentifier from ./app.json, if you are standing in an
#      Expo project -- the common case, and it means zero configuration
def resolve_bundle(argv=None, meta=None):
    argv = argv if argv is not None else sys.argv
    if "--bundle" in argv:
        return argv[argv.index("--bundle") + 1]
    if meta and meta.get("bundleId"):
        return meta["bundleId"]
    if os.environ.get("ASC_BUNDLE_ID"):
        return os.environ["ASC_BUNDLE_ID"]
    try:
        with open("app.json") as fh:
            return json.load(fh)["expo"]["ios"]["bundleIdentifier"]
    except Exception:
        raise SystemExit(
            "no bundle id: pass --bundle, set ASC_BUNDLE_ID, put \"bundleId\" in "
            "the metadata file, or run from an Expo project with app.json")


def token() -> str:
    missing = [k for k in ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_P8")
               if not os.environ.get(k)]
    if missing:
        raise SystemExit(
            "missing " + ", ".join(missing) + "\n\n"
            "  export ASC_KEY_ID=...      # Users and Access > Integrations\n"
            "  export ASC_ISSUER_ID=...   # top of that same page\n"
            "  export ASC_P8=~/.appstoreconnect/AuthKey_<KEYID>.p8\n\n"
            "The .p8 downloads once and belongs OUTSIDE this repo, which is "
            "public. docs/APP_STORE_CONNECT.md section 0.")
    key_id = os.environ["ASC_KEY_ID"]
    issuer = os.environ["ASC_ISSUER_ID"]
    p8 = os.path.expanduser(os.environ["ASC_P8"])
    if not os.path.exists(p8):
        raise SystemExit(f"ASC_P8 points at {p8}, which does not exist")
    with open(p8) as fh:
        private_key = fh.read()
    now = int(time.time())
    return jwt.encode(
        {"iss": issuer, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
        private_key,
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


def call(method: str, path: str, body=None, soft=False, _tok=[]):
    if not _tok:
        _tok.append(token())
    url = path if path.startswith("http") else f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {_tok[0]}")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        msgs = []
        try:
            for err in json.loads(detail).get("errors", []):
                msgs.append(f"{err.get('status')} {err.get('code')}: {err.get('detail')}")
        except Exception:
            msgs.append(f"HTTP {e.code}: {detail[:300]}")
        # A partial listing is worth more than a clean abort: one field Apple
        # refuses must not strand the other nine. Callers that can carry on
        # pass soft=True and read the error off the return value.
        if soft:
            return {"_error": "; ".join(msgs)}
        for m in msgs:
            print(f"  ! {m}", file=sys.stderr)
        raise SystemExit(1)


def find_app(bundle_id):
    apps = call("GET", f"/apps?filter[bundleId]={bundle_id}")["data"]
    if not apps:
        raise SystemExit(f"no app with bundleId {bundle_id} on this account")
    return apps[0]


def list_apps():
    """Every app this key can see -- so you can find a bundle id you forgot."""
    for a in call("GET", "/apps?limit=200")["data"]:
        at = a["attributes"]
        print(f"  {at['bundleId']:40} {at['name']}  id={a['id']}")


def editable_version(app_id):
    """The version still open for editing. A LIVE version cannot be patched."""
    vs = call("GET", f"/apps/{app_id}/appStoreVersions?limit=10")["data"]
    for v in vs:
        if v["attributes"]["appStoreState"] in (
            "PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
            "METADATA_REJECTED", "INVALID_BINARY",
        ):
            return v
    return vs[0] if vs else None


def show(bundle_id):
    app = find_app(bundle_id)
    a = app["attributes"]
    print(f"app            {a['name']}  ({a['bundleId']})  id={app['id']}")
    print(f"primary locale {a.get('primaryLocale')}")

    infos = call("GET", f"/apps/{app['id']}/appInfos")["data"]
    for info in infos:
        st = info["attributes"].get("appStoreState")
        print(f"\nappInfo {info['id']}  state={st}")
        locs = call("GET", f"/appInfos/{info['id']}/appInfoLocalizations")["data"]
        for loc in locs:
            at = loc["attributes"]
            print(f"  [{at['locale']}] name={at.get('name')!r} subtitle={at.get('subtitle')!r}")
            print(f"            privacyPolicyUrl={at.get('privacyPolicyUrl')!r}")

    v = editable_version(app["id"])
    if not v:
        print("\nno appStoreVersion found")
        return
    print(f"\nversion {v['attributes']['versionString']}  "
          f"state={v['attributes']['appStoreState']}  id={v['id']}")
    locs = call("GET", f"/appStoreVersions/{v['id']}/appStoreVersionLocalizations")["data"]
    for loc in locs:
        at = loc["attributes"]
        print(f"  [{at['locale']}] id={loc['id']}")
        for k in ("description", "keywords", "promotionalText", "supportUrl",
                  "marketingUrl", "whatsNew"):
            val = at.get(k)
            if val:
                one = " ".join(str(val).split())
                print(f"      {k:16} {one[:70]}{'...' if len(one) > 70 else ''}")
            else:
                print(f"      {k:16} -")
    try:
        rd = call("GET", f"/appStoreVersions/{v['id']}/appStoreReviewDetail")["data"]
        at = rd["attributes"]
        print(f"\nreviewDetail id={rd['id']}")
        print(f"  contact   {at.get('contactFirstName')} {at.get('contactLastName')} "
              f"| {at.get('contactPhone')} | {at.get('contactEmail')}")
        print(f"  demo      required={at.get('demoAccountRequired')} "
              f"user={at.get('demoAccountName')}")
        print(f"  notes     {(at.get('notes') or '')[:80]}")
    except SystemExit:
        print("\nreviewDetail: none yet (it is created on first write)")




# ── push ────────────────────────────────────────────────────────────────────
# Appended after `show` proved the credentials read the real app. Every write
# is announced before it happens and the default is a dry run: --write is the
# only thing that sends a PATCH or POST.

RESULTS = []


def report(label, res):
    """Record one write. Apple refuses individual attributes for reasons that
    are legitimate -- whatsNew on a first release is the obvious one -- so a
    refusal is data about the listing, not a reason to stop writing the rest."""
    if isinstance(res, dict) and res.get("_error"):
        print(f"  x {label}: {res['_error']}")
        RESULTS.append((label, res["_error"]))
    else:
        print(f"  ok {label}")
        RESULTS.append((label, None))
    return res


def patch(kind, rid, attrs, label=""):
    return report(label or kind,
                  call("PATCH", f"/{kind}/{rid}",
                       {"data": {"type": kind, "id": rid, "attributes": attrs}},
                       soft=True))


def create(kind, attrs, rel_name, rel_type, rel_id, label=""):
    return report(label or kind, call("POST", f"/{kind}", {"data": {
        "type": kind, "attributes": attrs,
        "relationships": {rel_name: {"data": {"type": rel_type, "id": rel_id}}},
    }}, soft=True))


def patch_fields_individually(kind, rid, attrs, label):
    """Retry a refused multi-field PATCH one attribute at a time, so the nine
    Apple accepts still land and only the one it refuses is reported."""
    for k, v in attrs.items():
        patch(kind, rid, {k: v}, label=f"{label}.{k}")


VERSION_FIELDS = ("description", "keywords", "promotionalText",
                  "supportUrl", "marketingUrl", "whatsNew")


def push(meta_path, write=False):
    meta = json.load(open(meta_path, encoding="utf-8"))
    app = find_app(resolve_bundle(meta=meta))
    info = call("GET", f"/apps/{app['id']}/appInfos")["data"][0]
    ver = editable_version(app["id"])
    tag = "WRITE" if write else "dry-run"
    print(f"[{tag}] app {app['id']}  appInfo {info['id']}  version "
          f"{ver['attributes']['versionString']} {ver['id']}\n")

    # 1 · the version string, so an uploaded build can attach to this record
    want = meta.get("versionString")
    if want and want != ver["attributes"]["versionString"]:
        print(f"  versionString {ver['attributes']['versionString']!r} -> {want!r}")
        if write:
            patch("appStoreVersions", ver["id"], {"versionString": want},
                  label="versionString")

    # 2 · appInfo localizations: subtitle and the privacy URL both stores need
    have = {l["attributes"]["locale"]: l
            for l in call("GET", f"/appInfos/{info['id']}/appInfoLocalizations")["data"]}
    for locale, want_attrs in meta["appInfo"].items():
        want_attrs = {k: v for k, v in want_attrs.items() if not k.startswith("_")}
        if locale in have:
            cur = have[locale]["attributes"]
            diff = {k: v for k, v in want_attrs.items() if (cur.get(k) or "") != v}
            if diff:
                print(f"  appInfo[{locale}] patch {list(diff)}")
                if write:
                    r = patch("appInfoLocalizations", have[locale]["id"], diff,
                              label=f"appInfo[{locale}]")
                    if isinstance(r, dict) and r.get("_error"):
                        patch_fields_individually("appInfoLocalizations",
                                                  have[locale]["id"], diff,
                                                  f"appInfo[{locale}]")
        else:
            print(f"  appInfo[{locale}] CREATE {list(want_attrs)}")
            if write:
                create("appInfoLocalizations", {**want_attrs, "locale": locale},
                       "appInfo", "appInfos", info["id"], label=f"appInfo[{locale}] create")

    # 3 · version localizations: the listing copy itself
    have = {l["attributes"]["locale"]: l for l in call(
        "GET", f"/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")["data"]}
    for locale, want_attrs in meta["version"].items():
        want_attrs = {k: v for k, v in want_attrs.items()
                      if not k.startswith("_") and k in VERSION_FIELDS and v}
        if locale in have:
            cur = have[locale]["attributes"]
            diff = {k: v for k, v in want_attrs.items() if (cur.get(k) or "") != v}
            if diff:
                print(f"  version[{locale}] patch {list(diff)}")
                if write:
                    r = patch("appStoreVersionLocalizations", have[locale]["id"], diff,
                              label=f"version[{locale}]")
                    if isinstance(r, dict) and r.get("_error"):
                        patch_fields_individually("appStoreVersionLocalizations",
                                                  have[locale]["id"], diff,
                                                  f"version[{locale}]")
        else:
            print(f"  version[{locale}] CREATE {list(want_attrs)}")
            if write:
                r = create("appStoreVersionLocalizations",
                           {**want_attrs, "locale": locale},
                           "appStoreVersion", "appStoreVersions", ver["id"],
                           label=f"version[{locale}] create")
                if isinstance(r, dict) and r.get("_error"):
                    # Drop whatever Apple refused and create with the rest.
                    reduced = {k: v for k, v in want_attrs.items() if k != "whatsNew"}
                    create("appStoreVersionLocalizations",
                           {**reduced, "locale": locale},
                           "appStoreVersion", "appStoreVersions", ver["id"],
                           label=f"version[{locale}] create (no whatsNew)")

    # 4 · review detail. Contact and demo credentials are DELIBERATELY not sent:
    #     they are already correct in the console and are his to own.
    rd = call("GET", f"/appStoreVersions/{ver['id']}/appStoreReviewDetail")["data"]
    notes = meta.get("reviewDetail", {}).get("notes")
    if notes and (rd["attributes"].get("notes") or "") != notes:
        print(f"  reviewDetail patch notes ({len(notes)} chars)")
        if write:
            patch("appStoreReviewDetails", rd["id"], {"notes": notes},
                  label="reviewDetail.notes")

    if write:
        bad = [(l, e) for l, e in RESULTS if e]
        print(f"\n[{tag}] {len(RESULTS) - len(bad)} succeeded, {len(bad)} refused")
        for label, err in bad:
            print(f"  REFUSED {label}: {err}")
    else:
        print(f"\n[{tag}] done — nothing was sent; add --write")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "show"
    if cmd == "apps":
        list_apps()
    elif cmd == "show":
        show(resolve_bundle())
    elif cmd == "push":
        push(sys.argv[2], write="--write" in sys.argv)
    else:
        raise SystemExit(
            f"unknown command {cmd!r}\n"
            "  asc.py apps                      list every app this key can see\n"
            "  asc.py show [--bundle ID]        read one app's listing\n"
            "  asc.py push FILE [--write]       apply a metadata JSON")
