"""One guarded Groq chat-completions call shared by the vision and gap-explanation adapters.

No automatic retries. Provider bodies, headers and keys are never echoed. Responses are cached
privately (before validation) so debugging a parser never repeats a paid request.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"


def post_chat(payload: dict, api_key: str, cache_dir: Path | None = None, timeout: int = 60) -> dict:
    if not api_key.strip():
        raise ValueError("GROQ_API_KEY is missing")
    cache_file = None
    if cache_dir is not None:
        cache_file = cache_dir / (hashlib.sha256(json.dumps(payload).encode()).hexdigest() + ".json")
        if cache_file.is_file():
            return json.loads(cache_file.read_text(encoding="utf-8"))
    request = Request(ENDPOINT, data=json.dumps(payload).encode(),
                      headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
                               "User-Agent": "BillShield-Hackathon/0.1", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read(1_000_000))
    except HTTPError as error:
        category = ""
        try:
            code = json.loads(error.read(8192)).get("error", {}).get("code")
            if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,60}", code):
                category = f" ({code})"
        except (ValueError, AttributeError):
            pass
        retry = error.headers.get("retry-after", "")
        retry_hint = f" Retry after {retry} seconds." if re.fullmatch(r"\d{1,6}(?:\.\d+)?", retry) else ""
        raise RuntimeError(f"Groq request failed with HTTP {error.code}{category}.{retry_hint}") from None
    except URLError:
        raise RuntimeError("Unable to reach Groq") from None
    if cache_file is not None:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(result), encoding="utf-8")
    return result


def read_api_key(app_root: Path) -> str:
    """Key from the environment or the ignored app-root .env.local; never logged or returned to a browser."""
    import os

    key = os.environ.get("GROQ_API_KEY", "")
    config = app_root / ".env.local"
    if not key and config.is_file():
        for line in config.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith("GROQ_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
    return key
