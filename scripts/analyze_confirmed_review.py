"""Analyze one confirmed review payload (schema 2): JSON in, calculation + draft JSON out.

Used by the local review server (stdin) and directly from a terminal:

    .\\.venv\\Scripts\\python.exe scripts/analyze_confirmed_review.py path\\to\\confirmed.json

No network access, no file writes. The payload contains confirmed structured lines only.
"""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from billshield_core.review import ReviewError, analyze_confirmed_review


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows pipes default to a legacy code page
    try:
        if len(sys.argv) > 1:
            raw = Path(sys.argv[1]).read_text(encoding="utf-8-sig")
        else:
            raw = sys.stdin.buffer.read(200_001).decode("utf-8")
            if len(raw) > 200_000:
                raise ReviewError("confirmed review is too large")
        result = analyze_confirmed_review(json.loads(raw))
        print(json.dumps({"result": result}, ensure_ascii=False, indent=None if len(sys.argv) == 1 else 2))
    except (ReviewError, json.JSONDecodeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
    except Exception:
        print(json.dumps({"error": "Python could not analyze this review. No partial result was produced."}))


if __name__ == "__main__":
    main()
