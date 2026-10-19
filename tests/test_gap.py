"""Exact gap search (Python) and validation of the model's gap explanation (D-027). No network."""

import json
from pathlib import Path
import unittest
from unittest.mock import patch

from backend.billshield_core.gap_llm import build_package, build_request, explain_gap, parse_explanation
from backend.billshield_core.review import analyze_confirmed_review

CONFIRMED = Path(__file__).parent / "fixtures" / "confirmed"


def review(name: str, automatic: bool = True) -> dict:
    data = json.loads((CONFIRMED / f"{name}.confirmed.json").read_text(encoding="utf-8"))
    for line in data["lines"]:
        line["questioned"] = False
    if automatic:
        data["messageType"] = "automatic"
    return data


def reply(content: dict, finish: str = "stop") -> dict:
    return {"choices": [{"finish_reason": finish, "message": {"content": json.dumps(content)}}]}


GOOD = {
    "likely_causes": [{"refs": ["L5", "L6"], "reason": "Both User Development Fee lines are airport fees often added at payment.", "likelihood": "high"},
                      {"refs": ["L2"], "reason": "A convenience fee may not have been in the quote.", "likelihood": "low"}],
    "unexplained": "The fees do not fully explain the difference; the original quote would settle it.",
    "question_for_provider": "Could you explain which charges were added after my original quote?",
    "evidence_to_request": ["Itemized original quote"],
}


class ExactMatchTests(unittest.TestCase):
    def matches(self, name):
        return analyze_confirmed_review(review(name))["gap"]

    def test_period_case_finds_whole_groups(self):
        gap = self.matches("BS-001")
        found = {(m["kind"], m["groupLabel"], m["amount"]) for m in gap["exactMatches"]}
        self.assertEqual(found, {("equals_expected", "September", "EUR 19.50"), ("equals_difference", "6-31 August", "EUR 14.25")})

    def test_fee_case_finds_lines(self):
        found = {(m["kind"], tuple(m["lineIds"])) for m in self.matches("BS-002")["exactMatches"]}
        self.assertIn(("equals_expected", ("bicycle", "discount")), found)
        self.assertIn(("equals_difference", ("packaging", "delivery")), found)

    def test_no_difference_needs_no_explanation(self):
        gap = self.matches("BS-003")
        self.assertFalse(gap["needsExplanation"])
        self.assertEqual(gap["exactMatches"], [])

    def test_no_exact_combination_is_reported_honestly(self):
        gap = self.matches("BS-004")
        self.assertTrue(gap["needsExplanation"])
        self.assertEqual(gap["exactMatches"], [])

    def test_wrong_printed_total_looks_for_the_gap(self):
        data = review("BS-002")
        next(line for line in data["lines"] if line["id"] == "order_total")["rawAmount"] = "1,358.90"
        found = {(m["kind"], tuple(m["lineIds"])) for m in analyze_confirmed_review(data)["gap"]["exactMatches"]}
        self.assertIn(("equals_total_gap", ("packaging",)), found)


