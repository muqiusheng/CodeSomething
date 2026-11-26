#!/usr/bin/env python3
"""Serve the two Java judge routes on the provider's separate private port."""
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import re

CLAIM = "/api/v1/internal/java-judge/claim"
RESULT = re.compile(r"/api/v1/internal/java-judge/[0-9a-f-]{36}/result")
MAX_BODY = 512 * 1024


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(12)

    def do_POST(self):
        if self.path != CLAIM and not RESULT.fullmatch(self.path):
            self.send_error(404)
            return
        authorization = self.headers.get("Authorization", "")
        length = self.headers.get("Content-Length", "")
        if (not re.fullmatch(r"Bearer [a-fA-F0-9]{64}", authorization)
                or not re.fullmatch(r"[0-9]{1,6}", length) or self.headers.get("Transfer-Encoding")
                or int(length) > MAX_BODY):
            self.send_error(404)
            return
        try:
            data = self.rfile.read(int(length))
            if len(data) != int(length):
                self.send_error(400)
                return
            connection = http.client.HTTPConnection("127.0.0.1", 17680, timeout=8)
            try:
                connection.request("POST", self.path, body=data, headers={
                    "Authorization": authorization, "Content-Type": "application/json",
                })
                result = connection.getresponse()
                body = result.read(MAX_BODY + 1)
                if len(body) > MAX_BODY:
                    self.send_error(502)
                    return
                self.send_response(result.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            finally:
                connection.close()
        except (OSError, http.client.HTTPException):
            self.close_connection = True

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 17684), Handler).serve_forever()
