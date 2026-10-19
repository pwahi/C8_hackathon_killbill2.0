"""Typed, dependency-free contracts for sanitized BillShield fixtures."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


Verdict = Literal["verified_mismatch", "unexplained", "checks_passed"]
ArithmeticStatus = Literal["checks_passed", "mismatch"]
ComparisonStatus = Literal[
    "not_checked", "matches_expectation", "unresolved", "mismatches_expectation"
]


@dataclass(frozen=True)
class LineItem:
    id: str
    label: str
    amount_minor: int
    currency: str
    source_ref: str
    period: str | None = None


@dataclass(frozen=True)
class Reconciliation:
    id: str
    label: str
    line_ids: tuple[str, ...]
    # None means "calculated for explanation only": no printed figure to check against.
    expected_minor: int | None
    printed_line_id: str | None = None


@dataclass(frozen=True)
class DraftSpec:
    template: Literal[
        "period_clarification",
        "fee_disclosure",
        "checks_passed_summary",
        "quote_difference",
        "arithmetic_mismatch",
    ]
    bindings: dict[str, Any]


@dataclass(frozen=True)
class BillCase:
    schema_version: int
    case_id: str
    provider: str
    document_kind: str
    currency: str
    # None when the document has no single printed grand total (e.g. an invoice bundle).
    displayed_total_minor: int | None
    expected_minor: int | None
    expectation_source: str | None
    comparison_evidence_verified: bool
    lines: tuple[LineItem, ...]
    total_line_ids: tuple[str, ...]
    reconciliations: tuple[Reconciliation, ...]
    missing_evidence: tuple[str, ...]
    draft: DraftSpec
    displayed_total_line_id: str | None = None


@dataclass(frozen=True)
class Calculation:
    id: str
    label: str
    operand_line_ids: tuple[str, ...]
    operand_amounts_minor: tuple[int, ...]
    result_minor: int
    expected_minor: int | None
    matches: bool | None
    formula: str


@dataclass(frozen=True)
class NumericFact:
    name: str
    amount_minor: int
    source_line_ids: tuple[str, ...]
    derivation: str


@dataclass(frozen=True)
class DraftResult:
    text: str
    numeric_facts: tuple[NumericFact, ...]
    supporting_line_ids: tuple[str, ...]


@dataclass(frozen=True)
class AnalysisResult:
    case_id: str
    verdict: Verdict
    arithmetic_status: ArithmeticStatus
    comparison_status: ComparisonStatus
    calculated_total_minor: int
    displayed_total_minor: int | None
    difference_minor: int | None
    total_formula: str
    calculations: tuple[Calculation, ...]
    missing_evidence: tuple[str, ...]
    draft: DraftResult