class ExplanationValidationTests(unittest.TestCase):
    def setUp(self):
        self.result = analyze_confirmed_review(review("BS-004"))
        self.package, self.refs = build_package(self.result)
        self.labels = [line["description"] for line in self.result["lines"]]

    def test_package_has_no_image_ids_or_sources(self):
        text = json.dumps(self.package)
        for forbidden in ("image", "bounds", "region", "source", "udf"):
            self.assertNotIn(forbidden, text)
        self.assertEqual(self.package["lines"][4]["amount"], "INR 2312.00")
        request = build_request(self.package)
        self.assertEqual(request["model"], "openai/gpt-oss-120b")

    def test_valid_answer_maps_refs_to_lines_and_skips_low_likelihood(self):
        explanation = parse_explanation(reply(GOOD), self.refs, self.labels)
        self.assertEqual(explanation["line_ids"], ["udf", "arrival_udf"])
        self.assertEqual(explanation["likelyCauses"][1]["lineIds"], ["convenience"])

    def test_answers_are_shown_with_a_disclaimer_but_invented_lines_are_dropped(self):
        # Owner decision 2026-10-19: AI text is displayed (with a disclaimer) instead of being filtered away.
        answer = {**GOOD, "story": "The fuel charge is higher than usual and costs 2312 more.",
                  "likely_causes": [*GOOD["likely_causes"], {"refs": ["L99"], "reason": "x", "likelihood": "high"}]}
        explanation = parse_explanation(reply(answer), self.refs, self.labels)
        self.assertEqual(explanation["story"], answer["story"])
        self.assertEqual(len(explanation["likelyCauses"]), 2)  # the cause citing a non-existent line is gone
        with self.assertRaises(ValueError):
            parse_explanation(reply(GOOD, finish="length"), self.refs, self.labels)

    def test_only_a_number_free_non_accusing_question_may_enter_the_message(self):
        cases = {
            "number": "Why did I pay 3000 more?",
            "currency": "Why is there INR extra on my bill?",
            "accusation": "You overcharged me, please refund.",
        }
        for name, question in cases.items():
            with self.subTest(name):
                explanation = parse_explanation(reply({**GOOD, "question_for_provider": question}), self.refs, self.labels)
                self.assertEqual(explanation["question"], question)        # shown to the person
                self.assertIsNone(explanation["questionForMessage"])       # never added to the sent message
                draft = analyze_confirmed_review(review("BS-004"), explanation)["draft"]["text"]
                self.assertNotIn(question, draft)
        ok = parse_explanation(reply(GOOD), self.refs, self.labels)
        self.assertEqual(ok["questionForMessage"], GOOD["question_for_provider"])

    def test_digits_of_a_confirmed_label_may_appear_in_the_message_question(self):
        result = analyze_confirmed_review(review("BS-001"))
        package, refs = build_package(result)
        labels = [x for line in result["lines"] for x in (line["description"], line["group"]) if x]
        ok = {**GOOD, "likely_causes": [{"refs": ["L1"], "reason": "earlier period", "likelihood": "high"}],
              "question_for_provider": "Was the 6-31 August period already billed?"}
        self.assertEqual(parse_explanation(reply(ok), refs, labels)["questionForMessage"], ok["question_for_provider"])
        bad = {**ok, "question_for_provider": "Was the 31 August charge already paid?"}
        self.assertIsNone(parse_explanation(reply(bad), refs, labels)["questionForMessage"])

    def test_suggestion_ticks_lines_and_adds_question_without_changing_numbers(self):
        explanation = parse_explanation(reply(GOOD), self.refs, self.labels)
        with_ai = analyze_confirmed_review(review("BS-004"), explanation)
        self.assertEqual(with_ai["questionedBy"], "ai")
        self.assertEqual(with_ai["minor"], self.result["minor"])
        self.assertEqual(with_ai["verdict"], "unexplained")
        self.assertIn("INR 2312.00 User Development Fee", with_ai["draft"]["text"])
        self.assertTrue(with_ai["draft"]["text"].endswith(GOOD["question_for_provider"]))

    def test_user_ticks_win_over_ai(self):
        data = review("BS-004")
        next(line for line in data["lines"] if line["id"] == "gst")["questioned"] = True
        explanation = parse_explanation(reply(GOOD), self.refs, self.labels)
        with_ai = analyze_confirmed_review(data, explanation)
        self.assertEqual(with_ai["questionedBy"], "you")
        self.assertIn("INR 880.00 GST", with_ai["draft"]["text"])
        self.assertNotIn("User Development Fee", with_ai["draft"]["text"].split("Could you")[0])

    def test_explain_gap_uses_one_cached_call(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return json.dumps(reply(GOOD)).encode()
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as directory, patch("backend.billshield_core.groq_http.urlopen", return_value=Response()) as network:
            for _ in range(2):
                self.assertEqual(explain_gap(self.result, "fake-key", Path(directory))["line_ids"], ["udf", "arrival_udf"])
            self.assertEqual(network.call_count, 1)


if __name__ == "__main__":
    unittest.main()


class LabelParts(unittest.TestCase):
    def test_product_name_and_period_of_a_confirmed_label_may_be_quoted(self):
        from backend.billshield_core.gap_llm import _labels, _safe_text
        labels = _labels({"lines": [{"description": "30 GB (6-31 August)", "group": None}]})
        self.assertIn("30 GB", labels)
        self.assertIn("6-31 August", labels)
        self.assertTrue(_safe_text("The 30 GB entry for 6-31 August may be an earlier period.", labels))
        with self.assertRaises(ValueError):
            _safe_text("The 30 GB entry costs 20 more.", labels)


class Direction(unittest.TestCase):
    def test_higher_than_you_expected_is_allowed_only_when_python_found_it(self):
        from backend.billshield_core.gap_llm import _safe_text
        story = "The bill is higher than the amount you expected because of three fees."
        self.assertTrue(_safe_text(story, [], "above"))
        with self.assertRaises(ValueError):
            _safe_text(story, [], "below")
        with self.assertRaises(ValueError):
            _safe_text(story, [], None)
        with self.assertRaises(ValueError):  # judging a price is still forbidden
            _safe_text("The fuel charge is higher than usual.", [], "above")
        with self.assertRaises(ValueError):
            _safe_text("The bill is lower than you expected.", [], "above")
