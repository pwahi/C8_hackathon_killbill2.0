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


class CheckedCausesInTheMessage(unittest.TestCase):
    """Owner 2026-10-20: causes Python graded "explains it all" or "explains part" go into the message; others do not."""

    def setUp(self):
        self.result = result_for("BS-002")  # expected 1299.00, bill 1378.80: difference 79.80

    def test_only_full_and_part_causes_are_kept_and_python_grades_them_again(self):
        from billshield_core.message_ai import checked_causes
        causes = [{"lineIds": ["packaging", "delivery"], "grade": "part"},  # the browser's grade is ignored
                  {"lineIds": ["delivery"]}, {"lineIds": ["bicycle"]}, {"lineIds": ["discount"]}, {"lineIds": ["ghost"]}]
        found = checked_causes(self.result, causes)
        self.assertEqual([(c["ids"], c["grade"], c["covered"], c["remaining"]) for c in found],
                         [(["packaging", "delivery"], "full", "EUR 79.80", None), (["delivery"], "part", "EUR 59.90", "EUR 19.90")])

    def test_the_fact_sheet_gives_the_model_placeholders_for_them(self):
        from billshield_core.message_ai import checked_causes
        sheet, values = fact_sheet(self.result, checked_causes(self.result, [{"lineIds": ["delivery"]}]))
        self.assertEqual(sheet["checked_causes"], [{"lines": ["delivery"], "explains": "part", "amount": "{cause:c1}",
                                                    "remaining": "{remaining:c1}"}])
        self.assertEqual((values["cause:c1"], values["remaining:c1"]), ("EUR 59.90", "EUR 19.90"))

    def test_the_template_says_it_too_when_the_ai_is_not_available(self):
        drafts = draft_tones(self.result, None, None, [{"lineIds": ["packaging", "delivery"]}])
        self.assertIn("“packaging” and “delivery” add up to the full difference of EUR 79.80.", drafts["tones"]["neutral"])
        drafts = draft_tones(self.result, None, None, [{"lineIds": ["delivery"]}])
        self.assertIn("“delivery” accounts for EUR 59.90 of the EUR 79.80 difference.", drafts["tones"]["neutral"])
        self.assertIn("the remaining EUR 19.90?", drafts["tones"]["neutral"])

    def test_an_ai_version_may_use_the_cause_placeholders(self):
        answer = {tone: "The delivery line accounts for {cause:c1} of the {difference} difference; what makes up the remaining {remaining:c1}?"
                  for tone in ("warm", "neutral", "direct")}
        with patch("billshield_core.message_ai.post_chat", return_value=reply(answer)):
            drafts = draft_tones(self.result, "k", None, [{"lineIds": ["delivery"]}])
        self.assertEqual(drafts["tones"]["neutral"],
                         "The delivery line accounts for EUR 59.90 of the EUR 79.80 difference; what makes up the remaining EUR 19.90?")
