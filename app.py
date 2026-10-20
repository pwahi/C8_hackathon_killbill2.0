"""BillShield FastAPI app: serves the review page and three JSON operations (D-030).

Run locally from billshield-app/:
    .\\.venv\\Scripts\\python.exe api\\index.py        -> http://127.0.0.1:4173  (API docs at /docs)

The browser never receives the Groq key. Requests must come from an allowed page origin and be JSON.
Bill images/PDFs are never accepted here: only an explicitly approved redacted crop (groq-extract) or
confirmed structured lines (analyze / explain).
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import hmac
import json
import os
from pathlib import Path
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))
from billshield_core.groq_http import OPENROUTER_KEY_NAMES, read_api_key  # noqa: E402
from billshield_core.groq_vision import MODEL, OPENROUTER_MODEL, READERS, IncompleteOutput, extract_crop  # noqa: E402
from billshield_core.groq_vision import read_page  # noqa: E402
from billshield_core.extraction import ExtractionOutput  # noqa: E402
from billshield_core.whole_bill import link_pages, map_pages  # noqa: E402
from billshield_core.message_ai import draft_tones  # noqa: E402
from billshield_core.review import ReviewError, analyze_confirmed_review  # noqa: E402
from billshield_core.service import explain_review  # noqa: E402
from billshield_core.structure_proposal import check_proposal, line_plan  # noqa: E402
from billshield_core import store  # noqa: E402

# Developer machine: read non-secret-in-code settings from the ignored .env.local (hosting sets real env vars).
_local = ROOT / ".env.local"
if _local.is_file():
    for _line in _local.read_text(encoding="utf-8-sig").splitlines():
        _name, _, _value = _line.partition("=")
        if _name.strip() in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "BILLSHIELD_ACCESS_CODE") and _value.strip():
            os.environ.setdefault(_name.strip(), _value.strip().strip("\"'"))

VERSION = "0.2.0"
HOSTED = bool(os.environ.get("VERCEL")) or os.environ.get("BILLSHIELD_ENV") == "production"
LOCAL_ORIGINS = "http://127.0.0.1:4173,http://localhost:4173"
ALLOWED_ORIGINS = {origin.strip() for origin in os.environ.get("BILLSHIELD_ALLOWED_ORIGINS", LOCAL_ORIGINS).split(",") if origin.strip()}
# On Vercel the page's own addresses are allowed automatically.
for variable in ("VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"):
    if os.environ.get(variable):
        ALLOWED_ORIGINS.add(f"https://{os.environ[variable]}")
# Optional: when set, people must enter this code before anything can use the server's AI keys.
ACCESS_CODE = os.environ.get("BILLSHIELD_ACCESS_CODE", "")
# Provider responses are cached only on a developer machine; never on a hosted server.
CACHE_DIR = None if HOSTED else ROOT / "private" / "groq-cache"
# Vercel functions accept request bodies up to 4.5 MB.
CROP_LIMIT = 4_400_000

app = FastAPI(
    title="Kill Bill 2.0 API",
    version=VERSION,
    description="Confirmed bill lines in, code-checked calculations and a required editable draft out. "
    "Python owns every number; models only suggest. Nothing is sent to a provider by this API on its own.",
)
groq_lock = asyncio.Lock()  # one provider request at a time per server process; no automatic retries


def error(status: int, message: str) -> JSONResponse:
    if not HOSTED and status == 422:
        # Developer machine only: say why a check was refused (messages can contain bill labels, so never hosted).
        print(f"refused (422): {message}", flush=True)
    return JSONResponse({"error": message}, status_code=status, headers={"cache-control": "no-store"})


async def read_json(request: Request, limit: int) -> dict | JSONResponse:
    """Shared guard: allowed page origin, JSON content type, bounded body."""
    if request.headers.get("origin") not in ALLOWED_ORIGINS:
        return error(403, "Open this review from the Kill Bill page.")
    # Owner decision (D-063, submission): the hosted app may run without an access code. When the code is set in
    # Vercel it is still required; when it is removed, anyone with the link can use the app.
    if ACCESS_CODE and not hmac.compare_digest(request.headers.get("x-billshield-access", ""), ACCESS_CODE):
        return error(401, "Enter the access code you received for this test (top of the page).")
    if not request.headers.get("content-type", "").startswith("application/json"):
        return error(415, "Send JSON.")
    body = await request.body()
    if len(body) > limit:
        return error(413, "Request is too large.")
    try:
        data = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return error(400, "Request is not valid JSON.")
    if not isinstance(data, dict):
        return error(400, "Request must be a JSON object.")
    return data


def vision_provider() -> str:
    """Who reads approved crops: VISION_PROVIDER if set, otherwise OpenRouter when its key exists, else Groq."""
    choice = os.environ.get("VISION_PROVIDER", "").strip().lower()
    if choice in READERS:
        return choice
    return "openrouter" if read_api_key(ROOT, OPENROUTER_KEY_NAMES).strip() else "groq"


@app.get("/api/health")
def health() -> dict:
    """Readiness without secret values."""
    return {"status": "ok", "version": VERSION, "groqKeyConfigured": bool(read_api_key(ROOT).strip()),
            "visionReader": READERS[vision_provider()],
            "accessCodeRequired": bool(ACCESS_CODE), "databaseConfigured": store.configured()}


def user_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    return header[7:].strip() or None if header.lower().startswith("bearer ") else None


async def try_save(request: Request, payload: dict, result: dict, explanation: dict | None) -> dict:
    """Save a completed review for the signed-in browser. Saving problems never hide the result."""
    token = user_token(request)
    if result.get("status") != "complete" or not store.configured():
        return {"saved": None}
    if not token:
        return {"saved": None, "saveError": "Not saved: no session."}
    try:
        return {"saved": await run_in_threadpool(store.save_review, token, payload, result, explanation)}
    except store.StoreError as problem:
        return {"saved": None, "saveError": f"Not saved: {problem}"}


@app.post("/api/session")
async def start_session(request: Request):
    """Anonymous identity for this browser, so each tester sees only their own saved reviews."""
    data = await read_json(request, 2_000)
    if isinstance(data, JSONResponse):
        return data
    if not store.configured():
        return error(503, "Saving is not configured on this server.")
    try:
        if data.get("refreshToken"):
            return await run_in_threadpool(store.refresh_session, str(data["refreshToken"]))
        return await run_in_threadpool(store.start_anonymous_session)
    except store.StoreError as problem:
        # 410 only when the database rejects the refresh token itself: the browser may then start a new identity.
        # Anything else (database unreachable, overloaded) is temporary and must not cost the person their history.
        if data.get("refreshToken") and problem.status in (400, 401, 403):
            return error(410, "This browser's saved session can no longer be renewed.")
        return error(502, str(problem))


@app.post("/api/messages/{message_id}/events")
async def message_event(message_id: str, request: Request):
    """Record that the draft was copied or sent; with the sent text, count changed words."""
    data = await read_json(request, 30_000)
    if isinstance(data, JSONResponse):
        return data
    token = user_token(request)
    if not token:
        return error(401, "No session: reload the page.")
    try:
        tone = data.get("tone") if data.get("tone") in {"neutral", "warm", "direct"} else "neutral"
        shown = data.get("draftShown") if isinstance(data.get("draftShown"), str) else None
        recorded = await run_in_threadpool(store.record_event, token, message_id, str(data.get("action", "")),
                                           data.get("finalText"), tone, shown[:5000] if shown else None)
    except store.StoreError as problem:
        return error(422, str(problem))
    return JSONResponse(recorded, headers={"cache-control": "no-store"})


@app.post("/api/reviews")
async def saved_reviews(request: Request):
    """This browser's earlier checks, newest first. Read-only; row level security limits it to the caller's rows."""
    data = await read_json(request, 2_000)
    if isinstance(data, JSONResponse):
        return data
    token = user_token(request)
    if not token:
        return error(401, "No session: nothing has been saved in this browser yet.")
    try:
        reviews = await run_in_threadpool(store.list_reviews, token)
    except store.StoreError as problem:
        return error(502, str(problem))
    return JSONResponse({"reviews": reviews}, headers={"cache-control": "no-store"})


@app.post("/api/reviews/open")
async def saved_review(request: Request):
    """One earlier check in full (lines, result, message and what happened to it), read-only."""
    data = await read_json(request, 2_000)
    if isinstance(data, JSONResponse):
        return data
    token = user_token(request)
    if not token:
        return error(401, "No session: nothing has been saved in this browser yet.")
    try:
        review = await run_in_threadpool(store.open_review, token, str(data.get("billId", "")))
    except store.StoreError as problem:
        return error(404, str(problem))
    return JSONResponse({"review": review}, headers={"cache-control": "no-store"})


@app.post("/api/analyze")
async def analyze(request: Request):
    """Confirmed lines -> Python calculations, checks and the required draft. No provider call."""
    data = await read_json(request, 200_000)
    if isinstance(data, JSONResponse):
        return data
    try:
        result = await run_in_threadpool(analyze_confirmed_review, data)
    except ReviewError as problem:
        return error(422, str(problem))
    # A review with a difference is saved by /api/explain once the explanation is added.
    saved = {"saved": None} if result["gap"]["needsExplanation"] else await try_save(request, data, result, None)
    return JSONResponse({"result": result, **saved}, headers={"cache-control": "no-store"})


@app.post("/api/draft-message")
async def draft_message(request: Request):
    """Checked review -> the message in three tones, written by AI from Python's fact sheet (amounts filled in by
    Python). Any tone that breaks a rule falls back to the controlled template. Nothing is saved here."""
    data = await read_json(request, 200_000)
    if isinstance(data, JSONResponse):
        return data
    try:
        result = await run_in_threadpool(analyze_confirmed_review, data)
    except ReviewError as problem:
        return error(422, str(problem))
    if result["status"] != "complete" or not result.get("draft"):
        return error(422, "The numbers need re-checking before a message can be written.")
    async with groq_lock:  # waits for a running explanation instead of failing
        drafts = await run_in_threadpool(draft_tones, result, read_api_key(ROOT), CACHE_DIR)
    return JSONResponse(drafts, headers={"cache-control": "no-store"})


@app.post("/api/explain")
async def explain(request: Request):
    """Python first; only if there is a difference, a validated GPT-OSS suggestion is added."""
    data = await read_json(request, 200_000)
    if isinstance(data, JSONResponse):
        return data
    # Context notes printed on the bill (PRD_SCALABLE W2) travel beside the review, not inside it: they help the AI
    # explain, are checked again in gap_llm, and are never saved.
    notes = data.pop("contextNotes", None) if isinstance(data, dict) else None
    if groq_lock.locked():
        return error(429, "One Groq request is already running. Please wait.")
    async with groq_lock:
        try:
            output = await run_in_threadpool(explain_review, data, read_api_key(ROOT), CACHE_DIR, notes)
        except ReviewError as problem:
            return error(422, str(problem))
    if not HOSTED and output.get("explanationError"):
        print(f"AI explanation not used: {output['explanationError']}", flush=True)  # developer machine only
    output.update(await try_save(request, data, output["result"], output.get("explanation")))
    return JSONResponse(output, headers={"cache-control": "no-store"})


@app.post("/api/groq-extract")
async def groq_extract(request: Request):
    """One explicitly approved, redacted PNG/JPEG crop -> unconfirmed candidate lines from the configured AI reader."""
    data = await read_json(request, CROP_LIMIT)
    if isinstance(data, JSONResponse):
        return data
    if data.get("redacted") is not True:
        return error(400, "Confirm that the selected area contains no personal details.")
    try:
        image = base64.b64decode(str(data.get("imageBase64", "")), validate=True)
    except (binascii.Error, ValueError):
        return error(400, "The selected area could not be read.")
    if groq_lock.locked():
        return error(429, "One reading request is already running. Please wait.")
    async with groq_lock:
        try:
            # The browser asks for the bill structure (sections, periods, subtotals); Python checks it below.
            with_structure = data.get("structure") is True
            provider = vision_provider()
            key = read_api_key(ROOT, OPENROUTER_KEY_NAMES if provider == "openrouter" else ("GROQ_API_KEY",))
            output = await run_in_threadpool(extract_crop, image, str(data.get("mime", "")), key, CACHE_DIR,
                                             with_structure, provider)
        except IncompleteOutput:
            return error(422, "The AI reader's answer was cut off because this area has too many lines. Select a smaller part of the "
                              "table (for example the top half, then the bottom half) and send each part.")
        except RuntimeError as problem:  # provider/network, already safe to show
            return error(502, str(problem))
        except ValueError:
            return error(422, "Unable to validate this crop or the model response. Try a smaller, clearer charge table.")
    plan = None
    # The decimal mark the reader saw on the bill wins over the default from the currency; the page shows it.
    mark = output.decimal_mark or data.get("decimalSeparator")
    if with_structure and mark in {".", ","} and data.get("currency") in {"EUR", "INR"}:
        check = check_proposal(output, decimal_separator=mark, currency=data["currency"])
        if check is not None:
            plan = line_plan(output, check, currency=data["currency"])
    model = OPENROUTER_MODEL if provider == "openrouter" else MODEL
    return JSONResponse({"output": output.model_dump(), "model": model, "structure": plan, "decimalMark": mark},
                        headers={"cache-control": "no-store"})


@app.post("/api/read-page")
async def read_whole_page(request: Request):
    """One full bill page (owner decision 2026-10-19) -> unconfirmed lines, sections and page kind."""
    data = await read_json(request, CROP_LIMIT)
    if isinstance(data, JSONResponse):
        return data
    if data.get("wholePage") is not True:
        return error(400, "Confirm that whole pages may be sent to the AI reader.")
    try:
        image = base64.b64decode(str(data.get("imageBase64", "")), validate=True)
    except (binascii.Error, ValueError):
        return error(400, "This page could not be read.")
    page_text = data.get("pageText")
    page_text = page_text[:20000] if isinstance(page_text, str) else None
    if groq_lock.locked():
        return error(429, "One reading request is already running. Please wait.")
    async with groq_lock:
        provider = vision_provider()
        key = read_api_key(ROOT, OPENROUTER_KEY_NAMES if provider == "openrouter" else ("GROQ_API_KEY",))
        try:
            output = await run_in_threadpool(read_page, image, str(data.get("mime", "")), key, CACHE_DIR, page_text, provider)
        except IncompleteOutput:
            return error(422, "The AI reader's answer for this page was cut off. Draw an area around the price table instead.")
        except RuntimeError as problem:
            return error(502, str(problem))
        except ValueError:
            return error(422, "The AI reader's answer for this page could not be validated. Draw an area around the price table instead.")
    model = OPENROUTER_MODEL if provider == "openrouter" else MODEL
    return JSONResponse({"output": output.model_dump(), "model": model}, headers={"cache-control": "no-store"})


@app.post("/api/link-pages")
async def link_whole_bill(request: Request):
    """All pages read -> one text-only linking pass (OpenRouter) -> Python-verified structure per line."""
    data = await read_json(request, 600_000)
    if isinstance(data, JSONResponse):
        return data
    if data.get("decimalSeparator") not in {".", ","} or data.get("currency") not in {"EUR", "INR"}:
        return error(400, "Choose the currency and decimal mark first.")
    try:
        pages = [(int(item["page"]), ExtractionOutput.model_validate(item["output"])) for item in data.get("pages", [])]
    except (KeyError, TypeError, ValueError):
        return error(400, "The pages to link are not valid.")
    if not 1 <= len(pages) <= 10 or len({number for number, _ in pages}) != len(pages) or any(not 1 <= n <= 10 for n, _ in pages):
        return error(400, "Send between one and ten different pages.")
    key = read_api_key(ROOT, OPENROUTER_KEY_NAMES) if vision_provider() == "openrouter" else None
    if groq_lock.locked():
        return error(429, "One reading request is already running. Please wait.")
    # mode "map": the second, whole-bill pass for a bill whose pages did not link up (bill_map). A separate request so
    # each one stays within the host's time limit. No result means the AI's reading did not add up; nothing changes.
    if data.get("mode") == "map":
        if not key:
            return JSONResponse({"plan": None}, headers={"cache-control": "no-store"})
        async with groq_lock:
            result = await run_in_threadpool(lambda: map_pages(pages, decimal_separator=data["decimalSeparator"],
                                                               currency=data["currency"], api_key=key, cache_dir=CACHE_DIR))
        return JSONResponse({"plan": result}, headers={"cache-control": "no-store"})
    async with groq_lock:
        result = await run_in_threadpool(lambda: link_pages(pages, decimal_separator=data["decimalSeparator"],
                                                            currency=data["currency"], api_key=key, cache_dir=CACHE_DIR))
    return JSONResponse({"plan": result}, headers={"cache-control": "no-store"})


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("cache-control", "no-store")
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["referrer-policy"] = "no-referrer"
    return response


# The review page includes frontend/vendor: pinned PDF.js/Tesseract.js copies (scripts/vendor_assets.py).
# Mounted last so /api and /docs win.
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="page")


if __name__ == "__main__":
    import uvicorn

    print("BillShield (FastAPI): http://127.0.0.1:4173   API docs: http://127.0.0.1:4173/docs   Stop with Ctrl+C")
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("BILLSHIELD_PORT", "4173")))
