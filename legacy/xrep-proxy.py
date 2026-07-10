#!/usr/bin/env python3
"""Start-Helfer für den XJustiz Profilierer.

Serviert Profilierer.html unter http://localhost:8737 und reicht Aufrufe an
die XRepository-REST-Schnittstelle same-origin durch (Pfad /xrep-api/…).
Damit entfällt das CORS-Problem des Browsers vollständig.

Aufruf:   python3 xrep-proxy.py
Beenden:  Strg+C
"""
import http.server
import os
import urllib.request
import webbrowser

PORT = 8737
XREP = "https://www.xrepository.de/api/"


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/xrep-api/"):
            url = XREP + self.path[len("/xrep-api/"):]
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "XJustiz-Profilierer (lokaler Proxy)"}
                )
                with urllib.request.urlopen(req, timeout=300) as r:
                    data = r.read()
                self.send_response(200)
                self.send_header(
                    "Content-Type", r.headers.get("Content-Type", "application/octet-stream")
                )
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:  # noqa: BLE001
                self.send_error(502, f"XRepository nicht erreichbar: {e}")
        else:
            super().do_GET()

    def log_message(self, fmt, *args):
        print("  " + fmt % args)


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    url = f"http://localhost:{PORT}/Profilierer.html"
    print(f"XJustiz Profilierer: {url}")
    print("XRepository-Abrufe laufen über diesen lokalen Proxy. Beenden mit Strg+C.")
    try:
        webbrowser.open(url)
    except Exception:  # noqa: BLE001
        pass
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
