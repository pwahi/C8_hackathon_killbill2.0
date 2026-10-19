from dataclasses import replace
import json
from pathlib import Path
import unittest

from backend.billshield_core.engine import analyze_case
from backend.billshield_core.fixtures import FixtureError, load_fixture


FIXTURES = Path(__file__).parent / "fixtures"


class EngineTests(unittest.TestCase):
    def test_changed_source_amount_produces_verified_arithmetic_mismatch(self) -> None:
        case = load_fixture(FIXTURES / "BS-002.json")
        changed_lines = tuple(
            replace(line, amount_minor=2090) if line.id == "packaging" else line
            for line in case.lines
        )
        result = analyze_case(replace(case, lines=changed_lines))
        self.assertEqual(result.arithmetic_status, "mismatch")
        self.assertEqual(result.verdict, "verified_mismatch")
        self.assertEqual(result.calculated_total_minor, 137980)

    def test_verified_promise_difference_is_a_verified_mismatch(self) -> None:
        case = load_fixture(FIXTURES / "BS-004.json")
        result = analyze_case(replace(case, comparison_evidence_verified=True))
        self.assertEqual(result.comparison_status, "mismatches_expectation")
        self.assertEqual(result.verdict, "verified_mismatch")

    def test_equal_expectation_checks_pass(self) -> None:
        case = load_fixture(FIXTURES / "BS-004.json")
        result = analyze_case(
            replace(case, expected_minor=case.displayed_total_minor, comparison_evidence_verified=True)
        )
        self.assertEqual(result.comparison_status, "matches_expectation")
        self.assertEqual(result.verdict, "checks_passed")

    def test_unknown_line_reference_is_rejected(self) -> None:
        raw = (FIXTURES / "BS-001.json").read_text(encoding="utf-8")
        broken = Path(self._testMethodName + ".json")
        self.addCleanup(lambda: broken.unlink(missing_ok=True))
        broken.write_text(raw.replace('"aug_subscription"', '"missing_line"', 1), encoding="utf-8")
        # The first replacement changes the line ID while references keep the original ID.
        with self.assertRaises(FixtureError):
            load_fixture(broken)

    def test_mixed_currency_line_is_rejected(self) -> None:
        data = json.loads((FIXTURES / "BS-002.json").read_text(encoding="utf-8"))
        data["lines"][0]["currency"] = "INR"
        broken = Path(self._testMethodName + ".json")
        self.addCleanup(lambda: broken.unlink(missing_ok=True))
        broken.write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(FixtureError, "mixed-currency"):
            load_fixture(broken)

    def test_duplicate_total_operand_is_rejected(self) -> None:
        data = json.loads((FIXTURES / "BS-002.json").read_text(encoding="utf-8"))
        data["total_line_ids"].append("packaging")
        broken = Path(self._testMethodName + ".json")
        self.addCleanup(lambda: broken.unlink(missing_ok=True))
        broken.write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(FixtureError, "duplicates"):
            load_fixture(broken)

    def test_message_numbers_are_bound_to_structured_facts(self) -> None:
        case = load_fixture(FIXTURES / "BS-004.json")
        result = analyze_case(case)
        facts = {fact.name: fact.amount_minor for fact in result.draft.numeric_facts}
        self.assertEqual(facts["calculated_total"], 2243400)
        self.assertEqual(facts["expected"], 1943400)
        self.assertEqual(facts["difference"], 300000)
        self.assertEqual(facts["udf"], 231200)
        self.assertEqual(facts["arrival_udf"], 52000)


if __name__ == "__main__":
    unittest.main()
