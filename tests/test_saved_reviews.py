"""Reading saved checks back: summaries, the full read-only view and the route guards. Simulated database rows."""

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as server
from billshield_core import store

BILL = {
    "id": "e2b5e26d-b186-485e-949f-f5d7ceec5fa8", "currency": "EUR", "created_at": "2026-10-19T20:15:00+00:00",
    "line_items": [
        {"client_line_id": "l2", "description": "VAT", "role": "charge", "group_label": None, "raw_amount": "3.78",
         "amount_minor": 378, "source_page": 1, "corrected": False},
        {"client_line_id": "l1", "description": "Claude Pro subscription", "role": "charge", "group_label": None,
         "raw_amount": "18.00", "amount_minor": 1800, "source_page": 1, "corrected": False},
        {"client_line_id": "l3", "description": "Total", "role": "total", "group_label": None, "raw_amount": "21.78",
         "amount_minor": 2178, "source_page": 1, "corrected": False},
    ],
    "expectations": [{"expected_minor": 1800}],
    "findings": [{"verdict": "unexplained", "calculated_total_minor": 2178, "printed_total_minor": 2178,
                  "difference_minor": 378, "missing_info": ["Whether VAT was included in the price you were quoted."],
                  "messages": [{"id": "d3ffeb11-9acc-4f27-92da-9e481b7ac6da", "draft_text": "Hello, ...",
                                "message_events": [
                                    {"action": "copied", "final_text": None, "words_changed": None, "created_at": "2026-10-19T20:16:00+00:00"},
                                    {"action": "sent", "final_text": "Hello, sent text", "words_changed": 2, "created_at": "2026-10-19T20:17:00+00:00"}]}]}],
}


class Summary(unittest.TestCase):
    def test_a_row_names_the_bill_by_its_largest_charges_and_shows_python_amounts(self):
        row = store.review_summary(BILL)
        self.assertEqual(row["name"], "Claude Pro subscription · VAT")
        self.assertEqual((row["total"], row["difference"], row["messageStatus"]), ("EUR 21.78", "EUR 3.78", "sent"))

    def test_a_bill_without_a_finding_is_left_out(self):
        self.assertIsNone(store.review_summary({**BILL, "findings": []}))


class Detail(unittest.TestCase):
    def test_the_saved_check_comes_back_in_page_order_with_what_was_sent(self):
        review = store.review_detail(BILL)
        self.assertEqual([line["id"] for line in review["lines"]], ["l1", "l2", "l3"])
        self.assertEqual(review["expected"], "EUR 18.00")
        self.assertIn("EUR 3.78", review["verdictText"])
        self.assertEqual(review["message"]["sentText"], "Hello, sent text")
        self.assertEqual([event["action"] for event in review["message"]["events"]], ["copied", "sent"])

    def test_an_invalid_id_never_reaches_the_database(self):
        with patch.object(store, "_call") as call:
            with self.assertRaises(store.StoreError):
                store.open_review("token", "1 or 1=1")
        call.assert_not_called()


class Routes(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)
        self.headers = {"origin": "http://127.0.0.1:4173", "content-type": "application/json",
                        "x-billshield-access": server.ACCESS_CODE}

    def test_without_a_session_nothing_is_listed(self):
        answer = self.client.post("/api/reviews", json={}, headers=self.headers)
        self.assertEqual(answer.status_code, 401)

    def test_the_list_uses_the_browser_token(self):
        with patch.object(store, "_call", return_value=[BILL]) as call:
            answer = self.client.post("/api/reviews", json={}, headers={**self.headers, "authorization": "Bearer abc"})
        self.assertEqual(answer.json()["reviews"][0]["total"], "EUR 21.78")
        self.assertEqual(call.call_args.kwargs["token"], "abc")

    def test_another_browser_gets_not_found(self):
        with patch.object(store, "_call", return_value=[]):
            answer = self.client.post("/api/reviews/open", json={"billId": BILL["id"]},
                                      headers={**self.headers, "authorization": "Bearer other"})
        self.assertEqual(answer.status_code, 404)


if __name__ == "__main__":
    unittest.main()
