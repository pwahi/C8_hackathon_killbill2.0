"""Confirmed browser review (payload schema 2) -> deterministic case -> analysis and draft.

The browser sends only lines a person explicitly confirmed beside visible source
evidence. This module re-validates everything, owns every amount conversion, and
never guesses decimal marks, signs, roles, or source coordinates (D-024/D-025).
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, replace
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from .drafting import DraftError
from .engine import analyze_case, calculate
from .gap import find_exact_explanations
from .extraction import Bounds
from .models import BillCase, DraftSpec, LineItem, Reconciliation
from .money import format_minor, parse_major_to_minor

Role = Literal["charge", "discount", "adjustment", "subtotal", "total"]
Precision = Literal["exact", "table", "page"]
MessageType = Literal[
    "automatic", "quote_difference", "fee_disclosure", "period_clarification", "checks_passed_summary"
]
# Adjustments are printed corrections such as a round-off line; they may be positive or negative.
SUMMED_ROLES = {"charge", "discount", "adjustment"}
QUESTIONABLE_ROLES = {"charge", "discount"}
CURRENCY_MARKS = {"EUR": ("€", "EUR"), "INR": ("₹", "INR")}

# Same patterns as frontend/extraction/privacy.mjs; Python re-checks rather than trusting the browser.
PRIVATE_PATTERNS = (
    re.compile(r"\b(?:\d[ -]?){13,19}\b"),
    # Identifier words block only when they introduce a number ("customer number", "account 1234", "phone 0612...");
    # on their own they are ordinary bill words ("Customer benefit", "30 GB mobile plan"). "address" always blocks.
    re.compile(r"\baddress\b|\b(?:account|customer|booking|reference|phone|mobile)\s*(?:number|no\.?|nr\.?|id|code)\b"
               r"|\b(?:account|customer|booking|reference|phone|mobile)\s*[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,}", re.IGNORECASE),
    re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", re.IGNORECASE),
    re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"),
)
# Free text from the bill (context notes, PRD_SCALABLE W2) may hold dates and amounts, but never a long number such as
# a phone, customer or account number, in any language: seven digits in a row, or nine spread over spaces and dashes.
LONG_NUMBER = re.compile(r"\d{7,}|(?:\d[ -]?){9,}")


def private_text(text: str) -> bool:
    cleaned = " ".join(str(text).split())
    return bool(LONG_NUMBER.search(cleaned)) or any(pattern.search(cleaned) for pattern in PRIVATE_PATTERNS)


# Labels are copied into the message, so they must not smuggle in amounts code did not check.
# A currency word on its own ("TOTAL EUR") is harmless; a currency next to a number is an amount.
# Owner 2026-10-20 (participant's bill, "Infinity Family 699 Plan"): a plain number is part of many product names
# ("Internet 100 Mbit", "30 GB"), so only what reads as money is refused: a currency sign or code next to a number,
# or a number with two decimals ("59.90", "59,90").
CURRENCY_SIGN = "$\u00a2-\u00a5\u058f\u060b\u07fe\u07ff\u09f2\u09f3\u09fb\u0af1\u0bf9\u0e3f\u17db\u20a0-\u20c0\ufdfc\ufe69\uff04\uffe0\uffe1\uffe5\uffe6"
AMOUNT_IN_LABEL = re.compile(
    rf"[{CURRENCY_SIGN}]\s*\d|\d\s*[{CURRENCY_SIGN}]|\b(?:EUR|INR|Rs)\.?\s*\d|\d\s*(?:EUR|INR|Rs)\b|\d[.,]\d{{2}}(?!\d)",
    re.IGNORECASE,
)
YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
# Grouping must be consistent with the declared decimal mark; anything else is rejected, not guessed.
DOT_DECIMAL = re.compile(r"^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3}|\d+)(?:\.\d{1,2})?$")
COMMA_DECIMAL = re.compile(r"^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$")
# One separator followed by exactly one or two final digits can only be a decimal mark (a thousands
# group always has three digits), so "200,00" on an otherwise point-decimal bill is not a guess.
UNAMBIGUOUS_DECIMAL = re.compile(r"^\d+([.,])\d{1,2}$")
# A number, optionally followed by a printed unit word such as PC, pcs, Nos or kg (the unit is not used).
QUANTITY = re.compile(r"^(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:[A-Za-z]{1,6}\.?)?$")


class ReviewError(ValueError):
    """A confirmed review cannot be analyzed; the message is safe to show the user."""


class _Model(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, alias_generator=to_camel, populate_by_name=True
    )


class SourceEvidence(_Model):
    page: int = Field(ge=1, le=10)
    precision: Precision
    located_by: Literal["pdf_text", "local_ocr", "groq", "user"] | None = None
    # Exact location of this amount. Never a table area.
    bounds: Bounds | None = None
    # Table area the amount was read from. Never presented as the amount's location.
    region: Bounds | None = None

    @model_validator(mode="after")
    def honest_precision(self) -> "SourceEvidence":
        if self.precision == "exact" and (self.bounds is None or self.region is not None):
            raise ValueError("exact evidence needs bounds and no table region")
        if self.precision == "table" and (self.region is None or self.bounds is not None):
            raise ValueError("table evidence needs a region and no exact bounds")
        if self.precision == "page" and (self.bounds is not None or self.region is not None):
            raise ValueError("page evidence cannot carry coordinates")
        if (self.precision == "page") != (self.located_by is None):
            raise ValueError("located_by is required for exact/table evidence and absent for page evidence")
        return self


class RowBreakdown(_Model):
    """Printed columns of one invoice row (all optional). Inspired by EN 16931 and the Indian GST e-invoice:
    quantity x unit price - discount = taxable value; taxable value + taxes = row amount."""

    quantity: str | None = Field(default=None, max_length=20)
    unit_price: str | None = Field(default=None, max_length=40)
    discount: str | None = Field(default=None, max_length=40)
    taxable_value: str | None = Field(default=None, max_length=40)
    taxes: tuple[str, ...] = Field(default=(), max_length=4)


class ConfirmedReviewLine(_Model):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    role: Role
    group: str | None = Field(default=None, max_length=60)
    description: str = Field(min_length=1, max_length=120)
    raw_amount: str = Field(min_length=1, max_length=40)
    extracted_raw_amount: str | None = Field(default=None, max_length=40)
    extractor: Literal["pdf_text", "local_ocr", "groq", "manual"]
    questioned: bool = False
    currency: str = Field(min_length=3, max_length=3)
    source: SourceEvidence
    breakdown: RowBreakdown | None = None


class ConfirmedReview(_Model):
    schema_version: Literal[2]
    currency: Literal["EUR", "INR"]
    decimal_separator: Literal[".", ","]
    expected_amount: str | None = Field(default=None, max_length=40)
    message_type: MessageType = "automatic"
    earlier_period_group: str | None = Field(default=None, max_length=60)
    lines: tuple[ConfirmedReviewLine, ...] = Field(min_length=1, max_length=200)
    # Set only after the person has re-checked printed figures that do not add up.
    printed_figures_rechecked: bool = False


def parse_confirmed_amount(raw: str, *, decimal_separator: str, currency: str) -> int:
    """Strictly parse a confirmed amount. Only a literal currency mark is removed."""

    text = raw.strip().replace("−", "-")
    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative, text = True, text[1:-1].strip()
    if text.startswith("-"):
        negative, text = not negative, text[1:].strip()
    for mark in CURRENCY_MARKS[currency]:
        if text.startswith(mark):
            text = text[len(mark):].strip()
        elif text.endswith(mark):
            text = text[: -len(mark)].strip()
    if text.startswith("-") and not negative:
        negative, text = True, text[1:].strip()
    pattern = DOT_DECIMAL if decimal_separator == "." else COMMA_DECIMAL
    alternative = UNAMBIGUOUS_DECIMAL.fullmatch(text)
    if not pattern.fullmatch(text) and alternative:
        amount = parse_major_to_minor(text, decimal_separator=alternative.group(1))
        return -amount if negative else amount
    if not pattern.fullmatch(text):
        raise ReviewError(
            f"amount {raw!r} does not match the selected decimal mark {decimal_separator!r}. "
            "Check the digits and decimal mark on the bill and correct it; Kill Bill will not guess."
        )
    amount = parse_major_to_minor(text, decimal_separator=decimal_separator)
    return -amount if negative else amount


RATE = {".": re.compile(r"\d+(?:\.\d{1,6})?"), ",": re.compile(r"\d+(?:,\d{1,6})?")}


def parse_rate(raw: str, *, decimal_separator: str, currency: str) -> Decimal:
    """A printed unit price in major units, with up to six decimals (energy bills print rates like 0,11640 per kWh).
    Strict like amounts: only a currency mark and a sign are removed; anything else is refused, never repaired."""
    text = raw.strip().replace("−", "-")
    negative = text.startswith("-")
    text = text.lstrip("-").strip()
    for mark in CURRENCY_MARKS[currency]:
        if text.startswith(mark):
            text = text[len(mark):].strip()
        elif text.endswith(mark):
            text = text[: -len(mark)].strip()
    if text.startswith("-"):
        negative, text = True, text[1:].strip()
    if not RATE[decimal_separator].fullmatch(text):
        try:  # a normal money amount such as 1.499,00 with thousands separators
            return Decimal(parse_confirmed_amount(raw, decimal_separator=decimal_separator, currency=currency)) / 100
        except ReviewError:
            raise ReviewError(f"unit price {raw!r} does not match the selected decimal mark {decimal_separator!r}. "
                              "Check the digits on the bill and correct it; Kill Bill will not guess.") from None
    value = Decimal(text.replace(",", "."))
    return -value if negative else value


def _check_label(text: str, what: str) -> str:
    cleaned = " ".join(text.split())
    if any(pattern.search(cleaned) for pattern in PRIVATE_PATTERNS):
        raise ReviewError(f"{what} {cleaned!r} may contain private data; use a short charge label")
    if AMOUNT_IN_LABEL.search(YEAR.sub("", cleaned)):
        raise ReviewError(
            f"{what} {cleaned!r} contains an amount or currency; labels must be words only "
            "(write dates as words, for example '6-31 August')"
        )
    return cleaned


def _section_key(text: str | None) -> str:
    return re.sub(r"[^\w]", "", (text or "").casefold())


def summary_links(review: ConfirmedReview, amounts: dict[str, int]) -> dict[str, str]:
    """Only an unambiguous matching section label AND printed amount link a summary.

    A repeated amount alone is not evidence of duplication. Detail sums are checked
    later; missing detail rows must still fail reconciliation.
    """
    links = {}
    for subtotal in (line for line in review.lines if line.role == "subtotal" and line.group):
        key = _section_key(subtotal.group)
        peers = [line for line in review.lines if line.role == "subtotal" and _section_key(line.group) == key]
        summaries = [line for line in review.lines if line.role == "charge"
                     and line.source.page != subtotal.source.page
                     and _section_key(line.description) == key and not line.breakdown
                     and (not line.group or _section_key(line.group) == key)]
        if len(peers) != 1 or len(summaries) != 1:
            continue
        summary = summaries[0]
        details = [line for line in review.lines if line.id != summary.id
                   and line.role in SUMMED_ROLES and _section_key(line.group) == key]
        if not details:
            continue
        if amounts[summary.id] != amounts[subtotal.id]:
            raise ReviewError(f"The summary and subtotal for {subtotal.group!r} show different amounts. "
                              "Check both against the bill before continuing.")
        links[summary.id] = subtotal.id
    return links


def build_case(review: ConfirmedReview) -> tuple[BillCase, dict[str, int]]:
    """Validate roles and structure, then build a calculation case. Returns amounts by line ID."""

    ids = [line.id for line in review.lines]
    if len(ids) != len(set(ids)):
        raise ReviewError("line IDs must be unique")
    amounts: dict[str, int] = {}
    groups: dict[str, str] = {}  # normalized key -> first display label
    line_groups: dict[str, str | None] = {}
    for line in review.lines:
        if line.currency.upper() != review.currency:
            raise ReviewError(f"line {line.id} currency differs from the review currency; currencies are never combined")
        _check_label(line.description, "label")
        amount = parse_confirmed_amount(line.raw_amount, decimal_separator=review.decimal_separator, currency=review.currency)
        if line.role == "discount" and amount >= 0:
            raise ReviewError(
                f"discount {line.description!r} must be entered as a negative amount (for example -200.00); "
                "Kill Bill does not flip signs for you"
            )
        if line.role == "charge" and amount < 0:
            raise ReviewError(f"charge {line.description!r} is negative; mark it as a discount if it reduces the bill")
        if line.questioned and line.role not in QUESTIONABLE_ROLES:
            raise ReviewError("only charge or discount lines can be asked about in the message")
        amounts[line.id] = amount
        key = None
        if line.group and line.group.strip():
            label = _check_label(line.group, "group")
            key = label.casefold()
            groups.setdefault(key, label)
        line_groups[line.id] = key

    summaries = summary_links(review, amounts)
    summed = [line for line in review.lines if line.role in SUMMED_ROLES and line.id not in summaries]
    totals = [line for line in review.lines if line.role == "total"]
    subtotals = [line for line in review.lines if line.role == "subtotal"]
    if not summed:
        raise ReviewError("confirm at least one charge, discount or adjustment line")
    if len(totals) > 1:
        raise ReviewError("confirm at most one printed grand total; mark the others as subtotals or leave them out")
    if not totals and not subtotals:
        raise ReviewError("confirm the printed total (or a printed subtotal) so the arithmetic can be checked")

    printed_by_group: dict[str, ConfirmedReviewLine] = {}
    for line in subtotals:
        key = line_groups[line.id]
        if key is None:
            raise ReviewError(f"subtotal {line.description!r} needs a group naming the lines it covers")
        if key in printed_by_group:
            raise ReviewError(f"group {groups[key]!r} has more than one subtotal")
        printed_by_group[key] = line

    reconciliations = []
    for index, (key, label) in enumerate(groups.items(), start=1):
        members = tuple(line.id for line in summed if line_groups[line.id] == key)
        printed = printed_by_group.get(key)
        if not members:
            if printed is None:
                continue  # A reference summary's section is not another calculation.
            raise ReviewError(f"Choose which rows belong to section {label!r}: open its Printed subtotal row, "
                              "tick the charges and discounts it covers, then use those rows for this section.")
        reconciliations.append(
            Reconciliation(
                id=f"group-{index}",
                label=label,
                line_ids=members,
                expected_minor=None if printed is None else amounts[printed.id],
                printed_line_id=None if printed is None else printed.id,
            )
        )

    expected = None
    if review.expected_amount and review.expected_amount.strip():
        expected = parse_confirmed_amount(
            review.expected_amount, decimal_separator=review.decimal_separator, currency=review.currency
        )

    case = BillCase(
        schema_version=1,
        case_id="confirmed-review",
        provider="not recorded",
        document_kind="confirmed_review",
        currency=review.currency,
        displayed_total_minor=amounts[totals[0].id] if totals else None,
        expected_minor=expected,
        expectation_source="user-entered expectation; supporting evidence not verified" if expected is not None else None,
        # A remembered or typed price is never treated as verified evidence in this flow.
        comparison_evidence_verified=False,
        lines=tuple(
            LineItem(
                id=line.id,
                label=" ".join(line.description.split()),
                amount_minor=amounts[line.id],
                currency=review.currency,
                source_ref=f"page-{line.source.page}:{line.source.precision}",
            )
            for line in review.lines
        ),
        total_line_ids=tuple(line.id for line in summed),
        reconciliations=tuple(reconciliations),
        missing_evidence=(),
        draft=DraftSpec(template="checks_passed_summary", bindings={}),  # replaced after calculation
        displayed_total_line_id=totals[0].id if totals else None,
    )
    return case, amounts


@dataclass(frozen=True)
class RowCheck:
    line_id: str
    label: str
    what: str  # "row_amount" or "taxable_value"
    computed_minor: int
    printed_minor: int
    formula: str
    # The printed quantity or rate is itself rounded (e.g. "5,81 months"), so the printed columns cannot reproduce
    # the row exactly. A difference of at most ROW_ROUNDING_MINOR is then accepted, visibly; the row amount that is
    # added up is always the printed one, so totals stay exact.
    rounded_inputs: bool = False

    @property
    def rounding_only(self) -> bool:
        return self.rounded_inputs and 0 < abs(self.computed_minor - self.printed_minor) <= ROW_ROUNDING_MINOR

    @property
    def matches(self) -> bool:
        return self.computed_minor == self.printed_minor or self.rounding_only


ROW_ROUNDING_MINOR = 2

# Quantities written the bill's way (seen live 2026-10-19 on a Dutch energy bill: "1.783,00 kWh", "175 dagen",
# "5,81"): thousands separators and the bill's decimal mark, then an optional unit word.
QUANTITY_BY_MARK = {
    ",": re.compile(r"(\d{1,3}(?:\.\d{3})+(?:,\d{1,4})?|\d+(?:,\d{1,4})?)"),
    ".": re.compile(r"(\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?)"),
}
QUANTITY_UNIT = re.compile(r"\s*[A-Za-zÀ-ÿ³²/]{0,12}\.?")


def _quantity(raw: str, decimal_separator: str = ".") -> Decimal:
    text = raw.strip()
    match = QUANTITY_BY_MARK[decimal_separator].match(text)
    if match and QUANTITY_UNIT.fullmatch(text[match.end():]):
        thousands = "." if decimal_separator == "," else ","
        return Decimal(match.group(1).replace(thousands, "").replace(decimal_separator, "."))
    match = QUANTITY.fullmatch(text)  # a plain number such as 2.5 written with the other mark
    if not match:
        raise ReviewError(f"quantity {raw!r} must be a number such as 1, 2.5 or 1.783,00 (a unit like kWh may follow)")
    return Decimal(match.group(1).replace(",", "."))


def row_checks(review: ConfirmedReview, amounts: dict[str, int]) -> list[RowCheck]:
    """Check each row's printed columns. Only printed values are used; nothing is filled in."""
    money = lambda amount: format_minor(amount, review.currency)
    parse = lambda raw: parse_confirmed_amount(raw, decimal_separator=review.decimal_separator, currency=review.currency)
    checks: list[RowCheck] = []
    for line in review.lines:
        details = line.breakdown
        if details is None:
            continue
        if line.role not in SUMMED_ROLES:
            # Row columns only mean something on lines that are added up; on a printed subtotal or total they are
            # not checked (they used to block the whole review, seen live 2026-10-19).
            continue
        # A reduction (energy tax reduction, refund) is often printed as a positive rate times a quantity, with a
        # negative row amount. For discounts and adjustments the sign follows the row amount; the size is checked.
        reduction = line.role in ("discount", "adjustment")
        label = " ".join(line.description.split())
        value: int | None = None
        text = ""
        rounded = False
        if details.unit_price and details.unit_price.strip():
            # The rate may have more than two decimals; only the row result is rounded to cents, as bills do.
            rate = parse_rate(details.unit_price, decimal_separator=review.decimal_separator, currency=review.currency)
            rate_text = f"{review.currency} {format(rate.normalize(), 'f')}" if rate.as_tuple().exponent < -2 else money(int(rate * 100))
            rounded = rate.normalize().as_tuple().exponent < -2  # a rate like 0,09161 (a 2-decimal price is exact)
            if details.quantity and details.quantity.strip():
                quantity = _quantity(details.quantity, review.decimal_separator)
                rounded = rounded or quantity != quantity.to_integral_value()
                value = int((rate * 100 * quantity).to_integral_value(ROUND_HALF_UP))
                text = f"{format(quantity.normalize(), 'f')} × {rate_text}"
            else:
                value, text = int((rate * 100).to_integral_value(ROUND_HALF_UP)), rate_text
            if details.discount and details.discount.strip():
                # A discount column always reduces the row; its printed sign is not needed to know that.
                discount = abs(parse(details.discount))
                value -= discount
                text += f" − {money(discount)}"
        if details.taxable_value and details.taxable_value.strip():
            taxable = parse(details.taxable_value)
            if value is not None:
                if reduction and (value < 0) != (taxable < 0):
                    value, text = -value, f"−({text})"
                checks.append(RowCheck(line.id, label, "taxable_value", value, taxable, f"{text} = {money(value)}"))
            value, text = taxable, money(taxable)
        if value is None:
            continue  # no price or taxable value printed: nothing to recompute
        for raw_tax in details.taxes:
            if raw_tax.strip():
                tax = parse(raw_tax)
                value += tax
                text += f" + {money(tax)}"
        if reduction and (value < 0) != (amounts[line.id] < 0):
            value, text = -value, f"−({text})"
        check = RowCheck(line.id, label, "row_amount", value, amounts[line.id], f"{text} = {money(value)}", rounded)
        if check.rounding_only:
            check = RowCheck(line.id, label, "row_amount", value, amounts[line.id],
                             f"{text} = {money(value)} ≈ {money(amounts[line.id])} printed: the printed quantity or "
                             f"rate is rounded, so a difference of {money(abs(value - amounts[line.id]))} is expected", rounded)
        checks.append(check)
    return checks


