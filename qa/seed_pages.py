#!/usr/bin/env python3
"""Seed, or clean, the QA account's "QA Pages" space for the coverage runs
that need more than the hand-made items (docs/design/pages/QA_DEEP.md):

  - 130 tiny text files in one folder, so a folder needs its second and third
    page (25 per page, `nodes_controller.rb#index`) and the sort can be watched
    across pages;
  - names 60+ characters long, and right-to-left names (Pashto, Arabic,
    Hebrew), to see truncation and bidi on a 360 dp row;
  - 4 subfolders, so folders-first holds with many files.

Everything goes into ONE folder, "QA seeded (delete me)", in the QA account's
own space. `--clean` moves that folder to the trash and then deletes it for
good, so a run leaves the space as it found it.

QA account only, signed in from `.env` (names read, values never printed),
against the local backend (`EXPO_PUBLIC_API_URL_LOCAL`, default
localhost:3001). It never touches another space or another account.

    python3 qa/seed_pages.py --seed
    python3 qa/seed_pages.py --clean
"""
import sys
import urllib.request
import uuid

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from capture_fixtures import BASE, FINGERPRINT, env, request  # noqa: E402

FOLDER = "QA seeded (delete me)"
COUNT = 130
LONG = [
    "Weekend trip to the mountains with the whole family - day two, the lake.jpg.txt",
    "Quarterly budget review and forecast for the household, final version 3.txt",
]
RTL = ["د کابل سفر - لومړۍ ورځ.txt", "رحلة إلى الجبال مع العائلة.txt", "טיול להרים עם המשפחה.txt"]


def multipart(token, path, fields, filename, content):
    boundary = uuid.uuid4().hex
    body = bytearray()
    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="node[attachment]"; '
             f'filename="{filename}"\r\nContent-Type: text/plain\r\n\r\n').encode()
    body += content + b"\r\n" + f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(BASE + path, method="POST", data=bytes(body), headers={
        "Accept": "application/json", "Authorization": token, "X-Device-Fingerprint": FINGERPRINT,
        "Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.status


def qa_space(token):
    _, _, spaces = request("GET", "/api/v1/page_app/spaces?page=1&per_page=50", token)
    space = next((s for s in (spaces or {}).get("spaces", []) if s.get("title") == "QA Pages"), None)
    if not space:
        sys.exit("the QA account has no 'QA Pages' space")
    return space["id"]


def seeded_folder(token, sid):
    _, _, root = request("GET", f"/api/v1/page_app/spaces/{sid}/nodes?page=1&per_page=100&kind=folder&parent_id=", token)
    return next((n for n in root["nodes"] if n["title"] == FOLDER), None)


def seed(token, sid):
    if seeded_folder(token, sid):
        sys.exit(f"'{FOLDER}' already exists; run --clean first")
    _, _, made = request("POST", f"/api/v1/page_app/spaces/{sid}/nodes", token,
                         {"node": {"title": FOLDER, "kind": "folder", "parent_id": None}})
    fid = made["node"]["id"]
    for i in range(1, 5):
        request("POST", f"/api/v1/page_app/spaces/{sid}/nodes", token,
                {"node": {"title": f"Sub {i}", "kind": "folder", "parent_id": fid}})
    names = [f"item-{i:03d}.txt" for i in range(1, COUNT + 1)] + LONG + RTL
    for n, name in enumerate(names, 1):
        multipart(token, f"/api/v1/page_app/spaces/{sid}/nodes",
                  {"node[title]": name, "node[kind]": "file", "node[parent_id]": fid},
                  name, f"QA seed {n}\n".encode())
        if n % 25 == 0:
            print(f"  {n}/{len(names)}")
    print(f"OK seeded {len(names)} files + 4 folders into '{FOLDER}' (node {fid})")


def clean(token, sid):
    folder = seeded_folder(token, sid)
    if not folder:
        print(f"nothing to clean: no '{FOLDER}'")
        return
    fid = folder["id"]
    request("DELETE", f"/api/v1/page_app/spaces/{sid}/nodes/{fid}", token)
    status, _, _ = request("DELETE", f"/api/v1/page_app/spaces/{sid}/nodes/{fid}/destroy_permanently", token)
    print(f"OK cleaned '{FOLDER}' (node {fid}): {status}")


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("--seed", "--clean"):
        sys.exit(__doc__)
    creds = env()
    status, token, _ = request("POST", "/users/login",
                               body={"user": {"email": creds["QA_EMAIL"], "password": creds["QA_PASSWORD"]}})
    if status != 200 or not token:
        sys.exit(f"sign-in failed: {status}")
    try:
        sid = qa_space(token)
        (seed if sys.argv[1] == "--seed" else clean)(token, sid)
    finally:
        request("DELETE", "/users/logout", token)


if __name__ == "__main__":
    main()
