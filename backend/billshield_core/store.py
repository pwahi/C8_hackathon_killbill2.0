"""Supabase storage through its REST interfaces, always acting as the signed-in (anonymous) user.

The server never uses a service key: every database call carries the user's own access token, so the
row level security policies decide what can be read or written. No bill files or OCR text are stored.
"""
from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from .edits import blank_private_details, words_changed
from .tone import apply_tone


class StoreError(RuntimeError):
    """A storage problem with a message that is safe to show."""


def _secret_key_configured() -> bool:
    # A secret/service-role key bypasses row level security; this app must only ever hold the publishable key.
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    return key.startswith("sb_secret_") or '"service_role"' in key


def configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_PUBLISHABLE_KEY")) and not _secret_key_configured()


def _call(method: str, path: str, body: dict | None = None, token: str | None = None, prefer: str | None = None):
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    if not base or not key:
        raise StoreError("Saving is not configured on this server.")
    if _secret_key_configured():
        raise StoreError("Saving is disabled: a secret database key was configured instead of the publishable key.")
    headers = {"apikey": key, "Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(base + path, data=data, headers=headers, method=method), timeout=20) as response:
            raw = response.read(2_000_000)
    except HTTPError as error:
        if error.code in (401, 403):
            raise StoreError("Your session expired or is not allowed to do this. Reload the page and try again.") from None
        raise StoreError(f"The database refused the request (HTTP {error.code}).") from None
    except URLError:
        raise StoreError("The database could not be reached.") from None
    return json.loads(raw) if raw else None


def _session(answer: dict) -> dict:
    return {"accessToken": answer["access_token"], "refreshToken": answer["refresh_token"],
            "expiresIn": answer.get("expires_in"), "userId": answer.get("user", {}).get("id")}


def start_anonymous_session() -> dict:
    return _session(_call("POST", "/auth/v1/signup", {"data": {}}))


def refresh_session(refresh_token: str) -> dict:
    return _session(_call("POST", "/auth/v1/token?grant_type=refresh_token", {"refresh_token": refresh_token}))


def review_record(payload: dict, result: dict, explanation: dict | None) -> dict:
    """Least-data row set for one completed review, built from Python's own result."""
    confirmed = {line["id"]: line for line in payload["lines"]}
    lines = []
    for line in result["lines"]:
        source = confirmed[line["id"]]["source"]
        lines.append({
            "client_line_id": line["id"], "description": line["description"], "role": line["role"],
            "group_label": line["group"], "amount_minor": line["amountMinor"],
            "raw_amount": confirmed[line["id"]]["rawAmount"], "extracted_raw_amount": confirmed[line["id"]].get("extractedRawAmount"),
            "extractor": line["extractor"], "corrected": line["corrected"], "source_page": source["page"],
            "source_precision": source["precision"], "source_located_by": source.get("locatedBy"),
            "source_box": source.get("bounds") or source.get("region"), "row_columns": confirmed[line["id"]].get("breakdown"),
        })
    finding = {
        "verdict": result["verdict"], "arithmetic_status": result["arithmeticStatus"],
        "comparison_status": result["comparisonStatus"], "calculated_total_minor": result["minor"]["calculatedTotal"],
        "printed_total_minor": result["minor"]["printedTotal"], "difference_minor": result["minor"]["difference"],
        "calculation": {"totalFormula": result["totalFormula"], "groups": result["groups"],
                        "rowChecks": result["rowChecks"], "exactMatches": result["gap"]["exactMatches"]},
        "missing_info": result["missingEvidence"], "supporting_line_ids": result["draft"]["supportingLineIds"],
        "ai_explanation": None if explanation is None else {
            key: explanation[key] for key in ("model", "likelyCauses", "unexplained", "question", "evidenceToRequest")},
    }
    message = {
        "draft_text": result["draft"]["text"], "message_type": result["messageType"],
        "line_ids": [line["id"] for line in result["lines"] if line["inMessage"]],
        "ai_question": result.get("aiAppendedQuestion"), "model": None if explanation is None else explanation["model"],
    }
    return {"currency": result["currency"], "decimal_separator": payload["decimalSeparator"],
            "expected_minor": result["minor"]["expected"], "lines": lines, "finding": finding, "message": message}


def save_review(token: str, payload: dict, result: dict, explanation: dict | None = None) -> dict:
    saved = _call("POST", "/rest/v1/rpc/save_review", {"review": review_record(payload, result, explanation)}, token)
    return {"billId": saved["bill_id"], "messageId": saved["message_id"]}


def record_event(token: str, message_id: str, action: str, final_text: str | None, tone: str = "neutral",
                 draft_shown: str | None = None) -> dict:
    if action not in ("copied", "sent"):
        raise StoreError("Unknown action.")
    rows = _call("GET", f"/rest/v1/messages?id=eq.{quote(message_id)}&select=draft_text", token=token)
    if not rows:
        raise StoreError("Message not found for this session.")
    changed = None
    stored_text = None
    if final_text and final_text.strip():
        # Words changed are counted against the draft in the tone the person chose, so choosing a tone is not editing.
        # The AI-written version that was on screen is the baseline when there was one.
        changed = words_changed(draft_shown or apply_tone(rows[0]["draft_text"], tone), final_text)
        stored_text = blank_private_details(final_text.strip())[:5000]
    _call("POST", "/rest/v1/message_events", {"message_id": message_id, "action": action,
                                               "final_text": stored_text, "words_changed": changed},
          token, prefer="return=minimal")
    return {"action": action, "wordsChanged": changed}