def _choose_template(
    review: ConfirmedReview, case: BillCase, failed_rows: list[RowCheck]
) -> tuple[DraftSpec, str | None, tuple[str, ...]]:
    outcome = calculate(case)
    questioned = tuple(line.id for line in review.lines if line.questioned and line.id in case.total_line_ids)
    wanted = review.message_type
    has_difference = outcome.difference_minor not in (None, 0)
    missing: list[str] = []
    if case.expected_minor is None:
        missing.append("expected amount (not entered), so only the bill's own arithmetic was checked")
    elif has_difference:
        missing.append("written offer, quote or checkout record showing the expected amount")

    if outcome.arithmetic_status == "mismatch" or failed_rows:
        note = None
        if wanted != "automatic":
            note = "The printed figures do not add up, so the message reports that instead of the type you chose."
        missing.append("re-check of every confirmed amount against the bill (a typing or reading error has the same effect)")
        rows = [
            {"line_id": row.line_id, "label": row.label, "what": row.what,
             "computed_minor": row.computed_minor, "printed_minor": row.printed_minor, "formula": row.formula}
            for row in failed_rows
        ]
        return DraftSpec("arithmetic_mismatch", {"row_failures": rows}), note, tuple(missing)

    if wanted == "automatic":
        if not has_difference:
            wanted = "checks_passed_summary"
        elif review.earlier_period_group:
            wanted = "period_clarification"
        else:
            wanted = "quote_difference"

    if wanted == "checks_passed_summary":
        if has_difference:
            raise ReviewError("a no-issue summary cannot hide the difference from your expected amount; choose another message type")
        return DraftSpec("checks_passed_summary", {}), None, tuple(missing)
    if wanted in {"quote_difference", "fee_disclosure"}:
        if not has_difference:
            raise ReviewError("this message type needs an expected amount that differs from the calculated total")
        if wanted == "fee_disclosure":
            if not questioned:
                raise ReviewError("tick 'Ask about this line' on at least one fee for this message type")
            missing.append("evidence of where these fees were shown before payment")
            return DraftSpec("fee_disclosure", {"fee_line_ids": list(questioned)}), None, tuple(missing)
        return DraftSpec("quote_difference", {"questioned_line_ids": list(questioned)}), None, tuple(missing)
    # period_clarification
    by_label = {group.label.casefold(): group for group in case.reconciliations}
    earlier = (review.earlier_period_group or "").strip()
    if len(case.reconciliations) != 2 or earlier.casefold() not in by_label:
        raise ReviewError("an earlier-period message needs exactly two groups and the earlier group's name")
    prior = by_label[earlier.casefold()]
    current = next(group for group in case.reconciliations if group is not prior)
    missing.append(f"previous invoice or payment record covering {prior.label}")
    return (
        DraftSpec(
            "period_clarification",
            {
                "current_period_group": current.id,
                "current_period_label": current.label,
                "prior_period_group": prior.id,
                "prior_period_label": prior.label,
            },
        ),
        None,
        tuple(missing),
    )


