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

SCANS = [0]
GEO = [  # id, handle, days, location, lang, mutual
  (1, "budi_jkt", 400, "Jakarta, Indonesia", "en", False),
  (2, "sari", 380, "", "in", False),
  (3, "raj", 350, "Mumbai, India", "en", False),
  (4, "priya", 330, "\U0001F1EE\U0001F1F3", "en", False),
  (5, "dev_hindi", 320, "", "hi", False),
  (6, "manila_guy", 310, "Manila", "en", False),
  (7, "nyc_trader", 500, "New York", "en", False),
  (8, "web3_anon", 290, "Web3 \U0001F30D", "en", False),
  (9, "active_in", 3, "Delhi", "en", False),
  (10, "mutual_id", 400, "Bandung", "in", True),
]
BASED = {"budi_jkt": ("Indonesia", True), "sari": ("Indonesia", True), "raj": ("India", True), "priya": ("South Asia", True),
         "dev_hindi": ("India", False), "manila_guy": ("Philippines", True), "nyc_trader": ("India", True), "web3_anon": ("Nigeria", True),
         "active_in": ("India", True), "mutual_id": ("Indonesia", True)}
RATE = [50]
GOOD_QID = "NewAboutId_1234"
ABOUT_PAGE = HOME_PLACEHOLDER = None
def about_json(handle):
    if handle not in BASED:
        return {"data": {"user_result_by_screen_name": {}}}
    based, acc = BASED[handle]
    return {"data": {"user_result_by_screen_name": {"result": {"__typename": "User", "about_profile": {"account_based_in": based, "location_accurate": acc, "source": based + " Android App"}, "core": {"screen_name": handle}}}}}

def page_one():
    users = []
    for i, handle, days, loc, lang, mutual in GEO:
        u = user(i, handle, days, mutual=mutual, followers=900)
        u["friends_count"] = 50; u["location"] = loc; u["status"]["lang"] = lang
        users.append(u)
    return {"users": users, "next_cursor_str": "0"}

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
        if u.path.endswith("/AboutAccountQuery"):
            self.record()
            qid = u.path.split("/")[4]
            if qid != GOOD_QID:
                return self.send(404, {"errors": [{"message": "Query not found"}]})
            if not self.authed():
                return self.send(401, {"errors": [{"code": 32, "message": "bad auth"}]})
            import json as _j
            handle = _j.loads(parse_qs(u.query)["variables"][0])["screenName"]
            RATE[0] = max(0, RATE[0] - 1)
            return self.send(200, about_json(handle), extra=[("x-rate-limit-limit", "50"), ("x-rate-limit-remaining", str(RATE[0])), ("x-rate-limit-reset", str(int(time.time()) + 900))])
        if u.path.startswith("/i/api/graphql/"):
            return self.send(200, {"data": {}})
        if u.path.endswith("/about"):
            page = HOME.replace(b"</body>", b"<script>fetch('/i/api/graphql/" + GOOD_QID.encode() + b"/AboutAccountQuery?variables=%7B%22screenName%22%3A%22raj%22%7D',{headers:{authorization:'Bearer TESTBEARER','x-csrf-token':'CSRF123'}});</script></body>")
            return self.send(200, page, "text/html")
        if u.path == "/i/api/1.1/friends/list.json":
            self.record()
            if not self.authed():
                return self.send(401, {"errors": [{"code": 32, "message": "bad auth"}]})
            SCANS[0] += 1
            return self.send(200, page_one())
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

srv = ThreadingHTTPServer(("127.0.0.1", 8446), H)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(f"{HERE}/cert.pem", f"{HERE}/key.pem")
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
print("ready", flush=True)
srv.serve_forever()
