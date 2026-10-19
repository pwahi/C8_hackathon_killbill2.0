"""Message tone: greeting and closing only; amounts untouched; same texts as frontend/tone.mjs."""

import re
import unittest
from unittest.mock import patch

from billshield_core.tone import apply_tone

DRAFT = "Hello, I expected to pay EUR 19.50, but the final amount was EUR 33.75, a difference of EUR 14.25."
EXPECTED = {
    "neutral": DRAFT,
    "warm": "Hello, I hope you are doing well. I expected to pay EUR 19.50, but the final amount was EUR 33.75, "
            "a difference of EUR 14.25. Thank you very much for your help, I appreciate it.",
    "direct": "I expected to pay EUR 19.50, but the final amount was EUR 33.75, a difference of EUR 14.25. I would like "
              "a clear answer and, if a charge turns out to be incorrect, an adjustment. Please reply as soon as possible.",
}


class Tone(unittest.TestCase):
    def test_texts_match_the_browser_twin(self):
        for tone, text in EXPECTED.items():
            self.assertEqual(apply_tone(DRAFT, tone), text)

    def test_no_tone_changes_or_adds_a_number(self):
        numbers = re.findall(r"\d+(?:[.,]\d+)?", DRAFT)
        for tone in EXPECTED:
            self.assertEqual(re.findall(r"\d+(?:[.,]\d+)?", apply_tone(DRAFT, tone)), numbers)

    def test_unknown_tone_is_refused(self):
        with self.assertRaises(ValueError):
            apply_tone(DRAFT, "angry")

    def test_words_changed_are_counted_against_the_chosen_tone(self):
        from billshield_core import store
        calls = []
        def fake_call(method, path, payload=None, token=None, prefer=None):
            calls.append(payload)
            return [{"draft_text": DRAFT}] if method == "GET" else None
        with patch.object(store, "_call", side_effect=fake_call):
            answer = store.record_event("token", "message-1", "sent", EXPECTED["warm"], "warm")
        self.assertEqual(answer["wordsChanged"], 0)


if __name__ == "__main__":
    unittest.main()
