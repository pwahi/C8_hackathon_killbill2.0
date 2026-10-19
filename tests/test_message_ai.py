"""AI-written message in three tones: placeholders only, Python fills every amount. Simulated replies, no network."""

import json
from pathlib import Path
import unittest
from unittest.mock import patch

from billshield_core.message_ai import check_and_fill, draft_tones, fact_sheet
from billshield_core.review import analyze_confirmed_review
from billshield_core.tone import apply_tone

CONFIRMED = Path(__file__).parent / "fixtures" / "confirmed"


def result_for(name):
    data = json.loads((CONFIRMED / f"{name}.confirmed.json").read_text(encoding="utf-8"))
    data["messageType"] = "automatic"
    for line in data["lines"]:
        line["questioned"] = False
    return analyze_confirmed_review(data)


def reply(content):
    return {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content)}}]}


class FactSheet(unittest.TestCase):
    def test_reference_message_carries_placeholders_not_amounts(self):
        result = result_for("BS-002")
        sheet, values = fact_sheet(result)
        self.assertIn("{difference}", sheet["reference_message"])
        self.assertNotIn(values["difference"], sheet["reference_message"])
        self.assertIn("{difference}", sheet["amount_placeholders"])
        self.assertNotIn("EUR", json.dumps(sheet["lines"]))  # amounts only as placeholders


class CheckAndFill(unittest.TestCase):
    VALUES = {"difference": "EUR 79.80", "expected": "EUR 1299.00", "amount:fee": "EUR 19.90"}
    LABELS = ["Bikeguard Packaging", "30 GB (6-31 August)", "30 GB", "6-31 August"]

    def test_placeholders_are_filled_by_python(self):
        text = "Hello, I expected {expected}, but paid {difference} more, including Bikeguard Packaging at {amount:fee}."
        self.assertEqual(check_and_fill(text, self.VALUES, self.LABELS),
                         "Hello, I expected EUR 1299.00, but paid EUR 79.80 more, including Bikeguard Packaging at EUR 19.90.")

    def test_versions_that_break_a_rule_are_refused(self):
        for text in ("I paid 79.80 more than {expected}.",          # typed amount
                     "The difference is {refund} in my favour.",    # unknown placeholder
                     "You overcharged me by {difference}.",          # accusation
                     "Please explain the bill.",                     # no checked fact at all
                     "I expected {expected} but saw EUR more."):     # currency outside a placeholder
            with self.subTest(text):
                self.assertIsNone(check_and_fill(text, self.VALUES, self.LABELS))

    def test_digits_inside_a_confirmed_label_are_fine(self):
        self.assertTrue(check_and_fill("The 30 GB line for 6-31 August adds {difference}.", self.VALUES, self.LABELS))


class DraftTones(unittest.TestCase):
    def setUp(self):
        self.result = result_for("BS-002")
        self.template = self.result["draft"]["text"]

    def test_all_three_tones_from_one_request(self):
        answer = {"warm": "Hello, I hope you are well. I expected {expected} and the difference is {difference}. Thank you!",
                  "neutral": "Hello, the bill is {difference} more than the {expected} I expected. Please explain.",
                  "direct": "The bill is {difference} above the {expected} I expected. Please explain this clearly."}
        with patch("billshield_core.message_ai.post_chat", return_value=reply(answer)) as call:
            drafts = draft_tones(self.result, "key")
        self.assertEqual(call.call_count, 1)
        self.assertEqual(drafts["source"], {"neutral": "ai", "warm": "ai", "direct": "ai"})
        self.assertIn(self.result["amounts"]["difference"], drafts["tones"]["direct"])

    def test_a_tone_that_breaks_a_rule_falls_back_to_the_template(self):
        answer = {"warm": "You overcharged me by {difference}.", "neutral": "The bill is {difference} more.", "direct": "I paid 80 too much."}
        with patch("billshield_core.message_ai.post_chat", return_value=reply(answer)):
            drafts = draft_tones(self.result, "key")
        self.assertEqual(drafts["source"], {"neutral": "ai", "warm": "template", "direct": "template"})
        self.assertEqual(drafts["tones"]["warm"], apply_tone(self.template, "warm"))

    def test_provider_failure_or_no_key_gives_the_templates(self):
        with patch("billshield_core.message_ai.post_chat", side_effect=RuntimeError("Groq request failed")):
            drafts = draft_tones(self.result, "key")
        self.assertEqual(set(drafts["source"].values()), {"template"})
        self.assertEqual(set(draft_tones(self.result, None)["source"].values()), {"template"})


class WordsChanged(unittest.TestCase):
    def test_the_version_on_screen_is_the_baseline(self):
        from billshield_core import store
        shown = "Hello, the bill is EUR 79.80 more than I expected. Please explain."
        with patch.object(store, "_call", side_effect=lambda method, *a, **k: [{"draft_text": "template"}] if method == "GET" else None):
            answer = store.record_event("token", "m1", "sent", shown, "neutral", shown)
        self.assertEqual(answer["wordsChanged"], 0)


if __name__ == "__main__":
    unittest.main()


class Hyphens(unittest.TestCase):
    def test_a_typographic_hyphen_inside_a_label_is_not_an_invented_number(self):
        text = "The three lines for the 6\u201131 August period add up to {difference}."
        self.assertEqual(check_and_fill(text, {"difference": "EUR 14.25"}, ["6-31 August"]),
                         "The three lines for the 6-31 August period add up to EUR 14.25.")
