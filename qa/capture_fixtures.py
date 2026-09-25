#!/usr/bin/env python3
"""Capture API contract fixtures from the LIVE local backend, as the QA account.

Every parser test in this repo used to be written from the TypeScript type,
so it could only repeat the type's own assumptions. These fixtures are what
the server actually sends (karwan-mobile's practice; their first live capture
found a parser that had refused every real response it ever received).

RULES
- RE-CAPTURE, NEVER EDIT. `contract.test.ts` pins traits a hand-written
  fixture would not have (a person's message with `role: null`, the server's
  own pagination block), so an edit that "tidies" a fixture fails.
- This repo is PUBLIC. Personal fields are SCRUBBED at capture, keeping their
  type (a string stays a string, null stays null), so the fixtures carry the
  server's SHAPE and none of anyone's data. Read the scrub list below before
  adding an endpoint, and read the diff before committing a capture.
- The QA account only (`QA_EMAIL` in the gitignored .env), never the owner.
  Reads only, plus one REFUSED write (a wrong current password), which
  changes nothing.
- The requests are the ones the app SENDS, with its params (the pages,
  `days=7`), because karwan's "met end to end" passed on a request without
  the params the app really sends, and missed a 500 on every poll.

Run from the repo root:  python3 qa/capture_fixtures.py
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "api", "__tests__", "fixtures")
BASE = os.environ.get("EXPO_PUBLIC_API_URL_LOCAL", "http://localhost:3001")
FINGERPRINT = "capture-fixtures-0000-0000-000000000000"

# Keys whose VALUES are personal. The key stays; the value is replaced by a
# placeholder of the same type. Unknown personal fields are the risk, so the
# capture refuses to write if any string still looks like an email.
SCRUB = {
    "email", "fullname", "firstname", "lastname", "username", "phone_number",
    "about", "avatar", "cover_photo", "birth_date", "shared_by", "name",
    "invited_email", "display_name", "last_sign_in_at", "country_code",
}
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def env():
    values = {}
    with open(os.path.join(ROOT, ".env")) as f:
        for line in f:
            m = re.match(r"\s*([A-Z_]+)=(.*)", line)
            if m:
                values[m.group(1)] = m.group(2).strip().strip("'\"")
    return values


def scrub(value, key=None):
    if isinstance(value, dict):
        return {k: scrub(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v, key) for v in value]
    if key in SCRUB and isinstance(value, str):
        if key in ("email", "invited_email"):
            return "person@example.test"
        if key in ("avatar", "cover_photo"):
            return "/scrubbed/avatar.png"
        return f"scrubbed {key}"
    if isinstance(value, str) and EMAIL.search(value):
        return EMAIL.sub("person@example.test", value)
    return value


def request(method, path, token=None, body=None):
    headers = {"Accept": "application/json", "Content-Type": "application/json",
               "X-Device-Fingerprint": FINGERPRINT, "Accept-Language": "en"}
    if token:
        headers["Authorization"] = token
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            raw = res.read()
            return res.status, res.headers.get("Authorization"), json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, None, json.loads(raw) if raw else None


def main():
    creds = env()
    status, token, _ = request("POST", "/users/login",
                               body={"user": {"email": creds["QA_EMAIL"], "password": creds["QA_PASSWORD"]}})
    if status != 200 or not token:
        sys.exit(f"sign-in failed: {status}")
    try:
        _, _, me = request("GET", "/api/v1/users/connected_user", token)
        user_id = me["user"]["id"]
        _, _, current = request("GET", "/api/v1/ai/conversation", token)
        session_id = current["id"]
        captures = {
            "connected_user": ("GET", "/api/v1/users/connected_user", None),
            "ai_conversation": ("GET", "/api/v1/ai/conversation", None),
            "ai_sessions": ("GET", "/api/v1/ai/sessions", None),
            "ai_messages_latest": ("GET", f"/api/v1/conversations/{session_id}/messages", None),
            "ai_documents": ("GET", f"/api/v1/ai/sessions/{session_id}/documents", None),
            "conversations_page1": ("GET", "/api/v1/conversations?page=1", None),
            "conversations_unread": ("GET", "/api/v1/conversations/unread_messages_count", None),
            "notifications_page1": ("GET", "/api/v1/notifications?page=1", None),
            "notifications_unread": ("GET", "/api/v1/notifications/unread_count", None),
            "calendar_upcoming_7": ("GET", "/api/v1/calendar_app/events/upcoming?days=7", None),
            "ai_keys": ("GET", "/api/v1/ai_keys", None),
            "me_summary": ("GET", "/api/v1/me/summary", None),
            # A REFUSED write: nothing changes, and the refusal's shape is the
            # contract (a code beside the sentence).
            "change_password_wrong_current": ("PUT", f"/api/v1/users/{user_id}/change_password",
                                              {"current_password": "not-the-password",
                                               "password": "newpass123", "password_confirmation": "newpass123"}),
        }
        os.makedirs(OUT, exist_ok=True)
        leaked = []
        for name, (method, path, body) in captures.items():
            status, _, data = request(method, path, token, body)
            clean = scrub(data)
            text = json.dumps({"status": status, "request": f"{method} {path.split('?')[0]}", "body": clean},
                              indent=2, ensure_ascii=False, sort_keys=True)
            if EMAIL.search(text.replace("person@example.test", "")):
                leaked.append(name)
                continue
            with open(os.path.join(OUT, f"{name}.json"), "w") as f:
                f.write(text + "\n")
            print(f"  {status}  {name}")
        if leaked:
            sys.exit(f"REFUSED to write, an email survived the scrub in: {leaked}")
    finally:
        request("DELETE", "/users/logout", token)


if __name__ == "__main__":
    main()
