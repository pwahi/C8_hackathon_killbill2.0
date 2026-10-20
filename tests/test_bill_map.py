"""Whole-bill map (owner 2026-10-20): the AI says what every line is; Python checks it. No network."""

import json
import unittest
from unittest.mock import patch

from billshield_core.groq_vision import parse_response
from billshield_core.whole_bill import map_pages


def reply(data):
    return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(data)}}]}


def page(rows):
    return parse_response(reply({"lines": [{"id": i, "role": role, "description": label, "raw_amount": amount,
                                             "page": 1, "confidence": 0.9} for i, role, label, amount in rows]}))


# A made-up three-page bill shaped like a long telecom bill: overview, itemised page, call records + history.
PAGES = [
    (1, page([("a", "charge", "Plan", "30.00"), ("b", "charge", "Usage abroad", "12.00"), ("t", "total", "Total due", "42.00")])),
    (2, page([("a", "charge", "Monthly plan", "30.00"), ("b", "charge", "Roaming usage", "12.00"),
              ("t", "total", "This period's charges", "42.00"), ("p", "payment", "Payment received", "-39.00")])),
    (3, page([("c1", "charge", "Call abroad", "5.00"), ("c2", "charge", "Call abroad", "7.00"),
              ("h", "charge", "Last month's bill", "39.00"), ("z", "subtotal", "Text messages", "0.00")])),
]
GOOD = {"amount_due": "p2-t", "counted": ["p2-a", "p2-b"],
        "others": [{"id": "p1-a", "kind": "copy", "of": "p2-a"}, {"id": "p1-b", "kind": "copy", "of": "p2-b"},
                   {"id": "p1-t", "kind": "copy", "of": "p2-t"}, {"id": "p2-p", "kind": "payment", "of": None},
                   {"id": "p3-c1", "kind": "detail", "of": "p2-b"}, {"id": "p3-c2", "kind": "detail", "of": "p2-b"},
                   {"id": "p3-h", "kind": "history", "of": None}, {"id": "p3-z", "kind": "empty", "of": None}],
        "summary": "A phone bill for one month: the plan and usage abroad."}


def run(answer):
    with patch("billshield_core.whole_bill.post_chat", return_value=reply(answer)):
        return map_pages(PAGES, decimal_separator=".", currency="EUR", api_key="k")


class BillMap(unittest.TestCase):
    def test_a_checked_map_counts_each_charge_once_and_folds_the_rest(self):
        plan = run(GOOD)
        lines = plan["lines"]
        self.assertEqual((plan["status"], plan["linkedBy"]), ("ok", "map"))
        self.assertEqual({i for i, e in lines.items() if e["role"] != ""}, {"p2-a", "p2-b", "p2-t"})
        self.assertTrue(all(lines[i]["autoVerified"] for i in ("p2-a", "p2-b", "p2-t")))
        self.assertIn("✓ same amount", lines["p1-a"]["referenceText"])
        self.assertIn("✓ adds up to it", lines["p3-c1"]["referenceText"])
        self.assertIn("payment", lines["p2-p"]["referenceText"])
        self.assertIn("earlier bill", lines["p3-h"]["referenceText"])
        self.assertEqual(plan["summary"], GOOD["summary"])

    def test_nothing_is_used_when_the_counted_lines_do_not_add_up(self):
        self.assertIsNone(run({**GOOD, "counted": ["p2-a"]}))
        self.assertIsNone(run({**GOOD, "counted": ["p2-a", "p2-b", "p3-h"]}))  # an earlier bill counted again
        self.assertIsNone(run({**GOOD, "counted": ["p2-a", "ghost"]}))

    def test_a_wrong_copy_detail_or_empty_claim_is_shown_as_such(self):
        others = [{"id": "p1-a", "kind": "copy", "of": "p2-b"}, {"id": "p3-c1", "kind": "detail", "of": "p2-a"},
                  {"id": "p3-h", "kind": "empty", "of": None}]
        lines = run({**GOOD, "others": others})["lines"]
        self.assertIn("✗", lines["p1-a"]["referenceText"])
        self.assertIn("✗", lines["p3-c1"]["referenceText"])
        self.assertIn("has an amount", lines["p3-h"]["referenceText"])
        self.assertFalse(lines["p1-a"]["verified"])
        self.assertIn("Not placed", lines["p1-b"]["referenceText"])  # a line the AI did not classify

    def test_a_payment_role_from_the_reader_is_no_charge(self):
        self.assertEqual(PAGES[1][1].lines[3].role, "other")


if __name__ == "__main__":
    unittest.main()
