"""H1: the bill-structure verifier. Offline, no model calls; synthetic and sanitized data only."""

import json
import unittest
from pathlib import Path

from billshield_core.engine import calculate
from billshield_core.review import ConfirmedReview, build_case
from billshield_core.structure import BillStructure, verify_structure
from billshield_core.structure_flat import derive_structure

CONFIRMED = Path(__file__).parent / "fixtures" / "confirmed"


def structure(**parts) -> BillStructure:
    parts.setdefault("invoices", [{"id": "inv", "totalLineId": "total"}])
    return BillStructure.model_validate(parts)


def rows(*pairs):
    return [{"lineId": line, "parentId": parent} for line, parent in pairs]


# A small nested bill: invoice -> plan section -> two month sections -> rows; one standalone fee.
LINES = {
    "a1": ("charge", 1000), "a2": ("discount", -200), "b1": ("charge", 500),
    "fee": ("charge", 150),
    "sub_a": ("subtotal", 800), "sub_b": ("subtotal", 500), "sub_plan": ("subtotal", 1300),
    "total": ("total", 1450),
}
NESTED = dict(
    sections=[
        {"id": "plan", "parentId": "inv", "label": "Plan", "subtotalLineId": "sub_plan"},
        {"id": "m1", "parentId": "plan", "label": "Month one", "period": "January", "subtotalLineId": "sub_a"},
        {"id": "m2", "parentId": "plan", "label": "Month two", "subtotalLineId": "sub_b"},
    ],
    rows=rows(("a1", "m1"), ("a2", "m1"), ("b1", "m2"), ("fee", "inv")),
)


def kinds(check):
    return {problem.kind for problem in check.problems}


class Verified(unittest.TestCase):
    def test_nested_structure_is_ok_and_counts_each_row_once(self):
        check = verify_structure(structure(**NESTED), LINES)
        self.assertEqual(check.status, "ok")
        self.assertEqual(check.nodes["m1"].computed_minor, 800)
        self.assertEqual(check.nodes["plan"].computed_minor, 1300)
        self.assertEqual(check.nodes["inv"].computed_minor, 1450)
        self.assertEqual(sorted(check.counted_line_ids), ["a1", "a2", "b1", "fee"])

    def test_flat_bill_needs_no_sections(self):
        lines = {"x": ("charge", 100), "y": ("charge", 50), "total": ("total", 150)}
        check = verify_structure(structure(rows=rows(("x", "inv"), ("y", "inv"))), lines)
        self.assertEqual(check.status, "ok")

    def test_identical_independent_charges_are_both_counted(self):
        lines = {"x": ("charge", 100), "y": ("charge", 100), "total": ("total", 200)}
        check = verify_structure(structure(rows=rows(("x", "inv"), ("y", "inv"))), lines)
        self.assertEqual((check.status, check.nodes["inv"].computed_minor), ("ok", 200))

    def test_summary_is_a_reference_not_an_extra_charge(self):
        lines = {"d1": ("charge", 300), "d2": ("charge", 200), "sub": ("subtotal", 500),
                 "summary": ("charge", 500), "total": ("total", 500)}
        check = verify_structure(structure(
            sections=[{"id": "s", "parentId": "inv", "label": "Calls", "subtotalLineId": "sub"}],
            rows=rows(("d1", "s"), ("d2", "s")),
            summaries=[{"lineId": "summary", "sectionId": "s"}]), lines)
        self.assertEqual((check.status, check.nodes["inv"].computed_minor), ("ok", 500))
        self.assertEqual(check.reference_line_ids, ("summary",))

    def test_amounts_are_never_changed(self):
        lines = dict(LINES)
        verify_structure(structure(**NESTED), lines)
        self.assertEqual(lines, LINES)


