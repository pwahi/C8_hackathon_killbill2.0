"""Confirmed review in -> Python result, plus a validated Groq gap explanation only when there is a difference.

Python recalculates from the confirmed lines itself; nothing calculated by the browser is trusted.
Sends only confirmed labels/roles/groups, code-formatted amounts and Python's results (no image or OCR).
No automatic retries. Responses are cached under ignored private/groq-cache/.

    .\\.venv\\Scripts\\python.exe scripts/explain_difference.py tests/fixtures/confirmed/BS-004.confirmed.json
"""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from billshield_core.groq_http import read_api_key
from billshield_core.review import ReviewError
from billshield_core.service import explain_review


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        if len(sys.argv) > 1:
            raw = Path(sys.argv[1]).read_text(encoding="utf-8-sig")
        else:
            raw = sys.stdin.buffer.read(200_001).decode("utf-8")
            if len(raw) > 200_000:
                raise ReviewError("confirmed review is too large")
        output = explain_review(json.loads(raw), read_api_key(ROOT), ROOT / "private" / "groq-cache")
        print(json.dumps(output, ensure_ascii=False, indent=2 if len(sys.argv) > 1 else None))
    except (ReviewError, json.JSONDecodeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
    except Exception:
        print(json.dumps({"error": "Python could not analyze this review. No partial result was produced."}))


if __name__ == "__main__":
    main()
