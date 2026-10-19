"""Readable Stage 0/1 replay entrypoint; run from any working directory."""

from __future__ import annotations

from pathlib import Path
import sys


APP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_ROOT))

from backend.billshield_core.__main__ import main  # noqa: E402


if __name__ == "__main__":
    main()