class Mismatches(unittest.TestCase):
    def test_missing_detail_row_is_a_mismatch_not_a_pass(self):
        # "missing page": one month's row never read; its subtotal still printed.
        broken = dict(NESTED, rows=rows(("a1", "m1"), ("b1", "m2"), ("fee", "inv")))
        lines = {**LINES, "a2": ("discount", -200)}
        check = verify_structure(structure(**broken), {**lines})
        self.assertEqual(check.status, "invalid")  # a2 is confirmed but unplaced
        lines.pop("a2")
        check = verify_structure(structure(**broken), lines)
        self.assertEqual(check.status, "mismatch")
        self.assertIn("subtotal_mismatch", kinds(check))

    def test_wrong_total_is_a_mismatch(self):
        check = verify_structure(structure(**NESTED), {**LINES, "total": ("total", 1500)})
        self.assertEqual(check.status, "mismatch")
        self.assertIn("total_mismatch", kinds(check))

    def test_summary_amount_must_agree_with_its_section(self):
        lines = {"d": ("charge", 500), "sub": ("subtotal", 500), "summary": ("charge", 400), "total": ("total", 500)}
        check = verify_structure(structure(
            sections=[{"id": "s", "parentId": "inv", "label": "Calls", "subtotalLineId": "sub"}],
            rows=rows(("d", "s")), summaries=[{"lineId": "summary", "sectionId": "s"}]), lines)
        self.assertEqual(check.status, "mismatch")
        self.assertIn("summary_mismatch", kinds(check))

    def test_no_printed_total_is_incomplete_never_ok(self):
        lines = {"x": ("charge", 100)}
        check = verify_structure(structure(invoices=[{"id": "inv"}], rows=rows(("x", "inv"))), lines)
        self.assertEqual(check.status, "incomplete")

    def test_sections_with_subtotals_can_stand_without_a_total(self):
        lines = {"x": ("charge", 100), "sub": ("subtotal", 100)}
        check = verify_structure(structure(
            invoices=[{"id": "inv"}],
            sections=[{"id": "s", "parentId": "inv", "label": "Only", "subtotalLineId": "sub"}],
            rows=rows(("x", "s"))), lines)
        self.assertEqual(check.status, "ok")


class InvalidStructures(unittest.TestCase):
    def check(self, expected_kind, lines=None, **parts):
        result = verify_structure(structure(**parts), lines or LINES)
        self.assertEqual(result.status, "invalid", result.problems)
        self.assertIn(expected_kind, kinds(result))
        self.assertEqual(result.nodes, {})  # no sums are shown for an invalid structure

    def test_cycle(self):
        self.check("cycle", sections=[
            {"id": "p", "parentId": "q", "label": "P"}, {"id": "q", "parentId": "p", "label": "Q"}],
            rows=rows(("a1", "p"), ("a2", "p"), ("b1", "p"), ("fee", "p")))

    def test_unknown_parent(self):
        self.check("unknown_parent", sections=[{"id": "p", "parentId": "nowhere", "label": "P"}],
                   rows=rows(("a1", "inv"), ("a2", "inv"), ("b1", "inv"), ("fee", "inv")))

    def test_nesting_deeper_than_three(self):
        sections = [{"id": f"s{i}", "parentId": "inv" if i == 1 else f"s{i - 1}", "label": f"S{i}"} for i in range(1, 5)]
        self.check("too_deep", sections=sections, rows=rows(("a1", "s4"), ("a2", "s4"), ("b1", "s4"), ("fee", "s4")))

    def test_row_placed_twice_would_double_count(self):
        self.check("placed_twice", sections=NESTED["sections"],
                   rows=rows(("a1", "m1"), ("a1", "m2"), ("a2", "m1"), ("b1", "m2"), ("fee", "inv")))

    def test_unplaced_line_is_not_silently_dropped(self):
        self.check("unplaced_line", sections=NESTED["sections"], rows=rows(("a1", "m1"), ("a2", "m1"), ("b1", "m2")))

    def test_unknown_line(self):
        self.check("unknown_line", sections=NESTED["sections"],
                   rows=rows(("a1", "m1"), ("a2", "m1"), ("b1", "m2"), ("fee", "inv"), ("ghost", "inv")))

    def test_subtotal_cannot_be_a_row(self):
        self.check("not_a_detail_row", sections=NESTED["sections"],
                   rows=rows(("a1", "m1"), ("a2", "m1"), ("b1", "m2"), ("fee", "inv"), ("sub_a", "m1")))

    def test_printed_figure_must_be_attached(self):
        lines = {**LINES, "orphan_sub": ("subtotal", 1)}
        self.check("unlinked_printed_figure", lines=lines, **NESTED)

    def test_printed_figure_cannot_check_two_parts(self):
        sections = [dict(s) for s in NESTED["sections"]]
        sections[2]["subtotalLineId"] = "sub_a"
        self.check("printed_used_twice", sections=sections, rows=NESTED["rows"])

    def test_summary_cannot_also_be_a_row(self):
        lines = {**LINES, "s1": ("charge", 800)}
        self.check("summary_also_row", lines=lines, sections=NESTED["sections"],
                   rows=rows(("a1", "m1"), ("a2", "m1"), ("b1", "m2"), ("fee", "inv"), ("s1", "inv")),
                   summaries=[{"lineId": "s1", "sectionId": "m1"}])

    def test_summary_needs_detail(self):
        lines = {"s1": ("charge", 5), "x": ("charge", 5), "total": ("total", 5)}
        self.check("summary_without_detail", lines=lines,
                   sections=[{"id": "empty", "parentId": "inv", "label": "Empty"}],
                   rows=rows(("x", "inv")), summaries=[{"lineId": "s1", "sectionId": "empty"}])

    def test_id_shared_with_a_line(self):
        self.check("id_clash", sections=[{"id": "a1", "parentId": "inv", "label": "Clash"}], rows=[])

    def test_empty_invoice(self):
        self.check("empty_invoice", lines={"total": ("total", 0)}, rows=[])


