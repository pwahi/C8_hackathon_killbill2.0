"""Copy the exact browser reading tools the page loads from frontend/node_modules into frontend/vendor.

Hosting (Vercel) does not serve node_modules, so these pinned files are kept in Git under frontend/vendor
and served at the same /node_modules/... paths by app.py. Re-run after changing frontend/package-lock.json:

    cd frontend; npm ci; cd ..
    .\\.venv\\Scripts\\python.exe scripts\\vendor_assets.py
"""
from pathlib import Path
import shutil
import sys

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SOURCE = FRONTEND / "node_modules"
TARGET = FRONTEND / "vendor"
FILES = [
    "pdfjs-dist/LICENSE",
    "pdfjs-dist/build/pdf.mjs",
    "pdfjs-dist/build/pdf.worker.mjs",
    "tesseract.js/LICENSE.md",
    "tesseract.js/dist/tesseract.esm.min.js",
    "tesseract.js/dist/worker.min.js",
    "tesseract.js-core/LICENSE",
    "@tesseract.js-data/eng/package.json",
]
# OCR runs with the LSTM engine only, so only the LSTM core variants (plain, SIMD, relaxed SIMD) are needed.
PATTERNS = [("tesseract.js-core", "tesseract-core*lstm*"), ("@tesseract.js-data/eng/4.0.0_best_int", "*")]


def main() -> None:
    if not SOURCE.is_dir():
        sys.exit("frontend/node_modules is missing; run `npm ci` in frontend first.")
    if TARGET.exists():
        shutil.rmtree(TARGET)
    paths = [SOURCE / name for name in FILES]
    for folder, pattern in PATTERNS:
        paths.extend(sorted((SOURCE / folder).glob(pattern)))
    total = 0
    for path in paths:
        if not path.is_file():
            sys.exit(f"missing {path.relative_to(SOURCE)}")
        destination = TARGET / path.relative_to(SOURCE)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
        total += path.stat().st_size
    print(f"Copied {len(paths)} files ({total / 1_000_000:.1f} MB) to frontend/vendor")


if __name__ == "__main__":
    main()
