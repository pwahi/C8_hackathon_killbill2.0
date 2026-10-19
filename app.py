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
from billshield_core.groq_http import read_api_key  # noqa: E402
from billshield_core.groq_vision import MODEL as VISION_MODEL, IncompleteOutput, extract_crop  # noqa: E402
from billshield_core.review import ReviewError, analyze_confirmed_review  # noqa: E402
from billshield_core.service import explain_review  # noqa: E402

VERSION = "0.2.0"
HOSTED = bool(os.environ.get("VERCEL")) or os.environ.get("BILLSHIELD_ENV") == "production"
LOCAL_ORIGINS = "http://127.0.0.1:4173,http://localhost:4173"
ALLOWED_ORIGINS = {origin.strip() for origin in os.environ.get("BILLSHIELD_ALLOWED_ORIGINS", LOCAL_ORIGINS).split(",") if origin.strip()}
# On Vercel the page's own addresses are allowed automatically.
for variable in ("VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"):
    if os.environ.get(variable):
        ALLOWED_ORIGINS.add(f"https://{os.environ[variable]}")
# Testers must enter this code before anything can use the server's Groq key. Required when hosted.
ACCESS_CODE = os.environ.get("BILLSHIELD_ACCESS_CODE", "")
# Provider responses are cached only on a developer machine; never on a hosted server.
CACHE_DIR = None if HOSTED else ROOT / "private" / "groq-cache"
# Vercel functions accept request bodies up to 4.5 MB.
CROP_LIMIT = 4_400_000

app = FastAPI(
    title="BillShield API",
    version=VERSION,
    description="Confirmed bill lines in, code-checked calculations and a required editable draft out. "
    "Python owns every number; models only suggest. Nothing is sent to a provider by this API on its own.",
)
groq_lock = asyncio.Lock()  # one provider request at a time per server process; no automatic retries


def error(status: int, message: str) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status, headers={"cache-control": "no-store"})


async def read_json(request: Request, limit: int) -> dict | JSONResponse:
    """Shared guard: allowed page origin, JSON content type, bounded body."""
    if request.headers.get("origin") not in ALLOWED_ORIGINS:
        return error(403, "Open this review from the BillShield page.")
    if HOSTED and not ACCESS_CODE:
        return error(503, "This test server has no access code configured yet.")
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


@app.get("/api/health")
def health() -> dict:
    """Readiness without secret values."""
    return {"status": "ok", "version": VERSION, "groqKeyConfigured": bool(read_api_key(ROOT).strip()),
            "accessCodeRequired": bool(ACCESS_CODE)}


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
    return JSONResponse({"result": result}, headers={"cache-control": "no-store"})


@app.post("/api/explain")
async def explain(request: Request):
    """Python first; only if there is a difference, a validated GPT-OSS suggestion is added."""
    data = await read_json(request, 200_000)
    if isinstance(data, JSONResponse):
        return data
    if groq_lock.locked():
        return error(429, "One Groq request is already running. Please wait.")
    async with groq_lock:
        try:
            output = await run_in_threadpool(explain_review, data, read_api_key(ROOT), CACHE_DIR)
        except ReviewError as problem:
            return error(422, str(problem))
    return JSONResponse(output, headers={"cache-control": "no-store"})


@app.post("/api/groq-extract")
async def groq_extract(request: Request):
    """One explicitly approved, redacted PNG/JPEG crop -> unconfirmed candidate lines from Groq vision."""
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
        return error(429, "One Groq request is already running. Please wait.")
    async with groq_lock:
        try:
            output = await run_in_threadpool(extract_crop, image, str(data.get("mime", "")), read_api_key(ROOT), CACHE_DIR)
        except IncompleteOutput:
            return error(422, "Groq's answer was cut off because this area has too many lines. Select a smaller part of the "
                              "table (for example the top half, then the bottom half) and send each part.")
        except RuntimeError as problem:  # provider/network, already safe to show
            return error(502, str(problem))
        except ValueError:
            return error(422, "Unable to validate this crop or the model response. Try a smaller, clearer charge table.")
    return JSONResponse({"output": output.model_dump(), "model": VISION_MODEL}, headers={"cache-control": "no-store"})


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("cache-control", "no-store")
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["referrer-policy"] = "no-referrer"
    return response


# Browser reading tools (PDF.js, Tesseract.js) at the paths the page uses. Hosting serves the pinned copies
# kept in frontend/vendor (scripts/vendor_assets.py); a developer machine may fall back to node_modules.
TOOLS = ROOT / "frontend" / "vendor"
app.mount("/node_modules", StaticFiles(directory=TOOLS if TOOLS.is_dir() else ROOT / "frontend" / "node_modules"), name="tools")
# The review page. Mounted last so /api, /docs and the tools win.
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="page")


if __name__ == "__main__":
    import uvicorn

    print("BillShield (FastAPI): http://127.0.0.1:4173   API docs: http://127.0.0.1:4173/docs   Stop with Ctrl+C")
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("BILLSHIELD_PORT", "4173")))
