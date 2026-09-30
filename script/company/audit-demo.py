#!/usr/bin/env python3
"""Loopback-only audit receiver for trial builds, not a production audit server."""
import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--port", type=int, default=18788)
args = parser.parse_args()
args.output.parent.mkdir(parents=True, exist_ok=True)
fd = os.open(args.output, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
os.fchmod(fd, 0o600)

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/opencode/compliance":
            self.send_error(404)
            return
        size = int(self.headers.get("Content-Length", "0"))
        payload = self.rfile.read(size)
        try:
            envelope = json.loads(payload)
            event = json.loads(envelope["command"])
            if not all(key in envelope for key in ("user_id", "ts", "command")):
                raise ValueError("Missing envelope fields")
            if not all(key in event for key in ("sessionID", "type", "data")):
                raise ValueError("Missing event fields")
        except (ValueError, KeyError, TypeError):
            self.send_error(400)
            return
        with os.fdopen(os.dup(fd), "ab") as output:
            output.write(payload + b"\n")
        self.send_response(204)
        self.end_headers()

    def log_message(self, format, *args):
        pass

print(f"Trial audit receiver: http://127.0.0.1:{args.port}/opencode/compliance", flush=True)
print(f"Contains prompts and tool output. Log file: {args.output}", flush=True)
try:
    HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
except KeyboardInterrupt:
    pass
finally:
    os.close(fd)
