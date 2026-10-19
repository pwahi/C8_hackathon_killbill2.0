"""Explicit opt-in for one redacted crop; no request without --send-redacted-crop."""
from pathlib import Path
import argparse
import os
import sys
from pydantic import ValidationError

APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT / "backend"))
from billshield_core.groq_vision import extract_crop
from billshield_core.structure_proposal import check_proposal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("crop", type=Path)
    parser.add_argument("--send-redacted-crop", action="store_true")
    parser.add_argument("--structure", action="store_true", help="also ask for the bill structure (H2) and verify it")
    parser.add_argument("--decimal", choices=[".", ","], default=".", help="decimal mark printed on the bill")
    parser.add_argument("--currency", choices=["EUR", "INR"], default="EUR")
    parser.add_argument("--provider", choices=["groq", "openrouter"], default="groq")
    args = parser.parse_args()
    if not args.send_redacted_crop:
        parser.error("Review redaction first, then add --send-redacted-crop to send this crop to Groq")
    secret_file = APP_ROOT / ".env.local"
    from billshield_core.groq_http import OPENROUTER_KEY_NAMES, read_api_key
    key = read_api_key(APP_ROOT, OPENROUTER_KEY_NAMES if args.provider == "openrouter" else ("GROQ_API_KEY",))
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(args.crop.suffix.lower())
    if not mime:
        parser.error("Select a redacted PNG/JPEG crop, not a PDF")
    try:
        if args.crop.stat().st_size > 4_000_000:
            raise ValueError("Crop exceeds 4000000 bytes")
        # Cached in the ignored private/ folder so re-running never repeats a paid request.
        result = extract_crop(args.crop.read_bytes(), mime, key, APP_ROOT / "private" / "groq-cache",
                              with_structure=args.structure, provider=args.provider)
        print("UNCONFIRMED MODEL CANDIDATES — crop-relative page 1; inspect every amount and box.")
        print(result.model_dump_json(indent=2))
        if args.structure:
            check = check_proposal(result, decimal_separator=args.decimal, currency=args.currency)
            if check is None:
                print("\nPYTHON CHECK: the model returned no structure.")
            else:
                print(f"\nPYTHON CHECK: {check.status}")
                for problem in check.problems:
                    print(f"  - {problem.kind}: {problem.message} {list(problem.ids)}")
                for node_id, node in check.check.nodes.items():
                    print(f"  {node.kind} {node_id}: rows add up to {node.computed_minor} (minor units), "
                          f"printed {node.printed_minor}, matches {node.matches}")
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
