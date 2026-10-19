"""Message tone (owner request 2026-10-19). Only the greeting and closing change; the sentences that carry the
amounts stay exactly as the controlled draft wrote them, and no tone adds a number.

frontend/tone.mjs is the browser twin; both are tested against the same expected texts.
"""

from __future__ import annotations

TONES = ("neutral", "warm", "direct")
WARM_OPENING = "Hello, I hope you are doing well. "
WARM_CLOSING = " Thank you very much for your help, I appreciate it."
DIRECT_CLOSING = " I would like a clear answer and, if a charge turns out to be incorrect, an adjustment. Please reply as soon as possible."


def apply_tone(text: str, tone: str) -> str:
    if tone not in TONES:
        raise ValueError("unknown tone")
    if tone == "neutral":
        return text
    body = text[len("Hello, "):] if text.startswith("Hello, ") else text
    body = body[:1].upper() + body[1:]
    if tone == "warm":
        return WARM_OPENING + body + WARM_CLOSING
    return body + DIRECT_CLOSING
