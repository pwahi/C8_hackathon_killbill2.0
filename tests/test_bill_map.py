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


# Shaped like the owner's electricity bill (2026-10-20): the subsidy is printed without a minus sign, and
# "Bill after subsidy" is a running total of everything above it.
ELECTRICITY = [(1, parse_response(reply({"lines": [
    {"id": i, "role": role, "description": label, "raw_amount": amount, "page": 1, "confidence": 0.9}
    for i, role, label, amount in [
        ("c1", "charge", "Energy charge", "1875.25"), ("c2", "charge", "Fixed charge", "20.00"),
        ("c3", "charge", "Other charges", "261.74"), ("s1", "subtotal", "Bill amount", "2156.99"),
        ("d", "discount", "Government subsidy", "184.50"), ("a", "adjustment", "Loss/gain adjustment", "-0.49"),
        ("s2", "subtotal", "Bill after subsidy", "1972.00"), ("ar", "charge", "Arrears", "0.50"),
        ("t", "total", "Net bill", "1972.50")]],
    "structure": {"sections": [{"id": "bill", "label": "Bill charges", "subtotal_line_id": "s1"},
                               {"id": "after", "label": "After subsidy", "subtotal_line_id": "s2"}],
                  "rows": [{"line_id": x, "section_id": "bill"} for x in ("c1", "c2", "c3")]
                  + [{"line_id": "d", "section_id": "after"}, {"line_id": "a", "section_id": "after"},
                     {"line_id": "ar", "section_id": None}]}})))]


class DeductionWithoutMinus(unittest.TestCase):
    def test_the_whole_bill_pass_counts_it_as_a_deduction_when_the_total_then_adds_up(self):
        answer = {"amount_due": "p1-t", "counted": ["p1-c1", "p1-c2", "p1-c3", "p1-d", "p1-a", "p1-ar"],
                  "others": [{"id": "p1-s1", "kind": "info", "of": None}, {"id": "p1-s2", "kind": "info", "of": None}],
                  "summary": "An electricity bill with a government subsidy."}
        with patch("billshield_core.whole_bill.post_chat", return_value=reply(answer)):
            plan = map_pages(ELECTRICITY, decimal_separator=".", currency="INR", api_key="k")
        self.assertEqual(plan["status"], "ok")
        self.assertEqual(plan["lines"]["p1-d"]["signedRaw"], "-184.50")
        self.assertEqual(plan["lines"]["p1-d"]["role"], "discount")
        self.assertNotIn("signedRaw", plan["lines"]["p1-c1"])

    def test_a_discount_printed_without_a_minus_is_not_flipped_when_the_totals_do_not_confirm_it(self):
        answer = {"amount_due": "p1-t", "counted": ["p1-c1", "p1-c2", "p1-d"], "others": [], "summary": "x"}
        with patch("billshield_core.whole_bill.post_chat", return_value=reply(answer)):
            self.assertIsNone(map_pages(ELECTRICITY, decimal_separator=".", currency="INR", api_key="k"))

    def test_linking_keeps_the_reading_in_which_more_printed_figures_add_up(self):
        from billshield_core.whole_bill import link_pages
        plan = link_pages(ELECTRICITY, decimal_separator=".", currency="INR", api_key=None)
        bill = plan["tree"][0]
        self.assertTrue(bill["matches"])  # 2156.99 - 184.50 - 0.49 + 0.50 = 1972.50 only as a deduction
        self.assertNotIn("signedRaw", plan["lines"]["p1-d"])  # its own running-total section still does not add up
