"""Serve the repository locally without reusing stale browser assets."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class PreviewServer(ThreadingHTTPServer):
    request_queue_size = 128


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    handler = partial(PreviewHandler, directory=str(root))
    with PreviewServer(("127.0.0.1", 4173), handler) as server:
        print("Preview: http://127.0.0.1:4173/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
