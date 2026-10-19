"""Confirmed browser review (schema 2) -> Python calculation and required draft (D-024/D-025)."""

import copy
import json
from pathlib import Path
import unittest

from backend.billshield_core.engine import analyze_case
from backend.billshield_core.fixtures import load_fixture
from backend.billshield_core.review import ReviewError, analyze_confirmed_review, parse_confirmed_amount


FIXTURES = Path(__file__).parent / "fixtures"
CONFIRMED = FIXTURES / "confirmed"


def payload(name: str) -> dict:
    return json.loads((CONFIRMED / f"{name}.confirmed.json").read_text(encoding="utf-8"))


def line_by_id(data: dict, line_id: str) -> dict:
    return next(line for line in data["lines"] if line["id"] == line_id)


class ConfirmedReplayTests(unittest.TestCase):
    def test_four_confirmed_payloads_match_golden_fixtures(self) -> None:
        paths = sorted(CONFIRMED.glob("BS-*.confirmed.json"))
        self.assertEqual(len(paths), 4)
        for path in paths:
            case_id = path.name.split(".")[0]
            with self.subTest(case=case_id):
                result = analyze_confirmed_review(json.loads(path.read_text(encoding="utf-8")))
                golden = analyze_case(load_fixture(FIXTURES / f"{case_id}.json"))
                self.assertEqual(result["minor"]["calculatedTotal"], golden.calculated_total_minor)
                self.assertEqual(result["minor"]["difference"], golden.difference_minor)
                self.assertEqual(result["verdict"], golden.verdict)
                self.assertEqual(result["comparisonStatus"], golden.comparison_status)
                self.assertEqual(result["arithmeticStatus"], "checks_passed")
                self.assertEqual(result["draft"]["text"], golden.draft.text)
                ids = {line["id"] for line in result["lines"]}
                self.assertTrue(result["draft"]["supportingLineIds"])
                self.assertLessEqual(set(result["draft"]["supportingLineIds"]), ids)

    def test_subtotals_are_checked_not_added(self) -> None:
        result = analyze_confirmed_review(payload("BS-003"))
        self.assertEqual(result["minor"]["calculatedTotal"], 2182800)
        self.assertEqual([group["matches"] for group in result["groups"]], [True, True, True, True])
        subtotal_ids = {line["id"] for line in result["lines"] if line["role"] == "subtotal"}
        self.assertFalse(subtotal_ids & set(result["draft"]["supportingLineIds"]))

    def test_wrong_subtotal_is_a_verified_arithmetic_mismatch_linked_to_lines(self) -> None:
        data = payload("BS-003")
        line_by_id(data, "controller_total")["rawAmount"] = "5,597.00"
        data["printedFiguresRechecked"] = True
        result = analyze_confirmed_review(data)
        self.assertEqual(result["verdict"], "verified_mismatch")
        self.assertEqual(result["messageType"], "arithmetic_mismatch")
        self.assertIn("INR 5587.00", result["draft"]["text"])
        self.assertIn("INR 5597.00", result["draft"]["text"])
        self.assertIn("controller_total", result["draft"]["supportingLineIds"])

    def test_wrong_printed_total_overrides_requested_message_with_note(self) -> None:
        data = payload("BS-002")
        line_by_id(data, "order_total")["rawAmount"] = "1,388.80"
        data["printedFiguresRechecked"] = True
        result = analyze_confirmed_review(data)
        self.assertEqual(result["verdict"], "verified_mismatch")
        self.assertEqual(result["messageType"], "arithmetic_mismatch")
        self.assertIsNotNone(result["messageTypeNote"])
        self.assertIn("a difference of EUR 10.00", result["draft"]["text"])
        self.assertIn("order_total", result["draft"]["supportingLineIds"])

    def test_remembered_price_difference_is_never_proven(self) -> None:
        for name in ("BS-001", "BS-002", "BS-004"):
            with self.subTest(case=name):
                result = analyze_confirmed_review(payload(name))
                self.assertEqual(result["verdict"], "unexplained")
                self.assertNotEqual(result["comparisonStatus"], "mismatches_expectation")

    def test_matching_expectation_gets_honest_no_issue_summary(self) -> None:
        data = payload("BS-004")
        data["expectedAmount"] = "22,434"
        result = analyze_confirmed_review(data)
        self.assertEqual(result["verdict"], "checks_passed")
        self.assertEqual(result["messageType"], "checks_passed_summary")
        self.assertIn("matches the expected amount of INR 22434.00", result["draft"]["text"])

    def test_summary_cannot_hide_a_difference(self) -> None:
        data = payload("BS-004")
        data["messageType"] = "checks_passed_summary"
        with self.assertRaisesRegex(ReviewError, "cannot hide"):
            analyze_confirmed_review(data)

    def test_quote_difference_without_questioned_lines_still_drafts(self) -> None:
        data = payload("BS-004")
        for line in data["lines"]:
            line["questioned"] = False
        result = analyze_confirmed_review(data)
        self.assertIn("difference of INR 3000.00", result["draft"]["text"])
        self.assertTrue(result["draft"]["supportingLineIds"])

    def test_fee_disclosure_needs_questioned_line(self) -> None:
        data = payload("BS-002")
        for line in data["lines"]:
            line["questioned"] = False
        with self.assertRaisesRegex(ReviewError, "Ask about this line"):
            analyze_confirmed_review(data)

    def test_corrections_are_reported(self) -> None:
        data = payload("BS-004")
        line = line_by_id(data, "convenience")
        line.update({"extractor": "local_ocr", "extractedRawAmount": "2650", "rawAmount": "₹650"})
        result = analyze_confirmed_review(data)
        reported = next(item for item in result["lines"] if item["id"] == "convenience")
        self.assertIs(reported["corrected"], True)
        self.assertEqual(reported["amountMinor"], 65000)


