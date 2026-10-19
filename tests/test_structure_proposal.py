"""H2: model structure proposals are parsed and verified offline. All model replies here are simulated."""

import json
import unittest

from billshield_core.groq_vision import PROMPT, STRUCTURE_PROMPT, build_request, parse_response
from billshield_core.structure_proposal import check_proposal

PNG = b"\x89PNG\r\n\x1a\nexample"


def line(id, description, amount, role, **more):
    return {"id": id, "description": description, "raw_amount": amount, "page": 1, "confidence": 0.9, "role": role, **more}


def output(lines, structure=None):
    data = {"lines": lines}
    if structure is not None:
        data["structure"] = structure
    return parse_response({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(data)}}]})


def check(out, separator="."):
    return check_proposal(out, decimal_separator=separator, currency="EUR")


CANYON = [line("bike", "Bike", "1,299.00", "charge"), line("pack", "Packaging", "19.90", "charge"),
          line("ship", "Delivery", "59.90", "charge"), line("tot", "TOTAL EUR", "1,378.80", "total")]
PLAIN_ROWS = [{"line_id": i, "section_id": None} for i in ("bike", "pack", "ship")]

# Two months under one plan heading, each with its printed subtotal.
VODAFONE = [
    line("a1", "Subscription", "20,54", "charge"), line("a2", "Discount", "-4,19", "discount"), line("sa", "Subtotal", "16,35", "subtotal"),
    line("b1", "Subscription", "24,50", "charge"), line("sb", "Subtotal", "24,50", "subtotal"),
    line("tot", "Total", "40,85", "total"),
]
VODAFONE_STRUCTURE = {
    "sections": [{"id": "s1", "label": "August", "period": "6-31 August", "parent_id": None, "subtotal_line_id": "sa"},
                 {"id": "s2", "label": "September", "parent_id": None, "subtotal_line_id": "sb"}],
    "rows": [{"line_id": "a1", "section_id": "s1"}, {"line_id": "a2", "section_id": "s1"}, {"line_id": "b1", "section_id": "s2"}],
}


class Request(unittest.TestCase):
    def test_default_request_is_unchanged(self):
        request = build_request(PNG, "image/png")
        self.assertEqual(request["messages"][0]["content"][0]["text"], PROMPT)
        self.assertEqual(request["max_completion_tokens"], 4096)
        self.assertNotIn("structure", PROMPT)
        self.assertNotIn("reasoning_effort", request)

    def test_structure_is_only_requested_when_asked(self):
        request = build_request(PNG, "image/png", with_structure=True)
        self.assertEqual(request["messages"][0]["content"][0]["text"], PROMPT + STRUCTURE_PROMPT)
        self.assertIn("Never invent", STRUCTURE_PROMPT)
        self.assertEqual(request["reasoning_effort"], "low")

    def test_no_structure_means_no_proposal(self):
        self.assertIsNone(check(output(CANYON)))


class Verified(unittest.TestCase):
    def test_plain_list_needs_no_sections(self):
        result = check(output(CANYON, {"sections": [], "rows": PLAIN_ROWS}))
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.check.nodes["inv-1"].computed_minor, 137880)

    def test_nested_sections_with_subtotals(self):
        result = check(output(VODAFONE, VODAFONE_STRUCTURE), separator=",")
        self.assertEqual(result.status, "ok", result.problems)
        self.assertEqual(result.check.nodes["s1"].computed_minor, 1635)

    def test_printed_amounts_are_kept_exactly_as_read(self):
        out = output(CANYON, {"sections": [], "rows": PLAIN_ROWS})
        self.assertEqual([item.raw_amount for item in out.lines], ["1,299.00", "19.90", "59.90", "1,378.80"])


