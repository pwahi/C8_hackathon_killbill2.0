"""Pure deterministic reconciliation, comparison, and verdict selection."""

from __future__ import annotations

from dataclasses import dataclass

from .drafting import build_draft
from .models import AnalysisResult, ArithmeticStatus, BillCase, Calculation, ComparisonStatus, Verdict


def _formula(amounts: tuple[int, ...], result: int) -> str:
    expression = " + ".join(str(amount) for amount in amounts).replace("+ -", "- ")
    return f"{expression} = {result}"


@dataclass(frozen=True)
class CalculationOutcome:
    """Every code-owned number and status, before any message is drafted."""

    verdict: Verdict
    arithmetic_status: ArithmeticStatus
    comparison_status: ComparisonStatus
    calculated_total_minor: int
    difference_minor: int | None
    total_formula: str
    calculations: tuple[Calculation, ...]


def calculate(case: BillCase) -> CalculationOutcome:
    lines = {line.id: line for line in case.lines}
    total_amounts = tuple(lines[line_id].amount_minor for line_id in case.total_line_ids)
    calculated_total = sum(total_amounts)
    calculations = []
    for group in case.reconciliations:
        amounts = tuple(lines[line_id].amount_minor for line_id in group.line_ids)
        result = sum(amounts)
        calculations.append(
            Calculation(
                id=group.id,
                label=group.label,
                operand_line_ids=group.line_ids,
                operand_amounts_minor=amounts,
                result_minor=result,
                expected_minor=group.expected_minor,
                # No printed figure means the group is explained, not checked.
                matches=None if group.expected_minor is None else result == group.expected_minor,
                formula=_formula(amounts, result),
            )
        )
    checked = [calculation.matches for calculation in calculations if calculation.matches is not None]
    if case.displayed_total_minor is None and not checked:
        raise ValueError("no printed total or subtotal is available to check the arithmetic")
    total_ok = case.displayed_total_minor is None or calculated_total == case.displayed_total_minor
    arithmetic_ok = total_ok and all(checked)

    if case.expected_minor is None:
        difference = None
        comparison_status = "not_checked"
    else:
        difference = calculated_total - case.expected_minor
        if difference == 0:
            comparison_status = "matches_expectation"
        elif case.comparison_evidence_verified:
            comparison_status = "mismatches_expectation"
        else:
            comparison_status = "unresolved"

    if not arithmetic_ok or comparison_status == "mismatches_expectation":
        verdict = "verified_mismatch"
    elif comparison_status == "unresolved":
        verdict = "unexplained"
    else:
        verdict = "checks_passed"

    return CalculationOutcome(
        verdict=verdict,
        arithmetic_status="checks_passed" if arithmetic_ok else "mismatch",
        comparison_status=comparison_status,
        calculated_total_minor=calculated_total,
        difference_minor=difference,
        total_formula=_formula(total_amounts, calculated_total),
        calculations=tuple(calculations),
    )


def analyze_case(case: BillCase) -> AnalysisResult:
    outcome = calculate(case)
    draft = build_draft(case, outcome.calculations, outcome.calculated_total_minor, outcome.difference_minor)
    return AnalysisResult(
        case_id=case.case_id,
        verdict=outcome.verdict,
        arithmetic_status=outcome.arithmetic_status,
        comparison_status=outcome.comparison_status,
        calculated_total_minor=outcome.calculated_total_minor,
        displayed_total_minor=case.displayed_total_minor,
        difference_minor=outcome.difference_minor,
        total_formula=outcome.total_formula,
        calculations=outcome.calculations,
        missing_evidence=case.missing_evidence,
        draft=draft,
    )
