#!/usr/bin/env python3
"""A FAULT PROXY: the real API, except for the paths you tell it to break.

A dead port gives exactly one fault, connection refused, and only for
everything at once. A real outage is usually ONE endpoint failing while the
rest of the app works, and a screen's 5xx and 429 branches can only be seen
on a device if something answers with them. This sits between the app and
the local backend, forwards everything, and breaks what it is told to.

    python3 qa/fault_proxy.py                      # :3031 → localhost:3001
    FAULTS='/api/v1/calendar_app=500' python3 qa/fault_proxy.py

Then start Metro with the proxy baked in (EXPO_PUBLIC_* is inlined at BUILD
time, so this is a Metro restart, and the Metro must be stopped afterwards):

    EXPO_PUBLIC_API_URL=http://10.0.2.2:3031 npx expo start --port 3029

A FAULT is `<path prefix>=<kind>`, comma separated, first match wins:
  500        Rails' own error page, `{"status":500,"error":"Internal Server Error"}`,
             the body an unrescued exception really gets (actionpack
             `public_exceptions.rb`)
  429        `{"error":"Too many requests"}` with `Retry-After: 30`
  slow:<ms>  forwards, after a delay
  truncate   forwards, then cuts the body in half (a dropped connection
             mid-response)
  refuse     closes the connection with no response (offline, one path only)

Change faults while it runs, from the host only:
    curl -X POST 'localhost:3031/__fault?path=/api/v1/notifications&kind=429'
    curl -X DELETE localhost:3031/__fault         # clear all
    curl localhost:3031/__fault                   # list

RULES
- A QA tool, never in the app. Nothing under src/ or app/ imports it, and it
  is not in the bundle (it is Python).
- It binds 127.0.0.1. The emulator reaches that as 10.0.2.2; nothing else
  on the network can reach the control route.
- It FORWARDS to the owner's real backend. It adds faults and nothing else:
  it never writes on its own, and what passes through is exactly what the
  app sent. Sign in as the QA account, as always (qa/RIG_CONTRACT.md §3).
- The ActionCable socket (`/cable`) is tunnelled untouched, because the app
  derives the socket URL from the same host (src/config/env.ts).
"""
import http.client
import json
import os
import select
import socket
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("FAULT_PROXY_PORT", "3031"))
UPSTREAM = urllib.parse.urlparse(os.environ.get("FAULT_PROXY_UPSTREAM", "http://localhost:3001"))

RAILS_500 = json.dumps({"status": 500, "error": "Internal Server Error"}).encode()
TOO_MANY = json.dumps({"error": "Too many requests"}).encode()
KINDS = ("500", "429", "truncate", "refuse")
QUIET = False

_lock = threading.Lock()
_faults: list = []  # [(prefix, kind)], first match wins


def parse_faults(spec: str) -> list:
    out = []
    for part in filter(None, (p.strip() for p in spec.split(","))):
        prefix, _, kind = part.partition("=")
        if not prefix.startswith("/") or not valid_kind(kind):
            raise ValueError(f"bad fault {part!r}: want /path=kind, kind in {KINDS} or slow:<ms>")
        out.append((prefix, kind))
    return out


def valid_kind(kind: str) -> bool:
    return kind in KINDS or (kind.startswith("slow:") and kind[5:].isdigit())


def fault_for(path: str):
    with _lock:
        for prefix, kind in _faults:
            if path.startswith(prefix):
                return kind
    return None


HOP = {"connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "te", "trailer"}


class Proxy(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_request(self, code="-", size="-"):  # one short line per request
        if not QUIET:
            sys.stderr.write(f"  {code} {self.command} {self.path}\n")

    def log_message(self, fmt, *args):
        if not QUIET:
            sys.stderr.write(f"  {fmt % args}\n")

    # ── control ──────────────────────────────────────────────────────────
    def control(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        with _lock:
            if self.command == "POST":
                path, kind = query.get("path", [""])[0], query.get("kind", [""])[0]
                if not path.startswith("/") or not valid_kind(kind):
                    return self.reply(400, json.dumps({"error": "path=/… and kind="}).encode())
                _faults.insert(0, (path, kind))
            elif self.command == "DELETE":
                _faults.clear()
            body = json.dumps([{"path": p, "kind": k} for p, k in _faults]).encode()
        self.reply(200, body)

    def reply(self, status, body, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    # ── everything else ──────────────────────────────────────────────────
    def handle_any(self):
        if self.path.startswith("/__fault"):
            return self.control()
        if self.headers.get("Upgrade", "").lower() == "websocket":
            return self.tunnel()
        path = urllib.parse.urlparse(self.path).path
        kind = fault_for(path)
        if kind == "refuse":
            self.close_connection = True
            self.connection.shutdown(socket.SHUT_RDWR)
            return
        if kind == "500":
            return self.reply(500, RAILS_500)
        if kind == "429":
            return self.reply(429, TOO_MANY, {"Retry-After": "30"})
        if kind and kind.startswith("slow:"):
            time.sleep(int(kind[5:]) / 1000)
        self.forward(truncate=kind == "truncate")

    def forward(self, truncate=False):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        headers["Host"] = UPSTREAM.netloc
        conn = http.client.HTTPConnection(UPSTREAM.hostname, UPSTREAM.port or 80, timeout=60)
        try:
            conn.request(self.command, self.path, body=body, headers=headers)
            res = conn.getresponse()
            data = res.read()
        except OSError as e:
            return self.reply(502, json.dumps({"error": f"fault proxy: upstream unreachable ({e})"}).encode())
        finally:
            conn.close()
        self.send_response(res.status)
        for k, v in res.getheaders():
            if k.lower() not in HOP and k.lower() != "content-length":
                self.send_header(k, v)
        if truncate:
            # Promise the whole body, send half, and hang up: what a dropped
            # connection mid-response looks like to the client.
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data[: len(data) // 2])
            self.close_connection = True
            return
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def tunnel(self):
        """The socket, byte for byte: re-send the upgrade request upstream and
        pipe both directions until either side closes."""
        up = socket.create_connection((UPSTREAM.hostname, UPSTREAM.port or 80))
        lines = [f"{self.command} {self.path} HTTP/1.1"]
        lines += [f"{k}: {UPSTREAM.netloc if k.lower() == 'host' else v}" for k, v in self.headers.items()]
        up.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
        client = self.connection
        try:
            while True:
                ready, _, _ = select.select([client, up], [], [], 60)
                if not ready:
                    continue
                for src in ready:
                    chunk = src.recv(65536)
                    if not chunk:
                        return
                    (up if src is client else client).sendall(chunk)
        except OSError:
            return
        finally:
            up.close()
            self.close_connection = True

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = handle_any


def serve(port=PORT, faults=""):
    with _lock:
        _faults[:] = parse_faults(faults)
    server = ThreadingHTTPServer(("127.0.0.1", port), Proxy)
    server.daemon_threads = True
    return server


def main():
    try:
        server = serve(PORT, os.environ.get("FAULTS", ""))
    except ValueError as e:
        sys.exit(str(e))
    print(f"fault proxy :{PORT} → {UPSTREAM.geturl()}  faults: {_faults or 'none'}")
    print(f"  Metro: EXPO_PUBLIC_API_URL=http://10.0.2.2:{PORT} npx expo start --port 3029  (stop it afterwards)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
