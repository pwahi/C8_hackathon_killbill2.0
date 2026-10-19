"""Stage 2 contracts for untrusted extraction candidates and source locations."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Bounds(BaseModel):
    """Top-left normalized coordinates in the closed interval 0..1."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    x0: float = Field(ge=0, le=1)
    top: float = Field(ge=0, le=1)
    x1: float = Field(ge=0, le=1)
    bottom: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def ordered(self) -> "Bounds":
        if self.x1 <= self.x0 or self.bottom <= self.top:
            raise ValueError("bounds must have positive width and height")
        return self


class SourceToken(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    page: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=500)
    bounds: Bounds


class DocumentRead(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    document_kind: str = "unknown"
    page_count: int = Field(ge=1)
    tokens: tuple[SourceToken, ...]
    warnings: tuple[str, ...] = ()


class RowColumns(BaseModel):
    """Printed columns of one invoice row, kept as raw strings until a person confirms them."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    quantity: str | None = Field(default=None, max_length=20)
    unit_price: str | None = Field(default=None, max_length=50)
    discount: str | None = Field(default=None, max_length=50)
    taxable_value: str | None = Field(default=None, max_length=50)
    taxes: tuple[str, ...] = Field(default=(), max_length=4)


class CandidateLine(BaseModel):
    """A model-proposed line. Amount remains raw text until human confirmation."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    description: str = Field(min_length=1, max_length=300)
    raw_amount: str | None = Field(default=None, max_length=50)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    page: int = Field(ge=1)
    bounds: Bounds | None = None
    source_token_ids: tuple[str, ...] = ()
    confidence: float = Field(ge=0, le=1)
    warning: str | None = Field(default=None, max_length=300)
    # Optional model suggestions only; a person confirms the role and Python checks the arithmetic.
    role: Literal["charge", "discount", "adjustment", "subtotal", "total", "other"] | None = None
    group: str | None = Field(default=None, max_length=60)
    breakdown: RowColumns | None = None
    # The label exactly as printed (any language); description is its plain-English version.
    original_label: str | None = Field(default=None, max_length=300)


_ID = r"^[A-Za-z0-9_-]{1,100}$"


class ProposedSection(BaseModel):
    """Model-proposed heading. Untrusted: structure_proposal re-checks every relation in Python."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str = Field(pattern=_ID)
    label: str = Field(min_length=1, max_length=60)
    period: str | None = Field(default=None, max_length=60)
    parent_id: str | None = Field(default=None, pattern=_ID)
    subtotal_line_id: str | None = Field(default=None, pattern=_ID)


class ProposedRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    line_id: str = Field(pattern=_ID)
    section_id: str | None = Field(default=None, pattern=_ID)


class ProposedSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    line_id: str = Field(pattern=_ID)
    section_id: str = Field(pattern=_ID)


class ProposedStructure(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    sections: tuple[ProposedSection, ...] = Field(default=(), max_length=30)
    rows: tuple[ProposedRow, ...] = Field(default=(), max_length=200)
    summaries: tuple[ProposedSummary, ...] = Field(default=(), max_length=30)


class ExtractionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    provider: str | None = Field(default=None, max_length=200)
    document_kind: str = Field(default="unknown", max_length=100)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    displayed_total_raw: str | None = Field(default=None, max_length=50)
    lines: tuple[CandidateLine, ...]
    warnings: tuple[str, ...] = ()
    # Only present when a structure was requested (H2). Never trusted without verify_structure.
    structure: ProposedStructure | None = None
    # Whole-page reading only: what kind of page this is and the printed document name, both unverified.
    page_kind: Literal["summary", "detail", "invoice", "other"] | None = None
    # The decimal mark the bill prints for money, as reported by the reader; shown to and changeable by the person.
    decimal_mark: Literal[".", ","] | None = None
    invoice_label: str | None = Field(default=None, max_length=80)


def validate_text_grounding(output: ExtractionOutput, document: DocumentRead) -> None:
    """Reject invented token references and impossible pages before confirmation."""

    token_ids = {token.id for token in document.tokens}
    for line in output.lines:
        if line.page > document.page_count:
            raise ValueError(f"candidate {line.id} references missing page {line.page}")
        unknown = set(line.source_token_ids) - token_ids
        if unknown:
            raise ValueError(f"candidate {line.id} references unknown tokens: {sorted(unknown)}")
        if not line.source_token_ids:
            raise ValueError(f"text candidate {line.id} has no source tokens")
