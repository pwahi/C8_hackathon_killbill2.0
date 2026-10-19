"""FastAPI app: same operations and guards as the local helper, no network (provider calls are stubbed)."""

import base64
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

APP_ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("billshield_api", APP_ROOT / "app.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

ORIGIN = {"origin": "http://127.0.0.1:4173"}
CONFIRMED = APP_ROOT / "tests" / "fixtures" / "confirmed"


def fixture(name: str) -> dict:
    data = json.loads((CONFIRMED / f"{name}.confirmed.json").read_text(encoding="utf-8"))
    data["messageType"] = "automatic"
    for line in data["lines"]:
        line["questioned"] = False
    return data


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(api.app)

    def test_health_reports_no_secret(self):
        body = self.client.get("/api/health").json()
        self.assertEqual(body["status"], "ok")
        self.assertIsInstance(body["groqKeyConfigured"], bool)
        self.assertNotIn("gsk_", json.dumps(body))

    def test_analyze_returns_python_result_and_draft(self):
        response = self.client.post("/api/analyze", json=fixture("BS-002"), headers=ORIGIN)
        self.assertEqual(response.status_code, 200)
        result = response.json()["result"]
        self.assertEqual(result["minor"]["calculatedTotal"], 137880)
        self.assertEqual(result["verdict"], "unexplained")
        self.assertTrue(result["draft"]["supportingLineIds"])

    def test_invalid_review_is_a_clear_422(self):
        data = fixture("BS-002")
        next(line for line in data["lines"] if line["id"] == "discount")["rawAmount"] = "200.00"
        response = self.client.post("/api/analyze", json=data, headers=ORIGIN)
        self.assertEqual(response.status_code, 422)
        self.assertIn("negative amount", response.json()["error"])

    def test_requests_from_other_sites_or_not_json_are_refused(self):
        self.assertEqual(self.client.post("/api/analyze", json=fixture("BS-002")).status_code, 403)
        self.assertEqual(self.client.post("/api/analyze", json=fixture("BS-002"), headers={"origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.client.post("/api/analyze", content="x", headers={**ORIGIN, "content-type": "text/plain"}).status_code, 415)
        big = {"pad": "x" * 210_000}
        self.assertEqual(self.client.post("/api/analyze", json=big, headers=ORIGIN).status_code, 413)

    def test_explain_without_difference_never_calls_groq(self):
        with patch("billshield_core.service.explain_gap") as provider:
            body = self.client.post("/api/explain", json=fixture("BS-003"), headers=ORIGIN).json()
        provider.assert_not_called()
        self.assertIsNone(body["explanation"])
        self.assertEqual(body["result"]["verdict"], "checks_passed")

    def test_explain_with_difference_uses_validated_suggestion(self):
        suggestion = {"model": "openai/gpt-oss-20b", "likelyCauses": [], "unexplained": None,
                      "question": "Could you explain what the fees cover?", "evidenceToRequest": [], "line_ids": ["udf"]}
        with patch("billshield_core.service.explain_gap", return_value=suggestion):
            body = self.client.post("/api/explain", json=fixture("BS-004"), headers=ORIGIN).json()
        self.assertEqual(body["result"]["questionedBy"], "ai")
        self.assertTrue(body["result"]["draft"]["text"].endswith(suggestion["question"]))

    def test_provider_failure_keeps_python_result(self):
        with patch("billshield_core.service.explain_gap", side_effect=RuntimeError("Groq request failed with HTTP 429.")):
            body = self.client.post("/api/explain", json=fixture("BS-004"), headers=ORIGIN).json()
        self.assertIn("429", body["explanationError"])
        self.assertEqual(body["result"]["minor"]["difference"], 300000)

    def test_groq_extract_requires_redaction_and_valid_image(self):
        self.assertEqual(self.client.post("/api/groq-extract", json={"imageBase64": "", "mime": "image/png"}, headers=ORIGIN).status_code, 400)
        self.assertEqual(self.client.post("/api/groq-extract", json={"imageBase64": "@@@", "mime": "image/png", "redacted": True}, headers=ORIGIN).status_code, 400)

    def test_groq_extract_cut_off_answer_has_clear_message(self):
        png = base64.b64encode(b"\x89PNG\r\n\x1a\nexample").decode()
        with patch.object(api, "extract_crop", side_effect=api.IncompleteOutput("cut")):
            response = self.client.post("/api/groq-extract", json={"imageBase64": png, "mime": "image/png", "redacted": True}, headers=ORIGIN)
        self.assertEqual(response.status_code, 422)
        self.assertIn("smaller part", response.json()["error"])

    def test_page_is_served_but_secrets_are_not(self):
        page = self.client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn("BillShield", page.text)
        for path in ("/.env.local", "/../.env.local", "/%2e%2e/.env.local", "/../private/groq-cache"):
            self.assertIn(self.client.get(path).status_code, (404, 400), path)

    def test_access_code_is_required_when_configured(self):
        with patch.object(api, "ACCESS_CODE", "secret-word"):
            self.assertEqual(self.client.post("/api/analyze", json=fixture("BS-002"), headers=ORIGIN).status_code, 401)
            wrong = {**ORIGIN, "x-billshield-access": "guess"}
            self.assertEqual(self.client.post("/api/analyze", json=fixture("BS-002"), headers=wrong).status_code, 401)
            right = {**ORIGIN, "x-billshield-access": "secret-word"}
            self.assertEqual(self.client.post("/api/analyze", json=fixture("BS-002"), headers=right).status_code, 200)
            self.assertTrue(self.client.get("/api/health").json()["accessCodeRequired"])

    def test_hosted_server_without_code_refuses_work(self):
        with patch.object(api, "HOSTED", True), patch.object(api, "ACCESS_CODE", ""):
            self.assertEqual(self.client.post("/api/analyze", json=fixture("BS-002"), headers=ORIGIN).status_code, 503)

    def test_reading_tools_are_served_from_the_pinned_copies(self):
        for path in ("/node_modules/pdfjs-dist/build/pdf.mjs", "/node_modules/pdfjs-dist/build/pdf.worker.mjs",
                     "/node_modules/tesseract.js/dist/tesseract.esm.min.js", "/node_modules/tesseract.js/dist/worker.min.js",
                     "/node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
                     "/node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"):
            self.assertEqual(self.client.get(path).status_code, 200, path)
        self.assertTrue((APP_ROOT / "frontend" / "vendor" / "pdfjs-dist" / "LICENSE").is_file())

    def test_api_docs_are_available(self):
        self.assertEqual(self.client.get("/docs").status_code, 200)
        paths = self.client.get("/openapi.json").json()["paths"]
        self.assertTrue({"/api/analyze", "/api/explain", "/api/groq-extract", "/api/health"} <= set(paths))


if __name__ == "__main__":
    unittest.main()