def canyon_rows(**bike) -> dict:
    """BS-002 with the bicycle as one printed row: price 1,499.00, discount -200,00, amount 1,299.00."""
    data = payload("BS-002")
    data["lines"] = [line for line in data["lines"] if line["id"] not in ("bicycle", "discount")]
    data["lines"].insert(0, {
        "id": "bike_row", "role": "charge", "group": None, "description": "Grizl bike", "rawAmount": "1,299.00",
        "extractedRawAmount": "1,299.00", "extractor": "groq", "questioned": False, "currency": "EUR",
        "source": {"page": 1, "precision": "page"},
        "breakdown": {"quantity": "1", "unitPrice": "1,499.00", "discount": "-200,00", **bike},
    })
    data["messageType"] = "automatic"
    for line in data["lines"]:
        line["questioned"] = False
    return data


class RowCheckTests(unittest.TestCase):
    def test_row_columns_are_checked_and_discount_is_not_added_twice(self) -> None:
        result = analyze_confirmed_review(canyon_rows())
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["minor"]["calculatedTotal"], 137880)
        row = result["rowChecks"][0]
        self.assertTrue(row["matches"])
        self.assertEqual(row["formula"], "1 × EUR 1499.00 − EUR 200.00 = EUR 1299.00")
        self.assertIn(("equals_expected", ["bike_row"]), [(m["kind"], m["lineIds"]) for m in result["gap"]["exactMatches"]])

    def test_separate_discount_line_as_well_stops_with_a_pointed_recheck(self) -> None:
        data = canyon_rows()
        data["lines"].insert(1, {
            "id": "bike_discount", "role": "discount", "group": None, "description": "Grizl bike discount",
            "rawAmount": "-200.00", "extractedRawAmount": "-200.00", "extractor": "groq", "questioned": False,
            "currency": "EUR", "source": {"page": 1, "precision": "page"},
        })
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "needs_recheck")
        self.assertIsNone(result["verdict"])
        self.assertIsNone(result["draft"])
        self.assertFalse(result["gap"]["needsExplanation"])
        texts = " ".join(suspect["text"] for suspect in result["suspects"])
        self.assertIn("counted twice", texts)
        self.assertIn("bike_discount", {line_id for suspect in result["suspects"] for line_id in suspect["lineIds"]})

    def test_row_that_does_not_add_up_needs_recheck_then_drafts_after_confirmation(self) -> None:
        data = canyon_rows(discount="-100,00")
        first = analyze_confirmed_review(data)
        self.assertEqual(first["status"], "needs_recheck")
        self.assertIn("EUR 1399.00", first["suspects"][0]["text"])
        data["printedFiguresRechecked"] = True
        second = analyze_confirmed_review(data)
        self.assertEqual(second["verdict"], "verified_mismatch")
        self.assertEqual(second["messageType"], "arithmetic_mismatch")
        self.assertIn("work out to EUR 1399.00, but the bill shows EUR 1299.00", second["draft"]["text"])
        self.assertIn("bike_row", second["draft"]["supportingLineIds"])

    def test_indian_gst_row_with_taxable_value_and_two_taxes(self) -> None:
        data = payload("BS-003")
        line = line_by_id(data, "controller_base")
        data["lines"] = [l for l in data["lines"] if l["id"] not in ("controller_base", "controller_tax")]
        data["lines"].insert(0, {**line, "id": "controller_row", "description": "controller", "rawAmount": "5,587.00",
                                 "breakdown": {"quantity": "1", "unitPrice": "4,734.75", "taxableValue": "4,734.75",
                                               "taxes": ["426.12", "426.13"]}})
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "complete")
        self.assertEqual([row["what"] for row in result["rowChecks"]], ["taxable_value", "row_amount"])
        self.assertTrue(all(row["matches"] for row in result["rowChecks"]))
        self.assertEqual(result["minor"]["calculatedTotal"], 2182800)

    def test_quantity_times_unit_price(self) -> None:
        data = canyon_rows(quantity="2", unitPrice="649.50", discount="")
        result = analyze_confirmed_review(data)
        self.assertEqual(result["rowChecks"][0]["formula"], "2 × EUR 649.50 = EUR 1299.00")
        with self.assertRaises(ReviewError):
            analyze_confirmed_review(canyon_rows(quantity="two"))
        with self.assertRaises(ReviewError):
            analyze_confirmed_review(canyon_rows(quantity="1/2"))

    def test_printed_unit_after_quantity_is_ignored(self) -> None:
        for quantity in ("1 PC", "1PC", "1 pcs", "1 Nos."):
            with self.subTest(quantity=quantity):
                row = analyze_confirmed_review(canyon_rows(quantity=quantity))["rowChecks"][0]
                self.assertEqual(row["formula"], "1 × EUR 1499.00 − EUR 200.00 = EUR 1299.00")

    def test_round_off_adjustment_is_added(self) -> None:
        data = payload("BS-004")
        line_by_id(data, "total_paid")["rawAmount"] = "₹22,434.40"
        data["lines"].append({"id": "round_off", "role": "adjustment", "group": None, "description": "Round off",
                              "rawAmount": "0.40", "extractedRawAmount": None, "extractor": "manual", "questioned": False,
                              "currency": "INR", "source": {"page": 1, "precision": "page"}})
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["minor"]["calculatedTotal"], 2243440)

    def test_row_details_on_a_printed_total_are_not_checked_and_do_not_block(self) -> None:
        data = canyon_rows()
        line_by_id(data, "order_total")["breakdown"] = {"unitPrice": "1,378.80"}
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "complete")
        self.assertNotIn("order_total", {check["lineId"] for check in result["rowChecks"]})


