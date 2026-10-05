"""Render Zero static server plus a save endpoint, used to render the walkthrough video.

The page posts each rendered frame (and stills, and the audio track) to /save?name=...;
everything lands inside the project's video/ folder and nowhere else. Listens on 127.0.0.1 only.
"""
import base64, http.server, os, sys, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "video")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"          # keep connections open: thousands of frames arrive one after another
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
                      ".glb": "model/gltf-binary", ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg"}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_GET(self):
        del self.headers["If-Modified-Since"]
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        name = (q.get("name") or [""])[0].replace("\\", "/")
        parts = [p for p in name.split("/") if p not in ("", ".", "..")]
        if u.path != "/save" or not parts:
            self.send_error(404)
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if q.get("b64"):                      # a data: URL or bare base64 text
            data = base64.b64decode(data.split(b",", 1)[-1])
        path = os.path.join(OUT, *parts)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, fmt, *args):        # thousands of frame uploads would flood the console
        if "/save" not in (args[0] if args else ""):
            super().log_message(fmt, *args)


print("Render Zero (recording) at http://localhost:%d  - saving into %s" % (PORT, OUT))
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
