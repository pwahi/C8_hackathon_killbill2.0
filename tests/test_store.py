"""Saving reviews (D-033): word counting, private-detail blanking, saved record shape, API behaviour. No network."""

import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.billshield_core.edits import blank_private_details, words_changed
from backend.billshield_core.review import analyze_confirmed_review
from backend.billshield_core import store as backend_store

APP_ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("billshield_api_store", APP_ROOT / "app.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
ORIGIN = {"origin": "http://127.0.0.1:4173"}
CONFIRMED = APP_ROOT / "tests" / "fixtures" / "confirmed"
SUPABASE = {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test"}


def fixture(name: str) -> dict:
    data = json.loads((CONFIRMED / f"{name}.confirmed.json").read_text(encoding="utf-8"))
    data["messageType"] = "automatic"
    return data


class EditTests(unittest.TestCase):
    def test_word_changes_ignore_case_and_punctuation(self):
        draft = "Hello, I expected EUR 1299.00. Please explain."
        self.assertEqual(words_changed(draft, "hello I expected EUR 1299.00 please explain"), 0)
        self.assertEqual(words_changed(draft, "Hi, I expected EUR 1299.00. Please explain."), 1)
        self.assertEqual(words_changed(draft, "Hello, I expected EUR 1299.00. Please explain quickly. Thanks, Ana"), 3)
        self.assertEqual(words_changed(draft, ""), 7)

    def test_private_details_are_blanked_but_amounts_kept(self):
        text = "Invoice 123456789, call +31 6 1234 5678 or mail ana@example.com, IBAN NL91ABNA0417164300. I paid EUR 1378.80."
        blanked = blank_private_details(text)
        for gone in ("123456789", "1234 5678", "ana@example.com", "NL91ABNA0417164300"):
            self.assertNotIn(gone, blanked)
        self.assertIn("EUR 1378.80", blanked)


class RecordTests(unittest.TestCase):
    def test_saved_record_uses_python_amounts_and_no_document_data(self):
        payload = fixture("BS-004")
        result = analyze_confirmed_review(payload)
        record = backend_store.review_record(payload, result, None)
        self.assertEqual(record["expected_minor"], 1943400)
        self.assertEqual(record["finding"]["verdict"], "unexplained")
        self.assertEqual({line["client_line_id"] for line in record["lines"]}, {line["id"] for line in payload["lines"]})
        self.assertEqual(next(l for l in record["lines"] if l["client_line_id"] == "udf")["amount_minor"], 231200)
        self.assertTrue(record["message"]["line_ids"])
        text = json.dumps(record)
        for forbidden in ("imageBase64", "tokens", "context"):
            self.assertNotIn(forbidden, text)


class ApiStoreTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(api.app)

    def test_without_database_nothing_is_saved_and_results_still_work(self):
        with patch.dict(os.environ, {"SUPABASE_URL": "", "SUPABASE_PUBLISHABLE_KEY": ""}):
            body = self.client.post("/api/analyze", json=fixture("BS-003"), headers=ORIGIN).json()
            self.assertIsNone(body["saved"])
            self.assertEqual(self.client.post("/api/session", json={}, headers=ORIGIN).status_code, 503)
            self.assertFalse(self.client.get("/api/health").json()["databaseConfigured"])

    def test_a_secret_key_disables_saving(self):
        with patch.dict(os.environ, {**SUPABASE, "SUPABASE_PUBLISHABLE_KEY": "sb_secret_abc"}):
            self.assertFalse(backend_store.configured())
            with self.assertRaises(backend_store.StoreError):
                backend_store._call("GET", "/rest/v1/bills")

    def test_completed_review_is_saved_with_the_users_token(self):
        calls = []
        def fake(method, path, body=None, token=None, prefer=None):
            calls.append((method, path, token))
            return {"bill_id": "b1", "finding_id": "f1", "message_id": "m1"}
        with patch.dict(os.environ, SUPABASE), patch.object(backend_store, "_call", side_effect=fake), \
             patch.object(api.store, "_call", side_effect=fake):
            body = self.client.post("/api/analyze", json=fixture("BS-003"),
                                    headers={**ORIGIN, "authorization": "Bearer user-token"}).json()
        self.assertEqual(body["saved"], {"billId": "b1", "messageId": "m1"})
        self.assertEqual(calls, [("POST", "/rest/v1/rpc/save_review", "user-token")])

    def test_difference_is_saved_once_by_explain_not_by_analyze(self):
        with patch.dict(os.environ, SUPABASE), patch.object(api.store, "save_review", return_value={"billId": "b", "messageId": "m"}) as save:
            analyzed = self.client.post("/api/analyze", json=fixture("BS-004"), headers={**ORIGIN, "authorization": "Bearer t"}).json()
            self.assertIsNone(analyzed["saved"])
            with patch("billshield_core.service.explain_gap", side_effect=RuntimeError("Groq request failed with HTTP 429.")):
                explained = self.client.post("/api/explain", json=fixture("BS-004"), headers={**ORIGIN, "authorization": "Bearer t"}).json()
        self.assertEqual(save.call_count, 1)
        self.assertEqual(explained["saved"]["messageId"], "m")

    def test_review_needing_recheck_is_not_saved(self):
        data = fixture("BS-002")
        next(line for line in data["lines"] if line["id"] == "order_total")["rawAmount"] = "1,388.80"
        with patch.dict(os.environ, SUPABASE), patch.object(api.store, "save_review") as save:
            body = self.client.post("/api/analyze", json=data, headers={**ORIGIN, "authorization": "Bearer t"}).json()
        save.assert_not_called()
        self.assertEqual(body["result"]["status"], "needs_recheck")

    def test_sent_event_counts_words_and_stores_blanked_text(self):
        posted = {}
        def fake(method, path, body=None, token=None, prefer=None):
            if method == "GET":
                return [{"draft_text": "Please explain the fee."}]
            posted.update(body)
            return None
        with patch.dict(os.environ, SUPABASE), patch.object(api.store, "_call", side_effect=fake):
            response = self.client.post("/api/messages/m1/events", json={"action": "sent", "finalText": "Please explain the fee. Account 12345678"},
                                        headers={**ORIGIN, "authorization": "Bearer t"})
        self.assertEqual(response.json(), {"action": "sent", "wordsChanged": 2})
        self.assertEqual(posted["words_changed"], 2)
        self.assertNotIn("12345678", posted["final_text"])

    def test_events_need_a_session_and_a_known_action(self):
        self.assertEqual(self.client.post("/api/messages/m1/events", json={"action": "sent"}, headers=ORIGIN).status_code, 401)
        with patch.dict(os.environ, SUPABASE):
            response = self.client.post("/api/messages/m1/events", json={"action": "deleted"}, headers={**ORIGIN, "authorization": "Bearer t"})
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
