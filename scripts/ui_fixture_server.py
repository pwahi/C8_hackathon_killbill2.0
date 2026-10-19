"""Offline UI acceptance server. Never used by the deployed app; no model or database calls.

Run from app root: .venv/Scripts/python.exe scripts/ui_fixture_server.py
Select fixtures using GET /_test/case/BS-001 (through BS-004). Fixture vision is simulated;
confirmation, roles, arithmetic, re-checks and draft generation use the real application.
"""
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["BILLSHIELD_ALLOWED_ORIGINS"] = "http://127.0.0.1:4180"
import app as api
from billshield_core.extraction import ExtractionOutput

case = "BS-001"
extraction_view = "all"
api.ACCESS_CODE = ""
api.store.configured = lambda: False
api.read_api_key = lambda *_: "offline-fixture-only"


def fixture():
    return json.loads((ROOT / "tests" / "fixtures" / "confirmed" / f"{case}.confirmed.json").read_text(encoding="utf-8"))


def fake_extract(*args):
    data = fixture()
    if extraction_view == "charges":
        data["lines"] = [line for line in data["lines"] if line["role"] in {"charge", "discount", "adjustment"}]
    elif extraction_view == "total":
        data["lines"] = [line for line in data["lines"] if line["role"] == "total"]
    return ExtractionOutput.model_validate({"currency": data["currency"], "lines": [
        {"id": line["id"], "description": line["description"], "raw_amount": line["rawAmount"],
         "currency": line["currency"], "page": 1, "confidence": 1,
         "role": line["role"], "group": line.get("group"),
         "breakdown": ({"quantity": line["breakdown"].get("quantity"),
                        "unit_price": line["breakdown"].get("unitPrice"),
                        "discount": line["breakdown"].get("discount"),
                        "taxable_value": line["breakdown"].get("taxableValue"),
                        "taxes": line["breakdown"].get("taxes", [])} if line.get("breakdown") else None)}
        for line in data["lines"]]})


api.extract_crop = fake_extract
api.explain_review = lambda payload, *_: {"result": api.analyze_confirmed_review(payload), "explanation": None, "skipped": "Offline UI test: no AI request."}


async def select_case(name: str, view: str = "all"):
    global case, extraction_view
    if name not in {"BS-001", "BS-002", "BS-003", "BS-004"}:
        return api.error(404, "Unknown test fixture")
    case = name
    extraction_view = view if view in {"all", "charges", "total"} else "all"
    data = fixture()
    return {"case": case, "expectedAmount": data["expectedAmount"], "currency": data["currency"], "decimalSeparator": data["decimalSeparator"], "earlierPeriodGroup": data.get("earlierPeriodGroup"), "expectedResult": api.analyze_confirmed_review(data)}


# Insert ahead of the existing static mount. No test routes are added to production app.py.
from starlette.routing import Route
from starlette.responses import JSONResponse


async def case_route(request):
    return JSONResponse(await select_case(request.path_params["name"], request.query_params.get("view", "all")))


api.app.router.routes.insert(0, Route("/_test/case/{name}", case_route))

if __name__ == "__main__":
    import uvicorn
    print("OFFLINE UI TEST SERVER http://127.0.0.1:4180 — models and saving are stubbed")
    uvicorn.run(api.app, host="127.0.0.1", port=4180)