def _display_formula(amounts: tuple[int, ...], result: int, currency: str) -> str:
    parts = []
    for index, amount in enumerate(amounts):
        number = format_minor(abs(amount), currency)
        parts.append(("- " if amount < 0 else "+ ") + number if index else ("-" if amount < 0 else "") + number)
    return f"{' '.join(parts)} = {format_minor(result, currency)}"


def analyze_confirmed_review(payload: dict, ai_suggestion: dict | None = None) -> dict:
    """Validate a confirmed browser payload and return calculations plus the required draft.

    ``ai_suggestion`` is an already-validated model explanation (see gap_llm). It may only pre-select
    which confirmed lines the message asks about and add one digit-free question sentence; it never
    changes an amount, a calculation or the verdict.
    """

    try:
        review = ConfirmedReview.model_validate(payload)
    except ValueError as exc:  # pydantic.ValidationError subclasses ValueError
        raise ReviewError(f"confirmed review is invalid: {exc}") from exc
    questioned_by = "you" if any(line.questioned for line in review.lines) else None
    if ai_suggestion and questioned_by is None:
        suggested = set(ai_suggestion.get("line_ids", ()))
        if suggested:
            review = review.model_copy(update={"lines": tuple(
                line.model_copy(update={"questioned": True}) if line.id in suggested and line.role in SUMMED_ROLES else line
                for line in review.lines
            )})
            questioned_by = "ai"
    case, amounts = build_case(review)
    rows = row_checks(review, amounts)
    failed_rows = [row for row in rows if not row.matches]
    outcome = calculate(case)
    matches, ambiguous = find_exact_explanations(case, outcome)
    money = lambda amount: None if amount is None else format_minor(amount, review.currency)
    lines = {line.id: line for line in review.lines}
    printed_problem = outcome.arithmetic_status == "mismatch" or bool(failed_rows)
    if printed_problem and not review.printed_figures_rechecked:
        # Outcome A: almost always a reading or confirmation mistake. No verdict, no draft, no AI.
        return _needs_recheck(review, case, outcome, amounts, rows, matches, money, lines)

    spec, note, missing = _choose_template(review, case, failed_rows)
    case = replace(case, draft=spec, missing_evidence=missing)
    try:
        result = analyze_case(case)
    except DraftError as exc:
        raise ReviewError(str(exc)) from exc
    if failed_rows:  # rows are checked here, not in the fixture engine; a failed row is a printed mismatch
        result = replace(result, verdict="verified_mismatch", arithmetic_status="mismatch")

    draft_text = result.draft.text
    appended = None
    # Only the checked question (no numbers, no accusations) may join the message the person sends.
    if ai_suggestion and ai_suggestion.get("questionForMessage") and result.verdict != "checks_passed":
        appended = ai_suggestion["questionForMessage"]
        draft_text = f"{draft_text} {appended}"
    known = set(amounts)
    support = set(result.draft.supporting_line_ids)
    if not support or not support <= known:
        raise ReviewError("draft is not linked to confirmed lines; refusing to show it")

    output = {
        **_common(review, case, outcome, amounts, rows, matches, ambiguous, money, lines),
        "status": "complete",
        "verdict": result.verdict,
        "arithmeticStatus": result.arithmetic_status,
        "comparisonStatus": result.comparison_status,
        "messageType": spec.template,
        "messageTypeNote": note,
        "missingEvidence": list(result.missing_evidence),
        "gap": {
            # Only outcome C (arithmetic fine, differs from the expectation) is sent for an AI explanation.
            "needsExplanation": result.comparison_status == "unresolved" and result.arithmetic_status == "checks_passed",
            "ambiguous": ambiguous,
            "exactMatches": _match_list(matches, money, lines),
        },
        "questionedBy": questioned_by,
        "aiAppendedQuestion": appended,
        "draft": {
            "text": draft_text,
            "supportingLineIds": list(result.draft.supporting_line_ids),
            "numericFacts": [
                {**asdict(fact), "source_line_ids": list(fact.source_line_ids), "display": money(fact.amount_minor)}
                for fact in result.draft.numeric_facts
            ],
        },
    }
    for line in output["lines"]:
        line["inMessage"] = line["id"] in support
    return output


