"""Deterministic search for lines or groups that exactly account for a difference.

An exact match is checked arithmetic, not proof of why the provider charged it.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

from .engine import CalculationOutcome
from .models import BillCase

MAX_SUBSET = 4
MAX_LINES = 24
MAX_REPORTED = 5


@dataclass(frozen=True)
class ExactMatch:
    kind: str  # equals_expected | equals_difference | equals_total_gap
    amount_minor: int
    line_ids: tuple[str, ...]
    group_label: str | None = None


def _matches(case: BillCase, outcome: CalculationOutcome, kind: str, target: int) -> tuple[list[ExactMatch], bool]:
    found: list[ExactMatch] = []
    seen: set[frozenset[str]] = set()
    for group in outcome.calculations:
        if group.result_minor == target:
            found.append(ExactMatch(kind, target, group.operand_line_ids, group.label))
            seen.add(frozenset(group.operand_line_ids))
    if found:
        # A whole confirmed group is stronger than a coincidental combination of single lines.
        return found[:MAX_REPORTED], len(found) > MAX_REPORTED
    amounts = {line.id: line.amount_minor for line in case.lines}
    summed = list(case.total_line_ids)
    if len(summed) <= MAX_LINES:
        for size in range(1, min(MAX_SUBSET, len(summed)) + 1):
            for subset in combinations(summed, size):
                if sum(amounts[line_id] for line_id in subset) == target and frozenset(subset) not in seen:
                    seen.add(frozenset(subset))
                    found.append(ExactMatch(kind, target, subset))
    # Too many different combinations means the arithmetic alone cannot single out a cause.
    return found[:MAX_REPORTED], len(found) > MAX_REPORTED


def find_exact_explanations(case: BillCase, outcome: CalculationOutcome) -> tuple[tuple[ExactMatch, ...], bool]:
    targets: list[tuple[str, int]] = []
    if outcome.arithmetic_status == "mismatch" and case.displayed_total_minor is not None:
        gap = outcome.calculated_total_minor - case.displayed_total_minor
        if gap:
            targets.append(("equals_total_gap", gap))
    if case.expected_minor is not None and outcome.difference_minor:
        targets.extend([("equals_expected", case.expected_minor), ("equals_difference", outcome.difference_minor)])
    matches: list[ExactMatch] = []
    ambiguous = False
    for kind, target in targets:
        found, too_many = _matches(case, outcome, kind, target)
        matches.extend(found)
        ambiguous = ambiguous or too_many
    return tuple(matches), ambiguous
