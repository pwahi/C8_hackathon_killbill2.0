"""Bill context notes (PRD_SCALABLE W2) and Python's grading of AI causes (W5). No network."""

import json
import unittest
from unittest.mock import patch

from backend.billshield_core.gap_llm import build_package, clean_notes, grade_cause, parse_explanation
from backend.billshield_core.groq_vision import mark_text_matches, parse_response
from backend.billshield_core.review import analyze_confirmed_review
from tests.test_gap import review


def reply(content: dict) -> dict:
    return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content)}}]}


def page(notes):
    lines = [{"id": "a", "description": "Roaming outside EU", "raw_amount": "12,40", "page": 1, "confidence": 0.9, "role": "charge"}]
    return parse_response(reply({"lines": lines, "notes": notes}))


class ReaderNotes(unittest.TestCase):
    def test_notes_are_kept_with_links_to_real_lines_only(self):
        output = page([{"quote": "Roaming buiten de EU 12-18 aug", "about": "Usage abroad outside the EU.", "line_ids": ["a", "zz"]}])
        self.assertEqual(len(output.notes), 1)
        self.assertEqual(output.notes[0].line_ids, ("a",))
        self.assertIsNone(output.notes[0].verified)

    def test_anything_personal_drops_the_note_in_any_language(self):
        output = page([{"quote": "Klantnummer 123456789", "about": "Your customer number."},
                       {"quote": "Bel ons op 06 1234 5678", "about": "Call us."},
                       {"quote": "Prijswijziging per 1 oktober 2026", "about": "Prices change on 1 October."}])
        self.assertEqual([note.quote for note in output.notes], ["Prijswijziging per 1 oktober 2026"])

    def test_a_note_is_verified_only_against_the_pdf_text(self):
        output = page([{"quote": "Roaming buiten de EU", "about": "Usage abroad.", "verified": True},
                       {"quote": "Invented sentence", "about": "Not on the bill."}])
        self.assertEqual([note.verified for note in output.notes], [None, None])  # the model cannot set it
        checked = mark_text_matches(output, "Kosten\nRoaming   buiten de\nEU 12,40")
        self.assertEqual([note.verified for note in checked.notes], [True, False])

    def test_the_browser_copy_is_checked_again(self):
        notes = clean_notes([{"quote": "Late fee added", "about": "A late fee.", "lineIds": ["udf", "ghost"], "verified": "yes"},
                             {"quote": "IBAN NL91ABNA0417164300", "about": "Bank."}, "nonsense"], {"udf"})
        self.assertEqual(notes, [{"quote": "Late fee added", "about": "A late fee.", "page": None, "verified": False,
                                  "lineIds": ["udf"]}])


class Grading(unittest.TestCase):
    def setUp(self):
        self.result = analyze_confirmed_review(review("BS-002"))  # bill EUR 1378.80, expected 1299.00: +79.80

    def grade(self, line_ids, note_ids=(), notes=()):
        return grade_cause(list(line_ids), list(note_ids), self.result, list(notes))

    def test_lines_that_add_up_to_the_difference_explain_all_of_it(self):
        graded = self.grade(["packaging", "delivery"])
        self.assertEqual((graded["grade"], graded["coveredMinor"], graded["covered"]), ("full", 7980, "EUR 79.80"))

    def test_part_of_the_difference_in_the_right_direction(self):
        self.assertEqual(self.grade(["delivery"])["grade"], "part")

    def test_lines_that_add_up_to_more_than_the_difference_are_named_so(self):
        graded = self.grade(["bicycle"])
        self.assertEqual((graded["grade"], graded["covered"]), ("over", "EUR 1499.00"))

    def test_lines_that_point_the_other_way_are_not_supported(self):
        self.assertEqual(self.grade(["discount"])["grade"], "unsupported")
        self.assertEqual(self.grade(["ghost"])["grade"], "unsupported")

    def test_a_cause_resting_on_bill_text_alone_is_labelled_as_such(self):
        note = {"quote": "Delivery charged separately", "about": "x", "verified": True, "lineIds": [], "page": 1}
        graded = self.grade([], [0], [note])
        self.assertEqual((graded["grade"], graded["notesVerified"]), ("text", True))


class Explanation(unittest.TestCase):
    def setUp(self):
        self.result = analyze_confirmed_review(review("BS-002"))
        self.notes = [{"quote": "Verzending en verpakking worden apart berekend", "about": "Shipping and packaging are charged separately.",
                       "page": 1, "verified": True, "lineIds": ["packaging", "delivery"]}]
        self.package, self.refs = build_package(self.result, self.notes)
        self.labels = [line["description"] for line in self.result["lines"]]

    def test_notes_reach_the_model_by_reference_with_their_lines(self):
        self.assertEqual(self.package["bill_notes"], [{"ref": "N1", "printed": self.notes[0]["quote"],
                                                       "about": self.notes[0]["about"], "lines": ["L3", "L4"]}])

    def test_causes_are_ranked_by_python_and_unsupported_ones_hidden_with_the_story(self):
        answer = {"story": "The discount explains it.",
                  "likely_causes": [{"refs": ["L2"], "reason": "The discount.", "likelihood": "high"},
                                    {"refs": ["L4"], "reason": "Delivery.", "likelihood": "high"},
                                    {"refs": ["L3", "L4"], "notes": ["N1"], "covers": "all", "reason": "Shipping and packaging.", "likelihood": "medium"}],
                  "question_for_provider": "Could you confirm what the shipping covers?"}
        explanation = parse_explanation(reply(answer), self.refs, self.labels, "above", self.result, self.notes)
        self.assertIsNone(explanation["story"])
        self.assertEqual([(cause["lineIds"], cause["grade"]) for cause in explanation["likelyCauses"]],
                         [(["packaging", "delivery"], "full"), (["delivery"], "part")])
        self.assertEqual(explanation["likelyCauses"][0]["noteIds"], [0])
        self.assertEqual(explanation["difference"], "EUR 79.80")

    def test_the_story_stays_when_every_cause_holds(self):
        answer = {"story": "Packaging and delivery were added.",
                  "likely_causes": [{"refs": ["L3", "L4"], "reason": "Added fees.", "likelihood": "high"}],
                  "question_for_provider": "Could you confirm the fees?"}
        explanation = parse_explanation(reply(answer), self.refs, self.labels, "above", self.result, self.notes)
        self.assertEqual(explanation["story"], "Packaging and delivery were added.")


class Endpoint(unittest.TestCase):
    def test_notes_travel_beside_the_review_and_are_not_part_of_it(self):
        from fastapi.testclient import TestClient
        import app as api
        client = TestClient(api.app)
        data = review("BS-004")
        data["contextNotes"] = [{"quote": "Airport fees are collected at payment", "about": "x", "lineIds": ["udf"]}]
        with patch("billshield_core.service.explain_gap", return_value=None) as provider:
            response = client.post("/api/explain", json=data, headers={"Origin": "http://127.0.0.1:4173"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(provider.call_args.args[3][0]["quote"], "Airport fees are collected at payment")


if __name__ == "__main__":
    unittest.main()
