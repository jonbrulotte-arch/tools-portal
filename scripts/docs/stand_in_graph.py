"""Stand-in for Microsoft identity + Graph sendMail (docs screenshots only).
Usage: python3 scripts/docs/stand_in_graph.py <dir>   # saves each sent message to <dir>/sent-N.json"""
import json, os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
OUT = sys.argv[1]
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("content-length", 0)); body = self.rfile.read(n)
        if "/oauth2/v2.0/token" in self.path:
            out = json.dumps({"access_token": "stand-in", "expires_in": 3600}).encode()
            self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(out); return
        if self.path.endswith("/sendMail"):
            k = len([f for f in os.listdir(OUT) if f.startswith("sent-")])
            open(os.path.join(OUT, f"sent-{k+1}.json"), "wb").write(body)
            self.send_response(202); self.end_headers(); return
        self.send_response(404); self.end_headers()
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 8097), H).serve_forever()
