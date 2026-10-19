"""Explicit opt-in for one redacted crop; no request without --send-redacted-crop."""
from pathlib import Path
import argparse
import os
import sys
from pydantic import ValidationError

APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT / "backend"))
from billshield_core.groq_vision import extract_crop


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("crop", type=Path)
    parser.add_argument("--send-redacted-crop", action="store_true")
    args = parser.parse_args()
    if not args.send_redacted_crop:
        parser.error("Review redaction first, then add --send-redacted-crop to send this crop to Groq")
    secret_file = APP_ROOT / ".env.local"
    key = os.environ.get("GROQ_API_KEY", "")
    if not key and secret_file.is_file():
        for line in secret_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("GROQ_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(args.crop.suffix.lower())
    if not mime:
        parser.error("Select a redacted PNG/JPEG crop, not a PDF")
    try:
        if args.crop.stat().st_size > 4_000_000:
            raise ValueError("Crop exceeds 4000000 bytes")
        result = extract_crop(args.crop.read_bytes(), mime, key)
        print("UNCONFIRMED MODEL CANDIDATES — crop-relative page 1; inspect every amount and box.")
        print(result.model_dump_json(indent=2))
    except ValidationError as error:
        print("Invalid candidate fields: " + str([(item['loc'], item['type']) for item in error.errors(include_input=False)]), file=sys.stderr)
        return 1
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception as error:
        # Validation errors can contain returned private text. Do not echo them.
        print(f"Benchmark failed ({type(error).__name__}); check key, input, connectivity and model output.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