def _match_list(matches, money, lines) -> list[dict]:
    return [
        {
            "kind": match.kind,
            "amount": money(match.amount_minor),
            "lineIds": list(match.line_ids),
            "groupLabel": match.group_label,
            "labels": [" ".join(lines[line_id].description.split()) for line_id in match.line_ids],
        }
        for match in matches
    ]


def _common(review, case, outcome, amounts, rows, matches, ambiguous, money, lines) -> dict:
    summaries = summary_links(review, amounts)
    precision_counts = {name: 0 for name in ("exact", "table", "page")}
    for line in review.lines:
        precision_counts[line.source.precision] += 1
    calculations = {calculation.id: calculation for calculation in outcome.calculations}
    return {
        "schemaVersion": 2,
        "currency": review.currency,
        "amounts": {
            "calculatedTotal": money(outcome.calculated_total_minor),
            "printedTotal": money(case.displayed_total_minor),
            "expected": money(case.expected_minor),
            "difference": money(outcome.difference_minor),
        },
        "minor": {
            "calculatedTotal": outcome.calculated_total_minor,
            "printedTotal": case.displayed_total_minor,
            "expected": case.expected_minor,
            "difference": outcome.difference_minor,
        },
        "totalFormula": _display_formula(
            tuple(amounts[line_id] for line_id in case.total_line_ids), outcome.calculated_total_minor, review.currency
        ),
        "groups": [
            {
                "label": calculation.label,
                "amount": money(calculation.result_minor),  # the section's sum, calculated by Python
                "lineIds": list(calculation.operand_line_ids),
                "formula": _display_formula(calculation.operand_amounts_minor, calculation.result_minor, review.currency),
                "printed": money(calculation.expected_minor),
                "checked": calculation.matches is not None,
                "matches": calculation.matches,
            }
            for calculation in calculations.values()
        ],
        "rowChecks": [
            {
                "lineId": row.line_id, "label": row.label, "what": row.what, "formula": row.formula,
                "printed": money(row.printed_minor), "matches": row.matches,
            }
            for row in rows
        ],
        "lines": [
            {
                "id": line.id,
                "role": line.role,
                "summaryOf": summaries.get(line.id),
                "countedInTotal": line.id in case.total_line_ids,
                "group": line.group,
                "description": " ".join(line.description.split()),
                "amount": money(amounts[line.id]),
                "amountMinor": amounts[line.id],
                "extractor": line.extractor,
                # None for manual entries: there was no machine reading to correct.
                "corrected": None if line.extracted_raw_amount is None else line.extracted_raw_amount.strip() != line.raw_amount.strip(),
                "source": {"page": line.source.page, "precision": line.source.precision, "locatedBy": line.source.located_by},
                "rowDetail": next((row.formula for row in rows if row.line_id == line.id and row.what == "row_amount"), None),
                "inMessage": False,
            }
            for line in lines.values()
        ],
        "sourcePrecision": precision_counts,
    }


