"""Confirmation by exception (PRD_SCALABLE W4): which lines Python accepts without asking the person. No network."""

import json
import unittest

from billshield_core.groq_vision import mark_text_matches, parse_response
from billshield_core.whole_bill import link_pages


def line(id, amount, role, confidence=0.9, warning=None, description="Fee"):
    return {"id": id, "description": description, "raw_amount": amount, "page": 1, "confidence": confidence,
            "role": role, "warning": warning}


def page(lines, rows=None):
    structure = {"sections": [{"id": "s", "label": "Mobile", "subtotal_line_id": "sub"}],
                 "rows": [{"line_id": x, "section_id": "s"} for x in rows]} if rows else None
    data = {"lines": lines, **({"structure": structure} if structure else {})}
    return parse_response({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(data)}}]})


def auto(output, page_text=None):
    output = mark_text_matches(output, page_text)
    plan = link_pages([(1, output)], decimal_separator=",", currency="EUR", api_key=None)
    return {gid.split("-", 1)[1]: entry["autoVerified"] for gid, entry in plan["lines"].items()}


class AutoVerify(unittest.TestCase):
    def test_a_section_that_adds_up_is_accepted_without_asking(self):
        result = auto(page([line("a", "10,00", "charge"), line("b", "5,50", "charge"), line("sub", "15,50", "subtotal"),
                            line("t", "15,50", "total")], rows="ab"))
        self.assertEqual(result, {"a": True, "b": True, "sub": True, "t": True})

    def test_lines_directly_under_a_bill_total_that_adds_up_are_accepted(self):
        # Seen 2026-10-20 (order confirmation without sections): the total checks the lines, so they count.
        result = auto(page([line("a", "1.299,00", "charge"), line("b", "19,90", "charge"), line("t", "1.318,90", "total")]))
        self.assertEqual(result, {"a": True, "b": True, "t": True})
        result = auto(page([line("a", "1.299,00", "charge"), line("b", "19,90", "charge"), line("t", "1.300,00", "total")]))
        self.assertFalse(any(result.values()))

    def test_a_section_that_does_not_add_up_is_asked_about(self):
        result = auto(page([line("a", "10,00", "charge"), line("b", "5,00", "charge"), line("sub", "15,50", "subtotal")],
                           rows="ab"))
        self.assertFalse(any(result.values()))

    def test_discounts_and_minus_signs_are_always_shown_to_the_person(self):
        # A payment read as a discount (Harsh test) adds up just as well, so maths alone may not accept it.
        result = auto(page([line("a", "20,00", "charge"), line("d", "-4,50", "discount"), line("sub", "15,50", "subtotal")],
                           rows="ad"))
        self.assertEqual((result["a"], result["d"], result["sub"]), (True, False, True))

    def test_an_unsure_or_flagged_reading_is_asked_about(self):
        result = auto(page([line("a", "10,00", "charge", confidence=0.6), line("b", "5,50", "charge", warning="faint"),
                            line("sub", "15,50", "subtotal")], rows="ab"))
        self.assertEqual((result["a"], result["b"], result["sub"]), (False, False, True))

    def test_the_pdf_text_layer_can_stand_in_for_the_readers_confidence(self):
        output = page([line("a", "10,00", "charge", confidence=0.6), line("b", "5,50", "charge"),
                       line("sub", "15,50", "subtotal")], rows="ab")
        self.assertTrue(auto(output, "Mobile plan 10,00\nExtra 5,50\nSubtotal 15,50")["a"])
        self.assertFalse(auto(output, "Mobile plan 110,00\nExtra 5,50\nSubtotal 15,50")["a"])


class TextLayerMatch(unittest.TestCase):
    def match(self, amount, text):
        output = mark_text_matches(page([line("a", amount, "charge")]), text)
        return output.lines[0].text_match

    def test_an_amount_is_found_as_printed_whatever_the_language_or_currency(self):
        self.assertTrue(self.match("12,50", "Bedrag € 12,50"))
        self.assertTrue(self.match("AED 1,234.50", "المجموع 1,234.50 د.إ"))
        self.assertTrue(self.match("-0,48", "Klantvoordeel -0,48"))

    def test_part_of_a_longer_number_is_not_a_match(self):
        self.assertFalse(self.match("12,50", "112,50"))
        self.assertFalse(self.match("12,50", "12,505"))
        self.assertFalse(self.match("0,48", "10,48"))
        self.assertFalse(self.match("5", "5"))  # one digit proves nothing

    def test_no_text_layer_marks_nothing_and_the_model_cannot_set_it(self):
        self.assertIsNone(self.match("12,50", None))
        data = {"lines": [{**line("a", "1,00", "charge"), "text_match": True}]}
        output = parse_response({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(data)}}]})
        self.assertIsNone(output.lines[0].text_match)


if __name__ == "__main__":
    unittest.main()
