"""Read the owner's packed HTML without executing its scripts or fetching remote assets.

Developer reference only; never imported by the app. Example:
  python scripts/preview_mockup.py "C:/.../BillShield UI mock-ups.html" --install-font
  python scripts/preview_mockup.py "C:/.../BillShield UI mock-ups.html"
"""
import argparse
import base64
import gzip
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import re

DESKTOP = ["7435d791-b2f8-4277-980e-6241f113c01f", "9537f2ed-7219-4a89-ae85-c5d24502a63e",
           "b4c3dd48-8189-482a-9a29-f07a1a02fb41", "8a72a131-e5dd-43a9-b39e-c203c9ef54e2",
           "188c2300-2597-4a0a-8c20-d667371a2be5", "583996a3-eba2-47bb-a6bf-4ba6101ebd45"]


def packed(html, kind):
    return json.loads(re.search(r'<script type="__bundler/' + kind + r'">\s*([\s\S]*?)\s*</script>', html)[1])


def unpack(entry):
    data = base64.b64decode(entry["data"])
    return gzip.decompress(data) if entry.get("compressed") else data


def pages(source):
    manifest = packed(source, "manifest")
    for identifier in DESKTOP:
        nested = unpack(manifest[identifier]).decode("utf-8")
        assets = packed(nested, "manifest")
        template = packed(nested, "template")
        fonts = "\n".join(block for block in re.findall(r"@font-face\s*\{[^}]+\}", template) if "'Anton'" in block)
        for key, entry in assets.items():
            if entry["mime"] == "font/woff2":
                fonts = fonts.replace(key, "data:font/woff2;base64," + base64.b64encode(unpack(entry)).decode())
        fragment = template[template.index('<div style="min-height'):template.index("</x-dc>")]
        fragment = re.sub(r"sc-raw-(table|thead|tbody|tr|th|td|select)", r"\1", fragment)
        fragment = fragment.replace("sc-camel-view-box", "viewBox")
        yield '<!doctype html><html><head><meta charset="utf-8"><style>' + fonts + '</style></head><body style="margin:0">' + fragment + '</body></html>', assets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--install-font", action="store_true")
    args = parser.parse_args()
    source = args.source.read_text(encoding="utf-8")
    references = list(pages(source))
    if args.install_font:
        folder = Path(__file__).resolve().parents[1] / "frontend/assets/fonts"
        folder.mkdir(parents=True, exist_ok=True)
        # Unmodified Latin font asset and accompanying licence from the supplied bundle.
        font = references[0][1]["d19ce943-3310-42ea-a314-4b3d3a13b3d7"]
        (folder / "anton-latin.woff2").write_bytes(unpack(font))
        (folder / "ANTON-LICENSE.txt").write_text(re.search(r"<!--([\s\S]*?)-->", source)[1].strip() + "\n", encoding="utf-8")
        print("Installed supplied Anton Latin font and its licence. No network request.")
        return

    views = dict(zip(["/1", "/2", "/3", "/4", "/4b", "/5"], [page for page, _ in references]))

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            content = views.get(self.path, views["/1"]).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:")
            self.end_headers()
            self.wfile.write(content)

    print("Read-only desktop reference http://127.0.0.1:4181/1 (views 1,2,3,4,4b,5)")
    HTTPServer(("127.0.0.1", 4181), Handler).serve_forever()


if __name__ == "__main__":
    main()
