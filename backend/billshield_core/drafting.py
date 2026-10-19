"""Controlled message templates whose numeric values come only from code facts."""

from __future__ import annotations

from collections.abc import Mapping

from .money import format_minor
from .models import BillCase, Calculation, DraftResult, NumericFact


def _join(parts: list[str]) -> str:
    """'A', 'A and B', 'A, B and C'."""
    return parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} and {parts[-1]}"


class DraftError(ValueError):
    """Raised when a draft binding is missing or unsafe."""


def _group(groups: Mapping[str, Calculation], group_id: str) -> Calculation:
    try:
        return groups[group_id]
    except KeyError as exc:
        raise DraftError(f"draft references unknown reconciliation: {group_id}") from exc


def _line(case: BillCase, line_id: str):
    try:
        return next(line for line in case.lines if line.id == line_id)
    except StopIteration as exc:
        raise DraftError(f"draft references unknown line: {line_id}") from exc


def build_draft(
    case: BillCase,
    calculations: tuple[Calculation, ...],
    calculated_total_minor: int,
    difference_minor: int | None,
) -> DraftResult:
    groups = {calculation.id: calculation for calculation in calculations}
    bindings = case.draft.bindings
    money = lambda amount: format_minor(amount, case.currency)
    facts: list[NumericFact] = [
        NumericFact("calculated_total", calculated_total_minor, case.total_line_ids, "sum(total_line_ids)")
    ]
    support: set[str] = set(case.total_line_ids)

    if case.draft.template == "period_clarification":
        current = _group(groups, bindings["current_period_group"])
        prior = _group(groups, bindings["prior_period_group"])
        facts.extend(
            [
                NumericFact("current_period", current.result_minor, current.operand_line_ids, current.formula),
                NumericFact("prior_period", prior.result_minor, prior.operand_line_ids, prior.formula),
            ]
        )
        text = (
            f"Hello, I have a question about my invoice. It totals {money(calculated_total_minor)}, "
            f"including {money(current.result_minor)} for {bindings['current_period_label']} and "
            f"{money(prior.result_minor)} for {bindings['prior_period_label']}. Please explain why "
            f"the earlier period appears here and confirm whether it was covered by a previous payment."
        )
    elif case.draft.template == "fee_disclosure":
        if case.expected_minor is None:
            raise DraftError("fee_disclosure requires an expected amount")
        fee_lines = tuple(_line(case, line_id) for line_id in bindings["fee_line_ids"])
        facts.append(NumericFact("expected", case.expected_minor, (), "user-reported expectation"))
        for line in fee_lines:
            facts.append(NumericFact(line.id, line.amount_minor, (line.id,), "confirmed source line"))
        fees_text = _join([f"{money(line.amount_minor)} {line.label}" for line in fee_lines])
        text = (
            f"Hello, I expected {money(case.expected_minor)}, but the document totals "
            f"{money(calculated_total_minor)}, including {fees_text}. Please explain where these fees "
            "were disclosed and whether an adjustment is available."
        )
    elif case.draft.template == "checks_passed_summary":
        if case.expected_minor is None:
            text = (
                f"No arithmetic discrepancy was found in the displayed amounts, which total "
                f"{money(calculated_total_minor)}. Please confirm whether this matched the total shown "
                "before payment; the expected checkout amount was not provided."
            )
        elif difference_minor == 0:
            facts.append(NumericFact("expected", case.expected_minor, (), "user-reported expectation"))
            text = (
                f"No arithmetic discrepancy was found in the displayed amounts, which total "
                f"{money(calculated_total_minor)}. This matches the expected amount of "
                f"{money(case.expected_minor)} that you entered."
            )
        else:
            raise DraftError("checks_passed_summary cannot describe a difference from the expectation")
    elif case.draft.template == "arithmetic_mismatch":
        failed = [calculation for calculation in calculations if calculation.matches is False]
        parts: list[str] = []
        if case.displayed_total_minor is not None and calculated_total_minor != case.displayed_total_minor:
            printed_ids = (case.displayed_total_line_id,) if case.displayed_total_line_id else ()
            gap = abs(calculated_total_minor - case.displayed_total_minor)
            facts.extend(
                [
                    NumericFact("printed_total", case.displayed_total_minor, printed_ids, "confirmed printed total"),
                    NumericFact("total_gap", gap, case.total_line_ids + printed_ids, "|calculated total - printed total|"),
                ]
            )
            parts.append(
                f"the listed charges add up to {money(calculated_total_minor)}, but the printed total is "
                f"{money(case.displayed_total_minor)}, a difference of {money(gap)}"
            )
        printed_lines = {group.id: group.printed_line_id for group in case.reconciliations}
        for calculation in failed:
            printed_ids = (printed_lines[calculation.id],) if printed_lines.get(calculation.id) else ()
            facts.extend(
                [
                    NumericFact(f"{calculation.id}_sum", calculation.result_minor, calculation.operand_line_ids, calculation.formula),
                    NumericFact(f"{calculation.id}_printed", calculation.expected_minor, printed_ids, "confirmed printed subtotal"),
                ]
            )
            parts.append(
                f"the {calculation.label} lines add up to {money(calculation.result_minor)}, but the printed "
                f"subtotal is {money(calculation.expected_minor)}"
            )
        for row in bindings.get("row_failures", []):
            facts.extend(
                [
                    NumericFact(f"row_{row['line_id']}_computed", row["computed_minor"], (row["line_id"],), row["formula"]),
                    NumericFact(f"row_{row['line_id']}_printed", row["printed_minor"], (row["line_id"],), "confirmed printed row value"),
                ]
            )
            columns = "price and discount" if row["what"] == "taxable_value" else "price, discount and tax"
            parts.append(
                f"for {row['label']} the printed {columns} work out to {money(row['computed_minor'])}, "
                f"but the bill shows {money(row['printed_minor'])}"
            )
        if not parts:
            raise DraftError("arithmetic_mismatch requires a failed total, subtotal or row check")
        text = (
            f"Hello, I checked the amounts on my bill and {'; and '.join(parts)}. "
            "Please explain or correct this difference."
        )
    elif case.draft.template == "quote_difference":
        if case.expected_minor is None or difference_minor is None:
            raise DraftError("quote_difference requires expected and difference amounts")
        questioned = tuple(_line(case, line_id) for line_id in bindings["questioned_line_ids"])
        facts.extend(
            [
                NumericFact("expected", case.expected_minor, (), "user-reported expectation"),
                NumericFact("difference", difference_minor, case.total_line_ids, "calculated total - expectation"),
            ]
        )
        for line in questioned:
            facts.append(NumericFact(line.id, line.amount_minor, (line.id,), "confirmed source line"))
        opening = (
            f"Hello, I expected to pay {money(case.expected_minor)}, but the final amount was "
            f"{money(calculated_total_minor)}, a difference of {money(difference_minor)}."
        )
        if questioned:
            fees_text = _join([f"{money(line.amount_minor)} {line.label}" for line in questioned])
            text = (
                f"{opening} The breakdown includes {fees_text}. Please explain what these fees cover, "
                "how they apply, and which charges account for the difference from the price I expected."
            )
        else:
            text = f"{opening} Please explain which charges account for the difference from the price I expected."
    else:  # pragma: no cover - loader/type contract guards current fixtures
        raise DraftError(f"unsupported draft template: {case.draft.template}")

    for fact in facts:
        support.update(fact.source_line_ids)
    return DraftResult(text=text, numeric_facts=tuple(facts), supporting_line_ids=tuple(sorted(support)))