class RoleAndSignTests(unittest.TestCase):
    def test_positive_discount_is_rejected_not_flipped(self) -> None:
        data = payload("BS-002")
        line_by_id(data, "discount")["rawAmount"] = "200.00"
        with self.assertRaisesRegex(ReviewError, "negative amount"):
            analyze_confirmed_review(data)

    def test_negative_charge_is_rejected(self) -> None:
        data = payload("BS-002")
        line_by_id(data, "delivery")["rawAmount"] = "-59.90"
        with self.assertRaisesRegex(ReviewError, "discount"):
            analyze_confirmed_review(data)

    def test_two_grand_totals_are_rejected(self) -> None:
        data = payload("BS-002")
        extra = copy.deepcopy(line_by_id(data, "order_total"))
        extra["id"] = "order_total_again"
        data["lines"].append(extra)
        with self.assertRaisesRegex(ReviewError, "at most one"):
            analyze_confirmed_review(data)

    def test_nothing_printed_to_check_is_rejected(self) -> None:
        data = payload("BS-002")
        data["lines"] = [line for line in data["lines"] if line["role"] != "total"]
        with self.assertRaisesRegex(ReviewError, "printed total"):
            analyze_confirmed_review(data)

    def test_subtotal_without_group_is_rejected(self) -> None:
        data = payload("BS-003")
        line_by_id(data, "monitor_total")["group"] = None
        with self.assertRaisesRegex(ReviewError, "needs a group"):
            analyze_confirmed_review(data)

    def test_role_is_required(self) -> None:
        data = payload("BS-002")
        line_by_id(data, "delivery")["role"] = ""
        with self.assertRaises(ReviewError):
            analyze_confirmed_review(data)

    def test_mixed_currency_is_rejected(self) -> None:
        data = payload("BS-002")
        line_by_id(data, "delivery")["currency"] = "INR"
        with self.assertRaisesRegex(ReviewError, "currency"):
            analyze_confirmed_review(data)


