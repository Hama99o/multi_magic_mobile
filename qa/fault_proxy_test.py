#!/usr/bin/env python3
"""The fault proxy, against a FAKE upstream: it must forward what it was not
told to break, byte for byte, and break exactly what it was told to, on
exactly that path. Runs in `npm test`'s pretest; needs no backend.

Each check was planted (the tool broken on purpose) and watched go red.
"""
import http.client
import json
import os
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fault_proxy  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}{'' if ok else f'  ({detail})'}")
    if not ok:
        FAILS.append(name)


UPSTREAM_HITS = [0]


class Upstream(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_GET(self):
        UPSTREAM_HITS[0] += 1
        if self.headers.get("Upgrade", "").lower() == "websocket":
            # Enough of a handshake to prove the bytes go both ways.
            self.connection.sendall(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
            data = self.connection.recv(1024)
            self.connection.sendall(b"echo:" + data)
            self.close_connection = True
            return
        body = json.dumps({"path": self.path, "auth": self.headers.get("Authorization")}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Authorization", "Bearer from-upstream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n)
        self.send_response(201)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start(server):
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server.server_address[1]


def req(port, method, path, body=None, headers=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    return r.status, dict(r.getheaders()), r.read()


def serve_mode():
    """The store-picture mode: the demo files, and nothing real, ever."""
    from datetime import datetime, timedelta
    demo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo", "en")
    proxy = fault_proxy.serve(0, "", serve_dir=demo)
    port = start(proxy)
    hits = UPSTREAM_HITS[0]

    s, _, b = req(port, "GET", "/api/v1/conversations?page=1")
    text = b.decode()
    check("serve: a routed request gets its demo file", s == 200 and "Sam" in text and "Book club" in text, (s, text[:80]))
    check("serve: no placeholder survives to the app", "{{" not in text, text[:120])
    s, _, b = req(port, "GET", "/api/v1/users/connected_user")
    check("serve: signed in as the invented person", s == 200 and json.loads(b)["user"]["firstname"] == "Maya", (s, b[:80]))
    s, _, _ = req(port, "POST", "/api/v1/conversations/9101/mark_read")
    check("serve: the thread's mark_read answers", s == 200, s)
    s, _, _ = req(port, "GET", "/up")
    check("serve: the reachability probe answers", s == 200, s)
    s, _, b = req(port, "GET", "/api/v1/something/not/in/the/demo")
    check("serve: anything else is REFUSED", s == 404, (s, b))
    sock = socket.create_connection(("127.0.0.1", port), timeout=5)
    sock.sendall(b"GET /cable HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
    head = sock.recv(1024)
    sock.close()
    check("serve: the socket is refused, not tunnelled", head.startswith(b"HTTP/1.1 404"), head[:40])
    check("serve: the real upstream was NEVER contacted", UPSTREAM_HITS[0] == hits, UPSTREAM_HITS[0] - hits)

    # {{date:sat}}: the words say "Saturday", so it must be one, inside the
    # calendar's seven-day window, whatever day the pictures are taken.
    monday = datetime(2026, 9, 21, 10, 0).astimezone()
    ok = True
    for d in range(7):
        now = monday + timedelta(days=d)
        got = datetime.strptime(fault_proxy.fill("{{date:sat}}", now), "%Y-%m-%d")
        ahead = (got.date() - now.date()).days
        ok = ok and got.weekday() == 5 and 1 <= ahead <= 7
    check("serve: {{date:sat}} is a Saturday 1 to 7 days ahead, every weekday", ok)
    proxy.shutdown()
    fault_proxy.SERVE_DIR = ""


def main():
    up_port = start(ThreadingHTTPServer(("127.0.0.1", 0), Upstream))
    fault_proxy.QUIET = True
    fault_proxy.UPSTREAM = urlparse(f"http://127.0.0.1:{up_port}")
    proxy = fault_proxy.serve(0, "/api/v1/calendar_app=500,/api/v1/notifications=429,/cut=truncate,/gone=refuse")
    port = start(proxy)

    # Forwarded untouched, both ways: path, query, auth header in and out.
    s, h, b = req(port, "GET", "/api/v1/conversations?page=2", headers={"Authorization": "Bearer abc"})
    got = json.loads(b)
    check("an unbroken path is forwarded", s == 200 and got["path"] == "/api/v1/conversations?page=2", (s, b))
    check("the Authorization header reaches the server", got["auth"] == "Bearer abc", got)
    check("the server's Authorization header reaches the app", h.get("Authorization") == "Bearer from-upstream", h)
    s, _, b = req(port, "POST", "/api/v1/echo", body=b'{"x":1}', headers={"Content-Type": "application/json"})
    check("a POST body is forwarded", s == 201 and b == b'{"x":1}', (s, b))

    # Broken exactly as told, on exactly that path.
    s, _, b = req(port, "GET", "/api/v1/calendar_app/events/upcoming?days=7")
    check("500 is Rails' own error page", s == 500 and json.loads(b) == {"status": 500, "error": "Internal Server Error"}, (s, b))
    s, h, _ = req(port, "GET", "/api/v1/notifications?page=1")
    check("429 carries Retry-After", s == 429 and h.get("Retry-After") == "30", (s, h))
    s, _, _ = req(port, "GET", "/api/v1/notifications_something_else_entirely")
    check("a prefix is a prefix (documented: /api/v1/notifications matches longer paths)", s == 429, s)

    # One endpoint failing while the rest works: the partial outage.
    s, _, _ = req(port, "GET", "/api/v1/calendar_app/events/upcoming")
    s2, _, _ = req(port, "GET", "/api/v1/users/connected_user")
    check("one endpoint fails while the rest answers", s == 500 and s2 == 200, (s, s2))

    try:
        req(port, "GET", "/cut")
        check("truncate cuts the body", False, "read a whole body")
    except http.client.IncompleteRead:
        check("truncate cuts the body", True)

    try:
        req(port, "GET", "/gone")
        check("refuse sends no response", False, "got a response")
    except (http.client.RemoteDisconnected, ConnectionError):
        check("refuse sends no response", True)

    # Changed while running.
    req(port, "POST", "/__fault?path=/api/v1/users&kind=500")
    s, _, _ = req(port, "GET", "/api/v1/users/connected_user")
    check("a fault added at runtime applies", s == 500, s)
    s, _, b = req(port, "POST", "/__fault?path=nope&kind=500")
    check("a bad runtime fault is refused", s == 400, (s, b))
    req(port, "DELETE", "/__fault")
    s, _, _ = req(port, "GET", "/api/v1/calendar_app/events/upcoming")
    check("clearing faults restores forwarding", s == 200, s)

    # The socket, tunnelled.
    head = echoed = b""
    try:
        sock = socket.create_connection(("127.0.0.1", port), timeout=5)
        sock.sendall(b"GET /cable HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
        head = sock.recv(1024)
        sock.sendall(b"ping")
        echoed = sock.recv(1024)
        sock.close()
    except OSError as e:
        head = repr(e).encode()
    check("the socket is tunnelled both ways", head.startswith(b"HTTP/1.1 101") and echoed == b"echo:ping", (head, echoed))

    try:
        fault_proxy.parse_faults("calendar=500")
        check("a malformed FAULTS is refused at start", False, "accepted")
    except ValueError:
        check("a malformed FAULTS is refused at start", True)

    proxy.shutdown()
    serve_mode()
    if FAILS:
        print(f"fault_proxy: {len(FAILS)} failed")
        return 1
    print("fault_proxy: all passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
