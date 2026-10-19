from pathlib import Path
import unittest

from backend.billshield_core.engine import analyze_case
from backend.billshield_core.fixtures import load_fixture


FIXTURES = Path(__file__).parent / "fixtures"

EXPECTED = {
    "BS-001": {
        "total": 3375,
        "difference": 1425,
        "verdict": "unexplained",
        "comparison": "unresolved",
        "required_text": ["EUR 33.75", "EUR 19.50", "EUR 14.25"],
    },
    "BS-002": {
        "total": 137880,
        "difference": 7980,
        "verdict": "unexplained",
        "comparison": "unresolved",
        "required_text": ["EUR 1299.00", "EUR 1378.80", "EUR 19.90", "EUR 59.90"],
    },
    "BS-003": {
        "total": 2182800,
        "difference": None,
        "verdict": "checks_passed",
        "comparison": "not_checked",
        "required_text": ["No arithmetic discrepancy", "INR 21828.00", "not provided"],
    },
    "BS-004": {
        "total": 2243400,
        "difference": 300000,
        "verdict": "unexplained",
        "comparison": "unresolved",
        "required_text": ["INR 19434.00", "INR 22434.00", "INR 3000.00", "INR 2312.00", "INR 520.00"],
    },
}


class GoldenCaseTests(unittest.TestCase):
    def test_all_four_sanitized_cases(self) -> None:
        paths = sorted(FIXTURES.glob("BS-*.json"))
        self.assertEqual(len(paths), 4)
        for path in paths:
            with self.subTest(path=path.name):
                case = load_fixture(path)
                result = analyze_case(case)
                expected = EXPECTED[case.case_id]
                self.assertEqual(result.calculated_total_minor, expected["total"])
                self.assertEqual(result.displayed_total_minor, expected["total"])
                self.assertEqual(result.difference_minor, expected["difference"])
                self.assertEqual(result.arithmetic_status, "checks_passed")
                self.assertEqual(result.comparison_status, expected["comparison"])
                self.assertEqual(result.verdict, expected["verdict"])
                self.assertTrue(result.draft.supporting_line_ids)
                for fragment in expected["required_text"]:
                    self.assertIn(fragment, result.draft.text)

    def test_case_specific_reconciliations(self) -> None:
        expected_groups = {
            "BS-001": {"august": 1425, "september": 1950},
            "BS-002": {"bicycle_after_discount": 129900, "additional_fees": 7980},
            "BS-003": {"protection": 3900, "transport_invoice": 23300, "controller": 558700, "monitor": 1575700},
            "BS-004": {"development_fees": 283200},
        }
        for path in sorted(FIXTURES.glob("BS-*.json")):
            result = analyze_case(load_fixture(path))
            actual = {calculation.id: calculation.result_minor for calculation in result.calculations}
            self.assertEqual(actual, expected_groups[result.case_id])
            self.assertTrue(all(calculation.matches for calculation in result.calculations))


if __name__ == "__main__":
    unittest.main()
