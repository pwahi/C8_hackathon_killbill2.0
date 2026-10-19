"""Local test-harness child process: bounded image JSON in, candidate JSON out."""
import base64
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from billshield_core.groq_vision import IncompleteOutput, extract_crop


def main():
    try:
        data = json.loads(sys.stdin.buffer.read(5_500_001))
        if data.get("redacted") is not True:
            raise ValueError("Redaction confirmation required")
        image = base64.b64decode(data["imageBase64"], validate=True)
        key = os.environ.get("GROQ_API_KEY", "")
        config = ROOT / ".env.local"
        if not key and config.is_file():
            for line in config.read_text(encoding="utf-8-sig").splitlines():
                if line.startswith("GROQ_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("\"'")
        output = extract_crop(image, data["mime"], key, ROOT / "private" / "groq-cache")
        print(json.dumps({"output": output.model_dump(), "model": "qwen/qwen3.8-27b"}))
    except IncompleteOutput:
        print(json.dumps({"error": "Groq's answer was cut off because this area has too many lines. Select a smaller part of the table (for example the top half, then the bottom half) and send each part."}))
    except RuntimeError as error:
        print(json.dumps({"error": str(error)}))
    except Exception:
        print(json.dumps({"error": "Unable to validate this crop or the model response. Check the local key and try a smaller charge table. Cached model responses are retained privately for debugging."}))


if __name__ == "__main__":
    main()
