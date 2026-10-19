import unittest

from pydantic import ValidationError

from backend.billshield_core.confirmation import Confirmation, confirm_lines
from backend.billshield_core.extraction import (
    Bounds,
    CandidateLine,
    DocumentRead,
    ExtractionOutput,
    SourceToken,
    validate_text_grounding,
)
from backend.billshield_core.source_marking import highlight_svg


def candidate_output() -> ExtractionOutput:
    return ExtractionOutput(
        provider="Example provider",
        document_kind="invoice",
        currency="EUR",
        displayed_total_raw="33.75",
        lines=(
            CandidateLine(
                id="line-total",
                description="Invoice total",
                raw_amount="33.75",
                currency="EUR",
                page=1,
                bounds=Bounds(x0=0.5, top=0.7, x1=0.9, bottom=0.8),
                source_token_ids=("p1-w1",),
                confidence=0.96,
            ),
        ),
    )


class ExtractionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.document = DocumentRead(
            page_count=1,
            tokens=(
                SourceToken(
                    id="p1-w1",
                    page=1,
                    text="33.75",
                    bounds=Bounds(x0=0.5, top=0.7, x1=0.9, bottom=0.8),
                ),
            ),
        )

    def test_bounds_must_be_ordered(self) -> None:
        with self.assertRaises(ValidationError):
            Bounds(x0=0.8, top=0.1, x1=0.2, bottom=0.2)

    def test_unknown_model_token_reference_is_rejected(self) -> None:
        output = candidate_output().model_copy(
            update={
                "lines": (
                    candidate_output().lines[0].model_copy(update={"source_token_ids": ("invented",)}),
                )
            }
        )
        with self.assertRaisesRegex(ValueError, "unknown tokens"):
            validate_text_grounding(output, self.document)

    def test_confirmation_parses_amount_only_after_explicit_confirmation(self) -> None:
        confirmed = confirm_lines(
            candidate_output(),
            (
                Confirmation(
                    candidate_id="line-total",
                    confirmed=True,
                    description="Invoice total",
                    raw_amount="33.75",
                    currency="EUR",
                ),
            ),
        )
        self.assertEqual(confirmed[0].amount_minor, 3375)
        self.assertFalse(confirmed[0].corrected)

    def test_correction_is_recorded(self) -> None:
        confirmed = confirm_lines(
            candidate_output(),
            (
                Confirmation(
                    candidate_id="line-total",
                    confirmed=True,
                    description="Corrected total",
                    raw_amount="34.75",
                    currency="EUR",
                ),
            ),
        )
        self.assertEqual(confirmed[0].amount_minor, 3475)
        self.assertTrue(confirmed[0].corrected)

    def test_unconfirmed_candidate_cannot_enter_calculations(self) -> None:
        with self.assertRaisesRegex(ValueError, "must be corrected"):
            confirm_lines(
                candidate_output(),
                (
                    Confirmation(
                        candidate_id="line-total",
                        confirmed=False,
                        description="Invoice total",
                        raw_amount="33.75",
                        currency="EUR",
                    ),
                ),
            )

    def test_highlight_svg_uses_candidate_bounds(self) -> None:
        svg = highlight_svg(candidate_output().lines, page=1, width=100, height=200)
        self.assertIn('x="50.00"', svg)
        self.assertIn('y="140.00"', svg)
        self.assertIn("line-total", svg)


if __name__ == "__main__":
    unittest.main()
