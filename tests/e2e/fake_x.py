"""Server x.com tiruan untuk menguji SapuX end-to-end. Mencatat setiap panggilan API ke calls.jsonl."""
import json, ssl, sys, time, threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = sys.argv[1]
LOG = open(f"{HERE}/calls.jsonl", "a", buffering=1)
NOW = datetime.now(timezone.utc)

def xdate(days):
    return (NOW - timedelta(days=days)).strftime("%a %b %d %H:%M:%S +0000 %Y")

def user(i, handle, days=None, mutual=False, name=None, followers=10):
    u = {"id_str": str(i), "screen_name": handle, "name": name or handle.title(),
         "profile_image_url_https": "https://pbs.twimg.com/x.jpg", "followers_count": followers, "followed_by": mutual}
    if days is not None:
        u["status"] = {"created_at": xdate(days)}
    return u

PAGES = {
    "-1": {"users": [user(1, "lama400", 400), user(2, "aktif10", 10), user(3, "kosong", None),
                     user(4, "mutual500", 500, mutual=True), user(7, "evil", 300, name='<img src=x onerror=alert(1)>'), user(8, "bigproj", 500, followers=120000)],
           "next_cursor_str": "2"},
    "2": {"users": [user(5, "lama200", 200), user(6, "vipacct", 900)], "next_cursor_str": "0"},
}

HOME = b"""<!doctype html><html lang="id"><body><div id="react-root">
<a data-testid="AppTabBar_Profile_Link" href="/timotest">Profil</a><p>Fake X home</p></div>
<script>if(location.search.includes('dark'))document.body.style.backgroundColor='rgb(21,32,43)';else document.body.style.backgroundColor='rgb(255,255,255)';</script><script>const t=()=>fetch('/i/api/graphql/abc/HomeTimeline',{headers:{authorization:'Bearer TESTBEARER'}});t();setInterval(t,1000);</script>
</body></html>"""

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send(self, code, body, ctype="application/json", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", ctype)
        for k, v in (extra or []):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def record(self, body=None):
        u = urlparse(self.path)
        LOG.write(json.dumps({"method": self.command, "path": u.path, "query": parse_qs(u.query), "body": body,
                              "auth": self.headers.get("authorization"), "csrf": self.headers.get("x-csrf-token"),
                              "host": self.headers.get("host")}) + "\n")

    def authed(self):
        return self.headers.get("authorization") == "Bearer TESTBEARER" and self.headers.get("x-csrf-token") == "CSRF123"

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/home":
            return self.send(200, HOME, "text/html", [("set-cookie", "ct0=CSRF123; Path=/; Secure"),
                                                      ("set-cookie", "twid=u%3D999; Path=/; Secure")])
        if u.path.startswith("/i/api/graphql/"):
            return self.send(200, {"data": {}})
        if u.path == "/i/api/1.1/friends/list.json":
            self.record()
            if not self.authed():
                return self.send(401, {"errors": [{"code": 32, "message": "bad auth"}]})
            cursor = parse_qs(u.query).get("cursor", ["-1"])[0]
            return self.send(200, PAGES.get(cursor, {"users": [], "next_cursor_str": "0"}))
        self.send(404, {"errors": [{"code": 34, "message": "not found"}]})

    def do_POST(self):
        u = urlparse(self.path)
        body = parse_qs(self.rfile.read(int(self.headers.get("content-length") or 0)).decode())
        self.record(body)
        if not self.authed():
            return self.send(401, {"errors": [{"code": 32, "message": "bad auth"}]})
        if u.path in ("/i/api/1.1/friendships/destroy.json", "/i/api/1.1/friendships/create.json"):
            return self.send(200, {"id_str": body.get("user_id", [""])[0]})
        self.send(404, {"errors": [{"code": 34, "message": "not found"}]})

srv = ThreadingHTTPServer(("127.0.0.1", 8443), H)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(f"{HERE}/cert.pem", f"{HERE}/key.pem")
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
print("ready", flush=True)
srv.serve_forever()
