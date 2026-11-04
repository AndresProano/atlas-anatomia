"""Servidor local sin caché para desarrollo: python -I scripts/serve.py [puerto]"""
import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
web = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
handler = functools.partial(NoCache, directory=web)
NoCache.extensions_map[".glb"] = "model/gltf-binary"
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