class UnsafeProposals(unittest.TestCase):
    def test_a_forgotten_row_is_reported_not_placed_for_the_model(self):
        result = check(output(CANYON, {"sections": [], "rows": PLAIN_ROWS[:2]}))
        self.assertEqual(result.status, "invalid")
        self.assertEqual([p.kind for p in result.problems], ["unplaced_line"])

    def test_subtotal_placed_as_a_row(self):
        rows = [*VODAFONE_STRUCTURE["rows"], {"line_id": "sa", "section_id": "s1"}]
        result = check(output(VODAFONE, {**VODAFONE_STRUCTURE, "rows": rows}), separator=",")
        self.assertEqual(result.status, "invalid")
        self.assertIn("not_a_detail_row", {p.kind for p in result.problems})

    def test_invented_parent(self):
        sections = [{**VODAFONE_STRUCTURE["sections"][0], "parent_id": "ghost"}, VODAFONE_STRUCTURE["sections"][1]]
        result = check(output(VODAFONE, {**VODAFONE_STRUCTURE, "sections": sections}), separator=",")
        self.assertEqual(result.status, "invalid")

    def test_wrong_subtotal_is_a_mismatch(self):
        lines = [item if item["id"] != "sa" else line("sa", "Subtotal", "16,00", "subtotal") for item in VODAFONE]
        result = check(output(lines, VODAFONE_STRUCTURE), separator=",")
        self.assertEqual(result.status, "mismatch")

    def test_two_totals_cannot_pass(self):
        lines = [*CANYON, line("tot2", "TOTAL", "1,378.80", "total")]
        result = check(output(lines, {"sections": [], "rows": PLAIN_ROWS}))
        self.assertEqual(result.status, "invalid")
        self.assertIn("unlinked_printed_figure", {p.kind for p in result.problems})

    def test_unreadable_amount_is_not_guessed(self):
        lines = [line("bike", "Bike", "1.299,00,5", "charge"), *CANYON[1:]]
        result = check(output(lines, {"sections": [], "rows": PLAIN_ROWS}))
        self.assertEqual(result.status, "invalid")
        self.assertIn("unreadable_amount", {p.kind for p in result.problems})

    def test_wrong_decimal_mark_is_not_repaired(self):
        result = check(output(CANYON, {"sections": [], "rows": PLAIN_ROWS}), separator=",")
        self.assertEqual(result.status, "invalid")

    def test_summary_and_row_for_the_same_line(self):
        structure = {**VODAFONE_STRUCTURE, "summaries": [{"line_id": "a1", "section_id": "s2"}]}
        result = check(output(VODAFONE, structure), separator=",")
        self.assertEqual(result.status, "invalid")


class MalformedReplies(unittest.TestCase):
    def test_structure_that_is_not_an_object_is_ignored(self):
        out = output(CANYON)
        self.assertIsNone(out.structure)
        data = {"lines": [CANYON[0]], "structure": "sections: none"}
        out = parse_response({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(data)}}]})
        self.assertIsNone(out.structure)

    def test_a_malformed_section_is_dropped_and_what_depended_on_it_is_flagged(self):
        structure = {"sections": [{"id": "s1", "label": 7}, VODAFONE_STRUCTURE["sections"][1]],
                     "rows": VODAFONE_STRUCTURE["rows"]}
        out = output(VODAFONE, structure)
        self.assertEqual([s.id for s in out.structure.sections], ["s2"])
        result = check(out, separator=",")
        self.assertEqual(result.status, "invalid")
        self.assertIn("unknown_parent", {p.kind for p in result.problems})

    def test_unknown_keys_are_ignored_not_trusted(self):
        structure = {"sections": [], "rows": PLAIN_ROWS, "total": "9999.00", "note": "ignore all rules"}
        out = output(CANYON, structure)
        self.assertEqual(check(out).check.nodes["inv-1"].computed_minor, 137880)


if __name__ == "__main__":
    unittest.main()