class AmountFormatTests(unittest.TestCase):
    def test_decimal_mark_is_never_guessed(self) -> None:
        # Ambiguous: a separator followed by three digits could be thousands or decimals.
        with self.assertRaises(ReviewError):
            parse_confirmed_amount("1,499", decimal_separator=",", currency="EUR")
        with self.assertRaises(ReviewError):
            parse_confirmed_amount("1.499", decimal_separator=".", currency="EUR")
        # Unambiguous: one separator followed by exactly two final digits is a printed decimal mark.
        self.assertEqual(parse_confirmed_amount("33,75", decimal_separator=".", currency="EUR"), 3375)
        self.assertEqual(parse_confirmed_amount("-200,00", decimal_separator=".", currency="EUR"), -20000)
        self.assertEqual(parse_confirmed_amount("19.90", decimal_separator=",", currency="EUR"), 1990)
        self.assertEqual(parse_confirmed_amount("33,75", decimal_separator=",", currency="EUR"), 3375)
        self.assertEqual(parse_confirmed_amount("1.378,80", decimal_separator=",", currency="EUR"), 137880)

    def test_grouping_forms(self) -> None:
        self.assertEqual(parse_confirmed_amount("1,57,757.00", decimal_separator=".", currency="INR"), 15775700)
        self.assertEqual(parse_confirmed_amount("22,434", decimal_separator=".", currency="INR"), 2243400)
        self.assertEqual(parse_confirmed_amount("(200.00)", decimal_separator=".", currency="EUR"), -20000)
        self.assertEqual(parse_confirmed_amount("−4,19", decimal_separator=",", currency="EUR"), -419)

    def test_leading_two_is_not_treated_as_rupee_sign(self) -> None:
        self.assertEqual(parse_confirmed_amount("2650", decimal_separator=".", currency="INR"), 265000)
        self.assertEqual(parse_confirmed_amount("₹650", decimal_separator=".", currency="INR"), 65000)

    def test_unknown_symbols_and_letters_are_rejected(self) -> None:
        for raw in ("B297", "€19.90", "19.9O", "12.345"):
            with self.subTest(raw=raw), self.assertRaises(ReviewError):
                parse_confirmed_amount(raw, decimal_separator=".", currency="INR")


