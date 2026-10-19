"""Vercel build step: install the pinned browser reading tools that the review page loads.

Runs `npm ci` in frontend/ from package-lock.json (exact versions). Fails loudly if npm is missing,
so a deployment without PDF.js/Tesseract.js can never look healthy.
"""
from pathlib import Path
import shutil
import subprocess
import sys

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"


def main() -> None:
    npm = shutil.which("npm")
    if npm is None:
        sys.exit("npm is not available in this build environment; the review page needs PDF.js and Tesseract.js.")
    subprocess.run([npm, "ci", "--omit=dev", "--no-audit", "--no-fund"], cwd=FRONTEND, check=True)
    for required in ("pdfjs-dist/build/pdf.mjs", "tesseract.js/dist/worker.min.js", "@tesseract.js-data/eng"):
        if not (FRONTEND / "node_modules" / required).exists():
            sys.exit(f"build check failed: frontend/node_modules/{required} is missing")
    print("Browser reading tools installed for the review page.")


if __name__ == "__main__":
    main()