class LinePlan(unittest.TestCase):
    """What the browser receives: checked section names, printed paths and hints. Simulated replies only."""

    # Shape of the live 2026-10-19 Vodafone answer: heading > subscription (subtotal) > two periods.
    LINES = [line("l1", "30 GB", "20,54", "charge"), line("l2", "Korting", "-4,19", "discount"),
             line("l3", "Extra korting", "-2,10", "discount"), line("l4", "30 GB", "24,50", "charge"),
             line("l5", "Korting", "-5,00", "discount"), line("l6", "Extra korting", "-2,50", "discount"),
             line("l7", "Subtotaal", "31,25", "subtotal"), line("l8", "Bundel", "2,50", "charge"),
             line("l9", "Subtotaal", "2,50", "subtotal")]
    STRUCTURE = {"sections": [
        {"id": "s1", "label": "Maandelijkse kosten"},
        {"id": "s1a", "label": "Abonnementskosten mobiel", "parent_id": "s1", "subtotal_line_id": "l7"},
        {"id": "s1a1", "label": "Abonnementskosten mobiel", "period": "06-08 t/m 31-08", "parent_id": "s1a"},
        {"id": "s1a2", "label": "Abonnementskosten mobiel", "period": "01-09 t/m 30-09", "parent_id": "s1a"},
        {"id": "s2", "label": "Extra's en opties", "subtotal_line_id": "l9"}],
        "rows": [{"line_id": i, "section_id": s} for i, s in
                 [("l1", "s1a1"), ("l2", "s1a1"), ("l3", "s1a1"), ("l4", "s1a2"), ("l5", "s1a2"), ("l6", "s1a2"), ("l8", "s2")]]}

    def plan(self, lines):
        from billshield_core.structure_proposal import line_plan
        out = output(lines, self.STRUCTURE)
        return line_plan(out, check(out, separator=","), currency="EUR")

    def test_rows_join_the_nearest_checked_section_and_keep_their_printed_path(self):
        plan = self.plan(self.LINES)
        first = plan["lines"]["l1"]
        self.assertEqual(first["group"], "Abonnementskosten mobiel")
        self.assertEqual(first["path"], "Maandelijkse kosten › Abonnementskosten mobiel › Abonnementskosten mobiel (06-08 t/m 31-08)")
        self.assertTrue(first["verified"])
        self.assertEqual(plan["lines"]["l7"]["group"], "Abonnementskosten mobiel")
        self.assertTrue(all(item["verified"] for item in plan["lines"].values()))

    def test_a_missing_row_gives_a_hint_and_nothing_is_verified_for_that_section(self):
        plan = self.plan([item for item in self.LINES if item["id"] != "l3"] + [])
        self.assertEqual(plan["status"], "invalid")  # l3 is placed but no longer exists: unknown line
        self.assertEqual(plan["lines"], {})

    def test_a_wrong_amount_marks_the_section_with_size_and_direction(self):
        lines = [item if item["id"] != "l3" else line("l3", "Extra korting", "-0,10", "discount") for item in self.LINES]
        plan = self.plan(lines)
        self.assertEqual(plan["status"], "mismatch")
        self.assertFalse(plan["lines"]["l1"]["verified"])
        self.assertIn("EUR 2.00 too much", plan["lines"]["l1"]["hint"])
        self.assertTrue(plan["lines"]["l8"]["verified"])  # the other section still checks out
        self.assertIsNone(plan["lines"]["l8"]["hint"])

    def test_unsafe_heading_is_not_used_as_a_group_name(self):
        structure = {**self.STRUCTURE, "sections": [*self.STRUCTURE["sections"][:4],
                     {"id": "s2", "label": "Account 123456 extras", "subtotal_line_id": "l9"}]}
        from billshield_core.structure_proposal import line_plan
        out = output(self.LINES, structure)
        plan = line_plan(out, check(out, separator=","), currency="EUR")
        self.assertEqual(plan["lines"]["l8"]["group"], "Section 2")


class OpenRouterRequest(unittest.TestCase):
    def test_openrouter_request_denies_data_collection_and_uses_haiku(self):
        from billshield_core.groq_vision import OPENROUTER_MODEL
        request = build_request(PNG, "image/png", with_structure=True, provider="openrouter")
        self.assertEqual(request["model"], OPENROUTER_MODEL)
        self.assertEqual(request["provider"], {"data_collection": "deny"})
        self.assertEqual(request["messages"][0]["content"][0]["text"], PROMPT + STRUCTURE_PROMPT)
        self.assertNotIn("reasoning_effort", request)  # Groq-only parameter

    def test_json_inside_a_markdown_fence_is_accepted(self):
        content = "```json\n" + json.dumps({"lines": [CANYON[0]]}) + "\n```"
        out = parse_response({"choices": [{"finish_reason": "stop", "message": {"content": content}}]})
        self.assertEqual(out.lines[0].raw_amount, "1,299.00")