class ProvenanceTests(unittest.TestCase):
    def with_source(self, source: dict) -> dict:
        data = payload("BS-002")
        line_by_id(data, "delivery")["source"] = source
        return data

    def test_table_evidence_is_accepted_and_reported(self) -> None:
        region = {"x0": 0.1, "top": 0.4, "x1": 0.9, "bottom": 0.7}
        result = analyze_confirmed_review(
            self.with_source({"page": 1, "precision": "table", "locatedBy": "groq", "region": region})
        )
        reported = next(item for item in result["lines"] if item["id"] == "delivery")
        self.assertEqual(reported["source"]["precision"], "table")
        self.assertEqual(result["sourcePrecision"]["table"], 1)

    def test_table_area_cannot_pose_as_exact_location(self) -> None:
        box = {"x0": 0.1, "top": 0.4, "x1": 0.9, "bottom": 0.7}
        for source in (
            {"page": 1, "precision": "table", "locatedBy": "groq", "bounds": box},
            {"page": 1, "precision": "exact", "locatedBy": "groq", "region": box},
            {"page": 1, "precision": "exact", "locatedBy": "user"},
            {"page": 1, "precision": "page", "bounds": box},
            {"page": 1, "precision": "page", "locatedBy": "user"},
        ):
            with self.subTest(source=source), self.assertRaises(ReviewError):
                analyze_confirmed_review(self.with_source(source))

    def test_exact_evidence_requires_valid_bounds(self) -> None:
        bad = {"x0": 0.8, "top": 0.4, "x1": 0.2, "bottom": 0.7}
        with self.assertRaises(ReviewError):
            analyze_confirmed_review(self.with_source({"page": 1, "precision": "exact", "locatedBy": "user", "bounds": bad}))


class LabelSafetyTests(unittest.TestCase):
    def test_amounts_and_private_data_cannot_enter_message_through_labels(self) -> None:
        for label in ("Delivery 59.90", "Fee INR 5", "Fee €5", "5 EUR fee", "Fee 2312", "Account fee", "Booking reference"):
            with self.subTest(label=label):
                data = payload("BS-002")
                line_by_id(data, "delivery")["description"] = label
                with self.assertRaises(ReviewError):
                    analyze_confirmed_review(data)

    def test_currency_word_without_number_is_allowed(self) -> None:
        data = payload("BS-002")
        line_by_id(data, "order_total")["description"] = "TOTAL EUR"
        self.assertEqual(analyze_confirmed_review(data)["verdict"], "unexplained")

    def test_period_words_and_years_are_allowed(self) -> None:
        data = payload("BS-002")
        line_by_id(data, "delivery")["description"] = "delivery September 2026"
        self.assertIn("delivery September 2026", analyze_confirmed_review(data)["draft"]["text"])


if __name__ == "__main__":
    unittest.main()


class MismatchHints(unittest.TestCase):
    """Re-check messages say how far off a section is, which way, and which page to read again."""

    def review(self, rows, subtotal):
        line = lambda id, role, amount, page=1: {
            "id": id, "role": role, "group": "Subscription", "description": id.replace("_", " "),
            "rawAmount": amount, "extractor": "groq", "currency": "EUR", "source": {"page": page, "precision": "page"}}
        return {"schemaVersion": 2, "currency": "EUR", "decimalSeparator": ",", "expectedAmount": "31,25",
                "lines": [line(*row) for row in rows] + [line("subtotal", "subtotal", subtotal, 2)]}

    def test_missing_discount_is_named_with_its_size_and_page(self):
        # The Vodafone crop read live on 2026-10-19 dropped the -2,10 discount: 33,35 against a printed 31,25.
        data = self.review([("august", "charge", "20,54"), ("august_discount", "discount", "-4,19"),
                            ("september", "charge", "24,50"), ("september_discount", "discount", "-5,00"),
                            ("extra_discount", "discount", "-2,50")], "31,25")
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "needs_recheck")
        suspect = result["suspects"][0]
        self.assertIn("add up to EUR 33.35, but the printed subtotal is EUR 31.25", suspect["text"])
        self.assertIn("EUR 2.10 too much: a discount of EUR 2.10 may be missing", suspect["text"])
        self.assertEqual(suspect["pages"], [1])

    def test_a_line_equal_to_the_surplus_is_pointed_out(self):
        data = self.review([("plan", "charge", "10,00"), ("fee", "charge", "2,50"), ("fee_again", "charge", "2,50")], "12,50")
        text = analyze_confirmed_review(data)["suspects"][0]["text"]
        self.assertIn("EUR 2.50 too much", text)
        self.assertIn("fee, fee again equals the difference exactly", text)

    def test_too_little_suggests_a_missing_charge(self):
        data = self.review([("plan", "charge", "10,00")], "12,50")
        self.assertIn("EUR 2.50 too little: a charge of EUR 2.50 may be missing",
                      analyze_confirmed_review(data)["suspects"][0]["text"])


