"""Operations shared by the command-line scripts and the FastAPI app."""
from __future__ import annotations

from pathlib import Path

from .gap_llm import MODEL, explain_gap
from .review import analyze_confirmed_review


def explain_review(payload: dict, api_key: str, cache_dir: Path | None) -> dict:
    """Python result first; only for a real difference, add a validated Groq explanation.

    Raises ReviewError for an invalid review. Provider problems never hide the Python result.
    """
    result = analyze_confirmed_review(payload)
    if not result["gap"]["needsExplanation"]:
        return {"result": result, "explanation": None, "skipped": "No difference to explain, so nothing was sent to Groq."}
    try:
        explanation = explain_gap(result, api_key, cache_dir)
    except RuntimeError as error:  # provider/network problem with a safe message
        return {"result": result, "explanation": None, "explanationError": str(error)}
    except (ValueError, KeyError, IndexError):
        return {"result": result, "explanation": None, "explanationError":
                f"The {MODEL} answer did not pass BillShield's safety checks, so it was not used. The Python result and message are unaffected."}
    return {"result": analyze_confirmed_review(payload, explanation), "explanation": explanation}