def _gap_hint(gap: int, line_ids, amounts, lines, money) -> str:
    """Say which way the figures are off and what usually causes it. Every number comes from code."""
    size = money(abs(gap))
    if gap > 0:
        text = f"That is {size} too much: a discount of {size} may be missing, or a charge may be counted twice."
    else:
        text = f"That is {size} too little: a charge of {size} may be missing, or a discount may be counted twice."
    # A line equal to the surplus is the classic double count; amounts are compared exactly, never rounded.
    same = [line_id for line_id in line_ids if amounts[line_id] == gap]
    if same:
        names = ", ".join(" ".join(lines[line_id].description.split()) for line_id in same)
        text += f" {names} equals the difference exactly; check that it appears on the bill only once."
    return text + " Compare these lines with the bill, or read the page again."


def _needs_recheck(review, case, outcome, amounts, rows, matches, money, lines) -> dict:
    """Outcome A: the confirmed figures do not add up. Point at the most likely reading mistakes."""
    suspects: list[dict] = []
    for row in rows:
        if not row.matches:
            what = "taxable value" if row.what == "taxable_value" else "row amount"
            suspects.append({"lineIds": [row.line_id], "text":
                f"{row.label}: the printed columns give {row.formula.rsplit(' = ', 1)[-1]} ({row.formula}), "
                f"but the {what} reads {money(row.printed_minor)}. Check the price, discount, tax and amount on this row."})
    for calculation in outcome.calculations:
        if calculation.matches is False:
            gap = calculation.result_minor - calculation.expected_minor
            suspects.append({"lineIds": list(calculation.operand_line_ids), "text":
                f"Section {calculation.label}: the lines add up to {money(calculation.result_minor)}, but the printed subtotal "
                f"is {money(calculation.expected_minor)}. {_gap_hint(gap, calculation.operand_line_ids, amounts, lines, money)}"})
    row_discounts = {}
    for line in review.lines:
        if line.breakdown and line.breakdown.discount and line.breakdown.discount.strip():
            row_discounts[abs(parse_confirmed_amount(line.breakdown.discount, decimal_separator=review.decimal_separator,
                                                     currency=review.currency))] = line
    for line in review.lines:
        if line.role == "discount" and abs(amounts[line.id]) in row_discounts:
            row = row_discounts[abs(amounts[line.id])]
            suspects.append({"lineIds": [line.id, row.id], "text":
                f"Discount {' '.join(line.description.split())} ({money(amounts[line.id])}) is the same as the discount "
                f"already inside the row {' '.join(row.description.split())}. It is probably counted twice: untick it."})
    for match in matches:
        if match.kind == "equals_total_gap":
            names = " + ".join(" ".join(lines[line_id].description.split()) for line_id in match.line_ids)
            suspects.append({"lineIds": list(match.line_ids), "text":
                f"{names} adds up to exactly the gap of {money(match.amount_minor)} between the confirmed lines and the "
                "printed total. It may be counted twice, or already included in another line."})
    if not suspects and case.displayed_total_minor is not None:
        gap = outcome.calculated_total_minor - case.displayed_total_minor
        suspects.append({"lineIds": [], "text":
            f"The confirmed lines add up to {money(outcome.calculated_total_minor)}, but the printed total is "
            f"{money(case.displayed_total_minor)}. {_gap_hint(gap, case.total_line_ids, amounts, lines, money)}"})
    all_pages = sorted({line.source.page for line in review.lines})
    for suspect in suspects:
        # Pages to re-read; every line ID belongs to a confirmed line, so its page is known.
        suspect["pages"] = sorted({lines[line_id].source.page for line_id in suspect["lineIds"]}) or all_pages
    return {
        **_common(review, case, outcome, amounts, rows, matches, False, money, lines),
        "status": "needs_recheck",
        "verdict": None,
        "arithmeticStatus": "mismatch",
        "comparisonStatus": None,
        "messageType": None,
        "messageTypeNote": None,
        "suspects": suspects,
        "missingEvidence": [],
        "gap": {"needsExplanation": False, "ambiguous": False, "exactMatches": _match_list(matches, money, lines)},
        "questionedBy": None,
        "aiAppendedQuestion": None,
        "draft": None,
    }
