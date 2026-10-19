"""Synthetic regressions for owner-reported summary/detail and section problems."""
import unittest

from backend.billshield_core.review import ReviewError, analyze_confirmed_review
from backend.billshield_core.gap_llm import build_package


def example():
    def row(id, role, label, amount, page, group=None):
        return dict(id=id, role=role, description=label, rawAmount=amount,
                    currency="EUR", extractor="manual", group=group,
                    source=dict(page=page, precision="page"))
    return dict(schemaVersion=2, currency="EUR", decimalSeparator=".", expectedAmount="33.75",
                lines=[row("summary", "charge", "Maandelijkse Kosten", "31.25", 1),
                       row("summary_extra", "charge", "Extras en Opties", "2.50", 1),
                       row("total", "total", "Total", "33.75", 1),
                       row("detail", "charge", "Subscription", "35.44", 2, "Maandelijkse kosten"),
                       row("discount", "discount", "Discount", "-4.19", 2, "Maandelijkse kosten"),
                       row("subtotal", "subtotal", "Subtotal", "31.25", 2, "Maandelijkse kosten"),
                       row("extra", "charge", "Bundle", "2.50", 2, "Extras en opties"),
                       row("subtotal_extra", "subtotal", "Subtotal", "2.50", 2, "Extras en opties")])


class SectionTests(unittest.TestCase):
    def test_summary_and_breakdown_count_once_and_keep_reference(self):
        result = analyze_confirmed_review(example())
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["minor"]["calculatedTotal"], 3375)
        self.assertTrue(all(group["matches"] for group in result["groups"]))
        summary = next(line for line in result["lines"] if line["id"] == "summary")
        self.assertEqual(summary["summaryOf"], "subtotal")
        self.assertFalse(summary["countedInTotal"])
        self.assertNotIn("summary", result["draft"]["supportingLineIds"])

    def test_missing_detail_cannot_be_hidden_by_matching_summary(self):
        data = example()
        data["lines"][3]["rawAmount"] = "20.54"
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "needs_recheck")
        self.assertIsNone(result["draft"])

    def test_same_amount_different_label_is_not_silently_removed(self):
        data = example()
        data["lines"][0]["description"] = "Unrelated charge"
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "needs_recheck")
        self.assertTrue(result["lines"][0]["countedInTotal"])

    def test_disagreeing_summary_requires_review_not_silent_exclusion(self):
        data = example()
        data["lines"][0]["rawAmount"] = "30.00"
        with self.assertRaisesRegex(ReviewError, "summary and subtotal.*different amounts"):
            analyze_confirmed_review(data)

    def test_no_members_has_actionable_section_picker_instruction(self):
        data = example()
        for line in data["lines"]:
            if line["role"] in {"charge", "discount"}:
                line["group"] = None
        with self.assertRaisesRegex(ReviewError, "open its Printed subtotal row"):
            analyze_confirmed_review(data)

    def test_summary_not_offered_to_explanation_model(self):
        result = analyze_confirmed_review(example())
        _, refs = build_package(result)
        self.assertNotIn("summary", refs.values())
        self.assertNotIn("summary_extra", refs.values())

    def test_multiple_matching_summaries_are_not_auto_excluded(self):
        data = example()
        data["lines"].append({**data["lines"][0], "id": "another_summary"})
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "needs_recheck")
        self.assertTrue(next(line for line in result["lines"] if line["id"] == "summary")["countedInTotal"])