class RepeatedPrintedFigures(unittest.TestCase):
    """An overview page often prints the bill total (and a subtotal) again: a reference, not a second invoice."""

    LINES = {"x": ("charge", 300), "y": ("charge", 200), "total": ("total", 500),
             "total_again": ("total", 500), "sub_again": ("subtotal", 500)}

    def build(self, lines=None, **parts):
        parts.setdefault("rows", rows(("x", "inv"), ("y", "inv")))
        parts.setdefault("summaries", [{"lineId": "total_again", "sectionId": "inv"},
                                       {"lineId": "sub_again", "sectionId": "inv"}])
        return verify_structure(structure(**parts), lines or self.LINES)

    def test_a_total_printed_twice_is_a_reference_to_the_invoice(self):
        check = self.build()
        self.assertEqual(check.status, "ok", check.problems)
        self.assertEqual(sorted(check.reference_line_ids), ["sub_again", "total_again"])
        self.assertEqual(check.nodes["inv"].computed_minor, 500)

    def test_a_repeated_total_that_differs_is_a_mismatch(self):
        check = self.build({**self.LINES, "total_again": ("total", 450)})
        self.assertEqual(check.status, "mismatch")
        self.assertIn("summary_mismatch", kinds(check))

    def test_one_printed_figure_cannot_be_both_the_check_and_a_reference(self):
        check = self.build(summaries=[{"lineId": "total", "sectionId": "inv"}, {"lineId": "total_again", "sectionId": "inv"},
                                      {"lineId": "sub_again", "sectionId": "inv"}])
        self.assertEqual(check.status, "invalid")
        self.assertIn("printed_used_twice", kinds(check))


class TwoInvoices(unittest.TestCase):
    def test_invoices_are_checked_independently(self):
        lines = {"x": ("charge", 100), "t1": ("total", 100), "y": ("charge", 70), "t2": ("total", 70)}
        check = verify_structure(BillStructure.model_validate({
            "invoices": [{"id": "i1", "totalLineId": "t1"}, {"id": "i2", "totalLineId": "t2"}],
            "rows": rows(("x", "i1"), ("y", "i2"))}), lines)
        self.assertEqual(check.status, "ok")
        self.assertEqual((check.nodes["i1"].computed_minor, check.nodes["i2"].computed_minor), (100, 70))

    def test_an_error_in_one_invoice_is_not_hidden_by_the_other(self):
        lines = {"x": ("charge", 100), "t1": ("total", 100), "y": ("charge", 70), "t2": ("total", 99)}
        check = verify_structure(BillStructure.model_validate({
            "invoices": [{"id": "i1", "totalLineId": "t1"}, {"id": "i2", "totalLineId": "t2"}],
            "rows": rows(("x", "i1"), ("y", "i2"))}), lines)
        self.assertEqual(check.status, "mismatch")


class FlatBillsMatchTheCurrentEngine(unittest.TestCase):
    """The four sanitized cases, re-expressed as a structure, must give the engine's totals."""

    def test_fixtures(self):
        for path in sorted(CONFIRMED.glob("*.confirmed.json")):
            with self.subTest(path.name):
                review = ConfirmedReview.model_validate(json.loads(path.read_text(encoding="utf-8")))
                derived, lines = derive_structure(review)
                check = verify_structure(derived, lines)
                case, _ = build_case(review)
                outcome = calculate(case)
                self.assertNotEqual(check.status, "invalid", check.problems)
                self.assertEqual(check.nodes["inv-1"].computed_minor, outcome.calculated_total_minor)
                # The structure may be stricter than the flat engine, never looser: "ok" implies the engine passes.
                if check.status == "ok":
                    self.assertEqual(outcome.arithmetic_status, "checks_passed")
                if outcome.arithmetic_status == "checks_passed":
                    self.assertIn(check.status, {"ok", "incomplete"}, check.problems)

    def test_bundle_with_an_unchecked_standalone_row_is_incomplete(self):
        # BS-003 has a 212.00 row that no printed subtotal or total checks. The flat engine passes it;
        # the structure reports it as unchecked instead of calling it verified.
        review = ConfirmedReview.model_validate(json.loads((CONFIRMED / "BS-003.confirmed.json").read_text(encoding="utf-8")))
        derived, lines = derive_structure(review)
        check = verify_structure(derived, lines)
        self.assertEqual(check.status, "incomplete")
        self.assertEqual([problem.kind for problem in check.problems], ["no_printed_total"])


if __name__ == "__main__":
    unittest.main()
