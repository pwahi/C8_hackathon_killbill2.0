"""Human confirmation boundary between model candidates and trusted calculations."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .extraction import Bounds, CandidateLine, ExtractionOutput
from .money import parse_major_to_minor


class Confirmation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    candidate_id: str
    confirmed: bool
    description: str = Field(min_length=1, max_length=300)
    raw_amount: str | None = Field(default=None, max_length=50)
    currency: str = Field(min_length=3, max_length=3)
    decimal_separator: str = "."


class ConfirmedLine(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    description: str
    amount_minor: int
    currency: str
    page: int
    bounds: Bounds | None
    source_token_ids: tuple[str, ...]
    corrected: bool


def confirm_lines(
    extraction: ExtractionOutput,
    confirmations: tuple[Confirmation, ...],
) -> tuple[ConfirmedLine, ...]:
    candidates = {line.id: line for line in extraction.lines}
    supplied = {item.candidate_id: item for item in confirmations}
    if len(supplied) != len(confirmations):
        raise ValueError("each candidate may be confirmed only once")
    if set(supplied) != set(candidates):
        missing = set(candidates) - set(supplied)
        unknown = set(supplied) - set(candidates)
        raise ValueError(f"confirmation set mismatch; missing={sorted(missing)}, unknown={sorted(unknown)}")

    confirmed: list[ConfirmedLine] = []
    for candidate_id, candidate in candidates.items():
        decision = supplied[candidate_id]
        if not decision.confirmed:
            raise ValueError(f"candidate {candidate_id} must be corrected or explicitly removed")
        if decision.raw_amount is None:
            raise ValueError(f"candidate {candidate_id} has no confirmed amount")
        currency = decision.currency.upper()
        if extraction.currency and currency != extraction.currency.upper():
            raise ValueError(f"candidate {candidate_id} currency differs from document currency")
        amount_minor = parse_major_to_minor(
            decision.raw_amount, decimal_separator=decision.decimal_separator
        )
        corrected = (
            candidate.raw_amount != decision.raw_amount
            or candidate.description != decision.description
            or (candidate.currency or "").upper() != currency
        )
        confirmed.append(
            ConfirmedLine(
                id=candidate_id,
                description=decision.description,
                amount_minor=amount_minor,
                currency=currency,
                page=candidate.page,
                bounds=candidate.bounds,
                source_token_ids=candidate.source_token_ids,
                corrected=corrected,
            )
        )
    return tuple(confirmed)
