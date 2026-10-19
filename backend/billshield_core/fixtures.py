"""Load and validate sanitized structured fixture files."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import BillCase, DraftSpec, LineItem, Reconciliation


class FixtureError(ValueError):
    """Raised when a fixture violates the Stage 0 contract."""


def _require_int(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise FixtureError(f"{field} must be an integer minor-unit amount")
    return value


def load_fixture(path: str | Path) -> BillCase:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema_version") != 1:
        raise FixtureError("unsupported fixture schema_version")

    currency = data["currency"]
    if not isinstance(currency, str) or len(currency) != 3 or currency.upper() != currency:
        raise FixtureError("currency must be a three-letter uppercase code")

    lines = tuple(
        LineItem(
            id=item["id"],
            label=item["label"],
            amount_minor=_require_int(item["amount_minor"], f"lines.{item['id']}.amount_minor"),
            currency=item.get("currency", currency),
            source_ref=item["source_ref"],
            period=item.get("period"),
        )
        for item in data["lines"]
    )
    line_ids = [line.id for line in lines]
    if len(line_ids) != len(set(line_ids)):
        raise FixtureError("line IDs must be unique")
    mixed_currency_ids = [line.id for line in lines if line.currency != currency]
    if mixed_currency_ids:
        raise FixtureError(f"mixed-currency lines cannot be combined: {mixed_currency_ids}")
    known_ids = set(line_ids)

    total_line_ids = tuple(data["total_line_ids"])
    if len(total_line_ids) != len(set(total_line_ids)):
        raise FixtureError("total_line_ids cannot contain duplicates")
    reconciliations = tuple(
        Reconciliation(
            id=item["id"],
            label=item["label"],
            line_ids=tuple(item["line_ids"]),
            expected_minor=_require_int(
                item["expected_minor"], f"reconciliations.{item['id']}.expected_minor"
            ),
        )
        for item in data.get("reconciliations", [])
    )
    referenced_ids = set(total_line_ids)
    for reconciliation in reconciliations:
        referenced_ids.update(reconciliation.line_ids)
    unknown = referenced_ids - known_ids
    if unknown:
        raise FixtureError(f"fixture references unknown line IDs: {sorted(unknown)}")
    if not total_line_ids:
        raise FixtureError("total_line_ids cannot be empty")

    expected_raw = data.get("expected_minor")
    expected_minor = None if expected_raw is None else _require_int(expected_raw, "expected_minor")
    draft_data = data["draft"]
    return BillCase(
        schema_version=1,
        case_id=data["case_id"],
        provider=data["provider"],
        document_kind=data["document_kind"],
        currency=currency,
        displayed_total_minor=_require_int(data["displayed_total_minor"], "displayed_total_minor"),
        expected_minor=expected_minor,
        expectation_source=data.get("expectation_source"),
        comparison_evidence_verified=bool(data.get("comparison_evidence_verified", False)),
        lines=lines,
        total_line_ids=total_line_ids,
        reconciliations=reconciliations,
        missing_evidence=tuple(data.get("missing_evidence", [])),
        draft=DraftSpec(template=draft_data["template"], bindings=dict(draft_data.get("bindings", {}))),
    )
