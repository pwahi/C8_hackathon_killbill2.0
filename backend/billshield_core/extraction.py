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


class ExtractionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    provider: str | None = Field(default=None, max_length=200)
    document_kind: str = Field(default="unknown", max_length=100)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    displayed_total_raw: str | None = Field(default=None, max_length=50)
    lines: tuple[CandidateLine, ...]
    warnings: tuple[str, ...] = ()


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