class RoundingLine(unittest.TestCase):
    """Owner 2026-10-19: a 1-cent rounding gap is settled only by a visible adjustment line the person adds."""

    def payload(self, with_rounding):
        data = json.loads((Path(__file__).parent / "fixtures/confirmed/BS-001.confirmed.json").read_text(encoding="utf-8"))
        data["messageType"] = "automatic"
        data["expectedAmount"] = "33,76"
        for line in data["lines"]:
            line["questioned"] = False
            if line["role"] == "total":
                line["rawAmount"] = "33,76"
        if with_rounding:
            data["lines"].append({"id": "rounding-1", "role": "adjustment", "group": None,
                                  "description": "Rounding difference (added by you)", "rawAmount": "0,01",
                                  "extractedRawAmount": None, "extractor": "manual", "questioned": False,
                                  "currency": "EUR", "source": {"page": 1, "precision": "page"}})
        return data

    def test_without_the_rounding_line_the_cent_is_not_ignored(self):
        self.assertEqual(analyze_confirmed_review(self.payload(False))["status"], "needs_recheck")

    def test_with_the_rounding_line_the_bill_adds_up(self):
        result = analyze_confirmed_review(self.payload(True))
        self.assertEqual((result["status"], result["verdict"]), ("complete", "checks_passed"))



class ReductionRows(unittest.TestCase):
    """Seen live 2026-10-19 (energy bill): "Energy tax reduction" printed with row columns and a negative amount."""

    def payload(self, unit_price):
        data = json.loads((Path(__file__).parent / "fixtures/confirmed/BS-001.confirmed.json").read_text(encoding="utf-8"))
        data["messageType"] = "automatic"
        for line in data["lines"]:
            line["questioned"] = False
        discount = next(line for line in data["lines"] if line["role"] == "discount")
        discount["breakdown"] = {"quantity": "1", "unitPrice": unit_price}
        return data, discount

    def test_a_reduction_with_row_columns_is_checked_by_size(self):
        data, discount = self.payload("0")
        discount["breakdown"]["unitPrice"] = discount["rawAmount"].lstrip("-")  # printed as a positive rate
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "complete")
        row = next(check for check in result["rowChecks"] if check["lineId"] == discount["id"])
        self.assertTrue(row["matches"])

    def test_a_wrong_multiplication_on_a_reduction_is_still_caught(self):
        data, discount = self.payload("9,99")
        result = analyze_confirmed_review(data)
        self.assertEqual(result["status"], "needs_recheck")


class EnergyRates(unittest.TestCase):
    """Seen live 2026-10-19: energy bills print rates with five decimals (EUR 0,11640 per kWh)."""

    def payload(self, rate, quantity):
        data = json.loads((Path(__file__).parent / "fixtures/confirmed/BS-001.confirmed.json").read_text(encoding="utf-8"))
        data["messageType"] = "automatic"
        for line in data["lines"]:
            line["questioned"] = False
        charge = next(line for line in data["lines"] if line["role"] == "charge")
        charge["breakdown"] = {"quantity": quantity, "unitPrice": rate}
        return data, charge

    def test_a_five_decimal_rate_times_kwh_is_rounded_once_to_cents(self):
        data, charge = self.payload("€0,11640", "176.46")
        # 176.46 kWh x 0.11640 = 20.539944 -> 20.54, the printed amount of this fixture's first charge
        self.assertEqual(charge["rawAmount"], "20,54")
        result = analyze_confirmed_review(data)
        row = next(check for check in result["rowChecks"] if check["lineId"] == charge["id"])
        self.assertTrue(row["matches"], row)

    def test_an_unreadable_rate_is_refused_not_guessed(self):
        data, _ = self.payload("0,11.640", "1")
        with self.assertRaisesRegex(ReviewError, "unit price"):
            analyze_confirmed_review(data)
