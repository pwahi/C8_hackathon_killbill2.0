"""Supabase storage through its REST interfaces, always acting as the signed-in (anonymous) user.

The server never uses a service key: every database call carries the user's own access token, so the
row level security policies decide what can be read or written. No bill files or OCR text are stored.
"""
from __future__ import annotations

import json
import re
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from .edits import blank_private_details, words_changed
from .money import format_minor
from .tone import apply_tone


class StoreError(RuntimeError):
    """A storage problem with a message that is safe to show. status: the database's HTTP code, if it answered."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


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
            raise StoreError("Your session expired or is not allowed to do this. Reload the page and try again.", error.code) from None
        raise StoreError(f"The database refused the request (HTTP {error.code}).", error.code) from None
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


# ---- Reading saved reviews back (owner request 2026-10-19) ----
# Same rules as saving: the person's own token, so row level security returns only this browser's rows.
# Read-only: a saved review is never changed; checking a bill again creates a new saved review.

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
LIST_SELECT = ("id,currency,created_at,line_items(description,role,amount_minor),"
               "findings(verdict,calculated_total_minor,printed_total_minor,difference_minor,"
               "messages(id,message_events(action)))")
OPEN_SELECT = ("id,currency,created_at,"
               "line_items(client_line_id,description,role,group_label,raw_amount,amount_minor,source_page,corrected),"
               "expectations(expected_minor),"
               "findings(verdict,calculated_total_minor,printed_total_minor,difference_minor,missing_info,"
               "messages(id,draft_text,message_events(action,final_text,words_changed,created_at)))")


def _verdict_text(finding: dict, currency: str) -> str:
    difference = finding.get("difference_minor")
    if finding["verdict"] == "verified_mismatch":
        return "The re-checked figures on the bill do not add up."
    if finding["verdict"] == "checks_passed" or not difference:
        return "The bill adds up and matches what you expected."
    return f"The bill adds up, but differs from what you expected by {format_minor(abs(difference), currency)}."


def _message_status(message: dict | None) -> str:
    actions = {event["action"] for event in (message or {}).get("message_events") or []}
    return "sent" if "sent" in actions else "copied" if "copied" in actions else "not sent yet"


def review_summary(bill: dict) -> dict | None:
    """One row of "Your earlier checks". Amounts are Python's saved integers, formatted here."""
    if not bill.get("findings"):
        return None
    finding, currency = bill["findings"][0], bill["currency"]
    charges = sorted((line for line in bill.get("line_items") or [] if line["role"] == "charge"),
                     key=lambda line: -line["amount_minor"])
    total = finding["printed_total_minor"] if finding["printed_total_minor"] is not None else finding["calculated_total_minor"]
    difference = finding.get("difference_minor")
    return {"id": bill["id"], "createdAt": bill["created_at"],
            "name": " · ".join(line["description"] for line in charges[:2]) or "Bill",
            "total": format_minor(total, currency), "verdict": finding["verdict"],
            "difference": format_minor(abs(difference), currency) if difference else None,
            "messageStatus": _message_status((finding.get("messages") or [None])[0])}


def review_detail(bill: dict) -> dict:
    """Everything needed to show one saved review read-only."""
    currency = bill["currency"]
    finding = (bill.get("findings") or [{}])[0]
    message = (finding.get("messages") or [None])[0] or {}
    events = sorted(message.get("message_events") or [], key=lambda event: event["created_at"])
    sent = [event for event in events if event["action"] == "sent" and event.get("final_text")]
    expected = (bill.get("expectations") or [{}])[0].get("expected_minor")
    money = lambda amount: None if amount is None else format_minor(amount, currency)
    lines = sorted(bill.get("line_items") or [], key=lambda line: (line["source_page"], line["client_line_id"]))
    return {
        "id": bill["id"], "createdAt": bill["created_at"], "currency": currency,
        "lines": [{"id": line["client_line_id"], "description": line["description"], "role": line["role"],
                   "group": line["group_label"], "printed": line["raw_amount"], "amount": money(line["amount_minor"]),
                   "page": line["source_page"], "corrected": line["corrected"]} for line in lines],
        "verdict": finding.get("verdict"), "verdictText": _verdict_text(finding, currency) if finding else "",
        "calculatedTotal": money(finding.get("calculated_total_minor")), "printedTotal": money(finding.get("printed_total_minor")),
        "expected": money(expected), "difference": money(finding.get("difference_minor")),
        "stillUnknown": finding.get("missing_info") or [],
        "message": {"id": message.get("id"), "draft": message.get("draft_text", ""),
                    "sentText": sent[-1]["final_text"] if sent else None, "status": _message_status(message),
                    "events": [{"action": event["action"], "at": event["created_at"]} for event in events]},
    }


def list_reviews(token: str) -> list[dict]:
    bills = _call("GET", f"/rest/v1/bills?select={LIST_SELECT}&order=created_at.desc&limit=50", token=token) or []
    return [summary for summary in map(review_summary, bills) if summary]


def open_review(token: str, bill_id: str) -> dict:
    if not UUID.match(bill_id or ""):
        raise StoreError("This saved check does not exist.")
    bills = _call("GET", f"/rest/v1/bills?id=eq.{bill_id}&select={OPEN_SELECT}", token=token)
    if not bills:
        raise StoreError("This saved check was not found for this browser.")
    return review_detail(bills[0])
