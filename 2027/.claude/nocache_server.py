import http.server
import socketserver
import os

os.chdir("/Users/moss/Documents/Hub/ege-prep/2027")

PORT = int(os.environ.get("PORT", 8080))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()


with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
