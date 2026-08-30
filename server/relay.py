#!/usr/bin/env python3
"""relay.py — the only thing that crosses the network between phones.

Every phone runs its own complete stack: camera, COCO-SSD, tracker, rules.
They do not share vision and they do not share video. Video
cannot cross the network here even if we wanted it to — getUserMedia is
refused on any non-localhost origin, so the camera must stay on the device
that renders it (CLAUDE.md, "Mesh").

What crosses is events: "press zone, warn, 13:42". A few hundred bytes.

Endpoints
    POST /event          one event (JSON object). Returns {"seq": n}.
    GET  /events?since=n events with seq > n. Returns {"seq": n, "events": [...]}.
    GET  /health         {"ok": true, "seq": n, "devices": [...]}.

Run it on whichever device is reachable — a phone in a hotspot, or the laptop
during a GREEN window:

    python3 server/relay.py --host 0.0.0.0 --port 8090

The supervisor phone points app/mesh.js at http://<that-ip>:8090.

Deliberately: no database, no dependencies outside the standard library, and
no persistence. The relay is a postbox, not a record. Each phone's own
IndexedDB (app/log.js) is the durable log, so losing the relay mid-demo costs
the live supervisor view and nothing else.
"""

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# Ring buffer. A phone that polls every second and falls 600 events behind has
# bigger problems than a truncated backlog.
MAX_EVENTS = 600

# Refuse anything larger than this on POST. A base64 frame is ~50 KB and must
# never come through here — see _clean().
MAX_BODY_BYTES = 16 * 1024

# Fields a phone is allowed to publish. Anything else is dropped rather than
# relayed, so a bug on one phone cannot inject arbitrary payload into another's
# supervisor view. `snapshot` is excluded on purpose: breach frames stay on the
# device that captured them, which keeps the anonymisation promise local.
ALLOWED_FIELDS = {"device", "status", "rule", "say", "trackIds", "ts", "kind"}


class Store:
    def __init__(self):
        self._lock = threading.Lock()
        self._events = []
        self._seq = 0
        self._devices = {}  # device id -> last seq seen from it

    def add(self, event):
        with self._lock:
            self._seq += 1
            event["seq"] = self._seq
            self._events.append(event)
            if len(self._events) > MAX_EVENTS:
                del self._events[: len(self._events) - MAX_EVENTS]
            device = event.get("device")
            if device:
                self._devices[device] = self._seq
            return self._seq

    def since(self, seq):
        with self._lock:
            return [e for e in self._events if e["seq"] > seq], self._seq

    def status(self):
        with self._lock:
            return self._seq, sorted(self._devices)


STORE = Store()


def _clean(raw):
    """Keep only known fields, and cap the strings. Returns None if unusable."""
    if not isinstance(raw, dict):
        return None
    event = {}
    for key in ALLOWED_FIELDS:
        if key not in raw:
            continue
        value = raw[key]
        if isinstance(value, str):
            value = value[:200]
        event[key] = value
    if "status" not in event:
        return None
    return event


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # The supervisor page is served from 127.0.0.1:8080 while the relay lives
    # on a LAN address, so this is genuinely cross-origin and needs
    # the headers. It is a LAN postbox for a two-phone demo, not a public service.
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/events":
            try:
                since = int(parse_qs(parsed.query).get("since", ["0"])[0])
            except ValueError:
                since = 0
            events, seq = STORE.since(since)
            return self._send(200, {"seq": seq, "events": events})

        if parsed.path == "/health":
            seq, devices = STORE.status()
            return self._send(200, {"ok": True, "seq": seq, "devices": devices})

        return self._send(404, {"error": "not found"})

    def do_POST(self):
        if urlparse(self.path).path != "/event":
            return self._send(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            return self._send(413, {"error": "event too large — snapshots stay on the phone"})

        try:
            raw = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._send(400, {"error": "invalid json"})

        event = _clean(raw)
        if event is None:
            return self._send(400, {"error": "event needs at least a status field"})

        return self._send(200, {"seq": STORE.add(event)})

    # One line per request would drown the terminal at 1 Hz polling from two phones.
    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description="SafetyEye mesh event relay")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8090)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"relay on http://{args.host}:{args.port}  (POST /event, GET /events?since=N)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nrelay stopped")


if __name__ == "__main__":
    main()
