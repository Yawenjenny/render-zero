"""Static server for Render Zero. Windows' registry can map .js to text/plain,
which browsers refuse for ES modules, so the types are set explicitly here."""
import http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
                      ".glb": "model/gltf-binary", ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg"}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_GET(self):
        del self.headers["If-Modified-Since"]  # always send the file, never a cached 304
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


print("Render Zero running at http://localhost:%d  (close this window to stop)" % PORT)
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
